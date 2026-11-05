// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "./FlashboysHolderRewardsVault.sol";

/// @title FlashboysFeeRouter
/// @notice Independent FLASHBOYS fee router. It has no Pons interfaces or
///         escrow dependency. Authorized FLASHBOYS curve/pool contracts send
///         collected trading fees here; 60% is paid to the creator and 40% is
///         reserved in the holder rewards vault.
contract FlashboysFeeRouter {
    uint256 public constant CREATOR_BPS = 6_000;
    uint256 public constant HOLDER_REWARDS_BPS = 4_000;
    uint256 private constant BPS = 10_000;

    address public immutable creator;
    FlashboysHolderRewardsVault public immutable holderRewardsVault;
    address public immutable factory;
    mapping(address => bool) public feeCollector;
    uint256 private entered;

    event FeeCollectorUpdated(address indexed collector, bool enabled);
    event NativeFeeDistributed(address indexed collector, uint256 total, uint256 creatorAmount, uint256 holderAmount);
    event TokenFeeDistributed(address indexed collector, address indexed asset, uint256 total, uint256 creatorAmount, uint256 holderAmount);

    error Unauthorized();
    error ZeroAddress();
    error ReentrantCall();
    error TransferFailed();
    error InvalidAmount();

    constructor(address creator_, address factory_) {
        if (creator_ == address(0) || factory_ == address(0)) revert ZeroAddress();
        creator = creator_;
        factory = factory_;
        holderRewardsVault = new FlashboysHolderRewardsVault(creator_);
    }

    modifier onlyCreator() {
        if (msg.sender != creator && msg.sender != factory) revert Unauthorized();
        _;
    }

    modifier onlyCollector() {
        if (!feeCollector[msg.sender]) revert Unauthorized();
        _;
    }

    modifier nonReentrant() {
        if (entered != 0) revert ReentrantCall();
        entered = 1;
        _;
        entered = 0;
    }

    /// @notice Authorize a FLASHBOYS bonding curve or post-graduation fee hook.
    function setFeeCollector(address collector, bool enabled) external onlyCreator {
        if (collector == address(0)) revert ZeroAddress();
        feeCollector[collector] = enabled;
        emit FeeCollectorUpdated(collector, enabled);
    }

    /// @notice Called by an authorized curve/pool with the native trading fee.
    /// The transaction reverts atomically if either payout cannot be completed.
    function collectNativeFee() external payable onlyCollector nonReentrant {
        if (msg.value == 0) revert InvalidAmount();
        uint256 creatorAmount = (msg.value * CREATOR_BPS) / BPS;
        uint256 holderAmount = msg.value - creatorAmount;
        (bool creatorOk,) = payable(creator).call{value: creatorAmount}("");
        if (!creatorOk) revert TransferFailed();
        (bool holderOk,) = payable(address(holderRewardsVault)).call{value: holderAmount}("");
        if (!holderOk) revert TransferFailed();
        emit NativeFeeDistributed(msg.sender, msg.value, creatorAmount, holderAmount);
    }

    /// @notice Authorized curve/pool pays an ERC-20 trading fee into the same split.
    function collectTokenFee(address asset, uint256 amount) external onlyCollector nonReentrant {
        if (asset == address(0)) revert ZeroAddress();
        if (amount == 0) revert InvalidAmount();
        uint256 creatorAmount = (amount * CREATOR_BPS) / BPS;
        uint256 holderAmount = amount - creatorAmount;
        _safeTransferFrom(asset, msg.sender, creator, creatorAmount);
        _safeTransferFrom(asset, msg.sender, address(holderRewardsVault), holderAmount);
        emit TokenFeeDistributed(msg.sender, asset, amount, creatorAmount, holderAmount);
    }

    function _safeTransferFrom(address asset, address from, address to, uint256 amount) private {
        (bool ok, bytes memory data) = asset.call(
            abi.encodeWithSignature("transferFrom(address,address,uint256)", from, to, amount)
        );
        if (!ok || (data.length != 0 && !abi.decode(data, (bool)))) revert TransferFailed();
    }
}
