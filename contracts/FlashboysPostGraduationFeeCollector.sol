// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "./FlashboysFeeRouter.sol";

/// @title FlashboysPostGraduationFeeCollector
/// @notice Receives native-asset fees from a FLASHBOYS-controlled DEX pool or hook
/// and forwards them to the same independent 70/30 router used by the launch curve.
contract FlashboysPostGraduationFeeCollector {
    address public immutable creator;
    FlashboysFeeRouter public immutable feeRouter;
    address public pool;
    bool private entered;

    event PoolUpdated(address indexed pool);
    event GraduatedPoolFeeForwarded(address indexed pool, uint256 amount);

    error Unauthorized();
    error InvalidAmount();
    error ReentrantCall();

    constructor(address creator_, address router_) {
        if (creator_ == address(0) || router_ == address(0)) revert Unauthorized();
        creator = creator_;
        feeRouter = FlashboysFeeRouter(payable(router_));
    }

    function setPool(address pool_) external {
        if (msg.sender != creator || pool_ == address(0)) revert Unauthorized();
        pool = pool_;
        emit PoolUpdated(pool_);
    }

    function collect() external payable {
        if (msg.sender != pool) revert Unauthorized();
        if (entered) revert ReentrantCall();
        if (msg.value == 0) revert InvalidAmount();
        entered = true;
        feeRouter.collectNativeFee{value: msg.value}();
        entered = false;
        emit GraduatedPoolFeeForwarded(msg.sender, msg.value);
    }
}