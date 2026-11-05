// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "./RobinhoodFixedSupplyToken.sol";
import "./FlashboysFeeRouter.sol";
import "./FlashboysBondingCurve.sol";
import "./FlashboysPostGraduationFeeCollector.sol";

/// @title FlashboysFactory
/// @notice Creator-controlled factory for independent FLASHBOYS token launches.
contract FlashboysFactory {
    address public immutable creator;
    FlashboysFeeRouter public immutable feeRouter;
    address public graduationAdapter;
    uint16 public feeBps = 100; // 1% of each buy/sell amount
    uint256 public graduationThreshold = 10 ether;
    uint256 public virtualEthReserve = 1 ether;

    address[] public tokens;
    mapping(address => address) public curveForToken;
    mapping(address => address) public postGraduationCollectorForToken;

    event TokenCreated(
        address indexed creator,
        address indexed token,
        address indexed curve,
        address feeCollector,
        string name,
        string symbol
    );
    event GraduationAdapterUpdated(address indexed adapter);
    event LaunchParametersUpdated(uint16 feeBps, uint256 graduationThreshold, uint256 virtualEthReserve);

    error Unauthorized();
    error InvalidParameters();
    error TokenTransferFailed();

    constructor(address creator_) {
        if (creator_ == address(0)) revert InvalidParameters();
        creator = creator_;
        feeRouter = new FlashboysFeeRouter(creator_, address(this));
    }

    modifier onlyCreator() {
        if (msg.sender != creator) revert Unauthorized();
        _;
    }

    function setGraduationAdapter(address adapter) external onlyCreator {
        graduationAdapter = adapter;
        emit GraduationAdapterUpdated(adapter);
    }

    function setLaunchParameters(uint16 fee, uint256 threshold, uint256 virtualEth) external onlyCreator {
        if (fee == 0 || fee >= 1_000 || threshold == 0 || virtualEth == 0) revert InvalidParameters();
        feeBps = fee;
        graduationThreshold = threshold;
        virtualEthReserve = virtualEth;
        emit LaunchParametersUpdated(fee, threshold, virtualEth);
    }

    function createToken(
        string calldata name_,
        string calldata symbol_
    ) external onlyCreator returns (address tokenAddress, address curveAddress, address collectorAddress) {
        if (bytes(name_).length == 0 || bytes(symbol_).length == 0 || graduationAdapter == address(0)) revert InvalidParameters();

        RobinhoodFixedSupplyToken token = new RobinhoodFixedSupplyToken(name_, symbol_);
        FlashboysPostGraduationFeeCollector collector =
            new FlashboysPostGraduationFeeCollector(creator, address(feeRouter));
        FlashboysBondingCurve curve = new FlashboysBondingCurve(
            creator,
            address(token),
            address(feeRouter),
            graduationAdapter,
            feeBps,
            graduationThreshold,
            virtualEthReserve
        );

        uint256 supply = token.balanceOf(address(this));
        (bool ok, bytes memory data) = address(token).call(
            abi.encodeWithSignature("transfer(address,uint256)", address(curve), supply)
        );
        if (!ok || (data.length != 0 && !abi.decode(data, (bool)))) revert TokenTransferFailed();

        feeRouter.setFeeCollector(address(curve), true);
        feeRouter.setFeeCollector(address(collector), true);

        tokens.push(address(token));
        curveForToken[address(token)] = address(curve);
        postGraduationCollectorForToken[address(token)] = address(collector);

        emit TokenCreated(msg.sender, address(token), address(curve), address(collector), name_, symbol_);
        return (address(token), address(curve), address(collector));
    }

    function tokenCount() external view returns (uint256) {
        return tokens.length;
    }
}