// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "./FlashboysFeeRouter.sol";

interface IFlashboysFactoryView {
    function creator() external view returns (address);
    function feeRouter() external view returns (address);
    function curveForToken(address token) external view returns (address);
}

interface IERC20Flashboys {
    function balanceOf(address account) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
}

interface IWETHFlashboys is IERC20Flashboys {
    function deposit() external payable;
}

interface IUniswapV3FactoryFlashboys {
    function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address);
    function feeAmountTickSpacing(uint24 fee) external view returns (int24);
}

interface IUniswapV3PoolFlashboys {
    function slot0() external view returns (
        uint160 sqrtPriceX96,
        int24 tick,
        uint16 observationIndex,
        uint16 observationCardinality,
        uint16 observationCardinalityNext,
        uint8 feeProtocol,
        bool unlocked
    );
    function liquidity() external view returns (uint128);
}

interface INonfungiblePositionManagerFlashboys {
    struct MintParams {
        address token0;
        address token1;
        uint24 fee;
        int24 tickLower;
        int24 tickUpper;
        uint256 amount0Desired;
        uint256 amount1Desired;
        uint256 amount0Min;
        uint256 amount1Min;
        address recipient;
        uint256 deadline;
    }
    struct CollectParams {
        uint256 tokenId;
        address recipient;
        uint128 amount0Max;
        uint128 amount1Max;
    }
    function factory() external view returns (address);
    function createAndInitializePoolIfNecessary(
        address token0,
        address token1,
        uint24 fee,
        uint160 sqrtPriceX96
    ) external payable returns (address pool);
    function mint(MintParams calldata params)
        external payable returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1);
    function collect(CollectParams calldata params) external payable returns (uint256 amount0, uint256 amount1);
}

interface IERC721ReceiverFlashboys {
    function onERC721Received(address operator, address from, uint256 tokenId, bytes calldata data)
        external returns (bytes4);
}

/// @title FlashboysUniswapV3GraduationAdapter
/// @notice Migrates a FLASHBOYS bonding curve into a full-range Uniswap V3
///         token/WETH position. The position NFT stays permanently in this
///         contract. Anyone may harvest accrued fees; both fee assets are
///         routed through the independent FLASHBOYS 70/30 fee router.
contract FlashboysUniswapV3GraduationAdapter is IERC721ReceiverFlashboys {
    address public constant POSITION_MANAGER = 0x73991a25C818Bf1f1128dEAaB1492D45638DE0D3;
    address public constant WETH = 0x0bd7d308f8e1639fab988df18a8011f41eacad73;
    uint24 public constant POOL_FEE = 10_000; // 1%
    int24 public constant MIN_TICK = -887200;
    int24 public constant MAX_TICK = 887200;
    uint256 private constant Q192 = 1 << 192;
    uint256 private constant BPS = 10_000;

    IFlashboysFactoryView public immutable launchFactory;
    INonfungiblePositionManagerFlashboys public immutable positionManager;
    IUniswapV3FactoryFlashboys public immutable uniswapFactory;
    IWETHFlashboys public immutable weth;
    FlashboysFeeRouter public immutable feeRouter;

    mapping(address => address) public poolForToken;
    mapping(address => uint256) public positionTokenId;
    mapping(address => uint128) public positionLiquidity;
    bool private entered;

    event GraduatedToUniswapV3(
        address indexed token,
        address indexed pool,
        uint256 indexed positionTokenId,
        uint128 liquidity,
        uint256 tokenAmount,
        uint256 ethAmount,
        uint256 amount0Used,
        uint256 amount1Used
    );
    event FeesHarvested(address indexed token, address indexed pool, uint256 amount0, uint256 amount1);
    event DustReturned(address indexed token, uint256 tokenAmount, uint256 wethAmount);

    error Unauthorized();
    error InvalidConfiguration();
    error InvalidGraduation();
    error PoolAlreadySeeded();
    error PoolPriceMismatch();
    error InvalidPoolConfiguration();
    error TransferFailed();
    error ReentrantCall();
    error NoPosition();

    modifier nonReentrant() {
        if (entered) revert ReentrantCall();
        entered = true;
        _;
        entered = false;
    }

    constructor(address factory_) {
        if (factory_ == address(0) || factory_.code.length == 0 || block.chainid != 4663) {
            revert InvalidConfiguration();
        }
        launchFactory = IFlashboysFactoryView(factory_);
        positionManager = INonfungiblePositionManagerFlashboys(POSITION_MANAGER);
        if (POSITION_MANAGER.code.length == 0 || WETH.code.length == 0) revert InvalidConfiguration();
        address router = INonfungiblePositionManagerFlashboys(POSITION_MANAGER).factory();
        if (router == address(0) || router.code.length == 0) revert InvalidConfiguration();
        uniswapFactory = IUniswapV3FactoryFlashboys(router);
        weth = IWETHFlashboys(WETH);
        feeRouter = FlashboysFeeRouter(payable(IFlashboysFactoryView(factory_).feeRouter()));
        if (address(feeRouter).code.length == 0) revert InvalidConfiguration();
        if (uniswapFactory.feeAmountTickSpacing(POOL_FEE) != 200) revert InvalidPoolConfiguration();
    }

    /// @notice Called atomically by the curve when its graduation threshold is met.
    function onGraduate(address token, uint256 tokenAmount, address feeCollector)
        external payable nonReentrant
    {
        if (msg.sender != launchFactory.curveForToken(token) || msg.sender == address(0)) revert Unauthorized();
        if (feeCollector != address(feeRouter) || feeCollector != launchFactory.feeRouter()) revert Unauthorized();
        if (tokenAmount == 0 || msg.value == 0 || positionTokenId[token] != 0) revert InvalidGraduation();
        if (token.code.length == 0 || IERC20Flashboys(token).balanceOf(address(this)) < tokenAmount) {
            revert InvalidGraduation();
        }

        weth.deposit{value: msg.value}();
        address token0 = token < WETH ? token : WETH;
        address token1 = token < WETH ? WETH : token;
        uint256 amount0Desired = token0 == token ? tokenAmount : msg.value;
        uint256 amount1Desired = token1 == token ? tokenAmount : msg.value;
        uint160 initialSqrtPriceX96 = _sqrtPriceX96(amount0Desired, amount1Desired);

        address existingPool = uniswapFactory.getPool(token0, token1, POOL_FEE);
        if (existingPool != address(0)) {
            (uint160 existingPrice,,,,,,) = IUniswapV3PoolFlashboys(existingPool).slot0();
            if (IUniswapV3PoolFlashboys(existingPool).liquidity() != 0) revert PoolAlreadySeeded();
            if (existingPrice != 0 && !_withinBps(existingPrice, initialSqrtPriceX96, 5)) {
                revert PoolPriceMismatch();
            }
        }

        address pool = positionManager.createAndInitializePoolIfNecessary(
            token0, token1, POOL_FEE, initialSqrtPriceX96
        );
        (uint160 actualPrice,,,,,,) = IUniswapV3PoolFlashboys(pool).slot0();
        if (!_withinBps(actualPrice, initialSqrtPriceX96, 5)) revert PoolPriceMismatch();
        if (IUniswapV3PoolFlashboys(pool).liquidity() != 0) revert PoolAlreadySeeded();

        _approve(token, POSITION_MANAGER, tokenAmount);
        _approve(WETH, POSITION_MANAGER, msg.value);

        (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1) =
            positionManager.mint(
                INonfungiblePositionManagerFlashboys.MintParams({
                    token0: token0,
                    token1: token1,
                    fee: POOL_FEE,
                    tickLower: MIN_TICK,
                    tickUpper: MAX_TICK,
                    amount0Desired: amount0Desired,
                    amount1Desired: amount1Desired,
                    amount0Min: 0,
                    amount1Min: 0,
                    recipient: address(this),
                    deadline: block.timestamp
                })
            );
        if (liquidity == 0 || tokenId == 0) revert InvalidGraduation();

        positionTokenId[token] = tokenId;
        positionLiquidity[token] = liquidity;
        poolForToken[token] = pool;

        uint256 tokenDust = IERC20Flashboys(token).balanceOf(address(this));
        uint256 wethDust = weth.balanceOf(address(this));
        if (tokenDust > 0) _safeTransfer(token, launchFactory.creator(), tokenDust);
        if (wethDust > 0) _safeTransfer(WETH, launchFactory.creator(), wethDust);

        emit GraduatedToUniswapV3(
            token, pool, tokenId, liquidity, tokenAmount, msg.value, amount0, amount1
        );
        if (tokenDust > 0 || wethDust > 0) emit DustReturned(token, tokenDust, wethDust);
    }

    /// @notice Permissionless fee collection. The LP principal cannot be removed
    ///         because this adapter exposes no decrease-liquidity or NFT-transfer method.
    function harvest(address token) external nonReentrant returns (uint256 amount0, uint256 amount1) {
        uint256 tokenId = positionTokenId[token];
        if (tokenId == 0) revert NoPosition();
        (amount0, amount1) = positionManager.collect(
            INonfungiblePositionManagerFlashboys.CollectParams({
                tokenId: tokenId,
                recipient: address(this),
                amount0Max: type(uint128).max,
                amount1Max: type(uint128).max
            })
        );

        address pool = poolForToken[token];
        (address token0, address token1) = token < WETH ? (token, WETH) : (WETH, token);
        if (amount0 > 0) {
            address asset0 = token0;
            _approve(asset0, address(feeRouter), amount0);
            feeRouter.collectTokenFee(asset0, amount0);
        }
        if (amount1 > 0) {
            address asset1 = token1;
            _approve(asset1, address(feeRouter), amount1);
            feeRouter.collectTokenFee(asset1, amount1);
        }
        emit FeesHarvested(token, pool, amount0, amount1);
    }

    function onERC721Received(address, address, uint256, bytes calldata)
        external view returns (bytes4)
    {
        if (msg.sender != POSITION_MANAGER) revert Unauthorized();
        return IERC721ReceiverFlashboys.onERC721Received.selector;
    }

    function _sqrtPriceX96(uint256 amount0, uint256 amount1) private pure returns (uint160) {
        if (amount0 == 0 || amount1 == 0) revert InvalidGraduation();
        uint256 ratioX192 = _mulDiv(amount1, Q192, amount0);
        uint256 root = _sqrt(ratioX192);
        if (root == 0 || root > type(uint160).max) revert InvalidGraduation();
        return uint160(root);
    }

    function _withinBps(uint160 actual, uint160 expected, uint256 toleranceBps) private pure returns (bool) {
        if (actual == 0 || expected == 0) return false;
        uint256 difference = actual > expected ? actual - expected : expected - actual;
        return difference * BPS <= uint256(expected) * toleranceBps;
    }

    function _approve(address asset, address spender, uint256 amount) private {
        (bool ok, bytes memory data) = asset.call(abi.encodeWithSignature("approve(address,uint256)", spender, 0));
        if (!ok || (data.length != 0 && !abi.decode(data, (bool)))) revert TransferFailed();
        (ok, data) = asset.call(abi.encodeWithSignature("approve(address,uint256)", spender, amount));
        if (!ok || (data.length != 0 && !abi.decode(data, (bool)))) revert TransferFailed();
    }

    function _safeTransfer(address asset, address to, uint256 amount) private {
        (bool ok, bytes memory data) = asset.call(abi.encodeWithSignature("transfer(address,uint256)", to, amount));
        if (!ok || (data.length != 0 && !abi.decode(data, (bool)))) revert TransferFailed();
    }

    function _mulDiv(uint256 a, uint256 b, uint256 denominator) private pure returns (uint256 result) {
        unchecked {
            uint256 prod0;
            uint256 prod1;
            assembly {
                let mm := mulmod(a, b, not(0))
                prod0 := mul(a, b)
                prod1 := sub(sub(mm, prod0), lt(mm, prod0))
            }
            if (prod1 == 0) return prod0 / denominator;
            require(denominator > prod1, "MULDIV_OVERFLOW");
            uint256 remainder;
            assembly {
                remainder := mulmod(a, b, denominator)
                prod1 := sub(prod1, gt(remainder, prod0))
                prod0 := sub(prod0, remainder)
            }
            uint256 twos = denominator & (~denominator + 1);
            assembly {
                denominator := div(denominator, twos)
                prod0 := div(prod0, twos)
                twos := add(div(sub(0, twos), twos), 1)
            }
            prod0 |= prod1 * twos;
            uint256 inverse = (3 * denominator) ^ 2;
            inverse *= 2 - denominator * inverse;
            inverse *= 2 - denominator * inverse;
            inverse *= 2 - denominator * inverse;
            inverse *= 2 - denominator * inverse;
            inverse *= 2 - denominator * inverse;
            inverse *= 2 - denominator * inverse;
            result = prod0 * inverse;
            return result;
        }
    }

    function _sqrt(uint256 value) private pure returns (uint256 result) {
        if (value == 0) return 0;
        result = value;
        uint256 candidate = (value >> 1) + 1;
        while (candidate < result) {
            result = candidate;
            candidate = (value / candidate + candidate) >> 1;
        }
    }
}
