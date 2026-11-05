// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title RobinhoodCreatorFeeSplitter
/// @notice Splits fees that have ALREADY been routed to the creator side of a
///         Pons-compatible fee source. It does not collect pool fees or change
///         the upstream creator/protocol split.
/// @dev Default allocation of the creator-side proceeds: 80% creator / 20%
///      holder-rewards vault. If the upstream source uses Pons' current 70/30
///      split, the resulting total-fee allocation is 56% creator, 14% holders,
///      and 30% protocol. The holder vault is a separate, trusted contract.
contract RobinhoodCreatorFeeSplitter {
    uint256 public constant CREATOR_BPS = 8_000;
    uint256 public constant HOLDER_REWARDS_BPS = 2_000;
    uint256 private constant BPS_DENOMINATOR = 10_000;

    address public immutable creator;
    address public immutable holderRewardsVault;

    uint256 private entered;

    event NativeFeesDistributed(uint256 total, uint256 creatorAmount, uint256 holderRewardsAmount);
    event TokenFeesDistributed(address indexed token, uint256 total, uint256 creatorAmount, uint256 holderRewardsAmount);

    error ZeroAddress();
    error InvalidVault();
    error ReentrantCall();
    error NativeTransferFailed();
    error TokenTransferFailed();

    constructor(address creator_, address holderRewardsVault_) {
        if (creator_ == address(0) || holderRewardsVault_ == address(0)) revert ZeroAddress();
        if (creator_ == holderRewardsVault_) revert InvalidVault();
        creator = creator_;
        holderRewardsVault = holderRewardsVault_;
    }

    modifier nonReentrant() {
        if (entered != 0) revert ReentrantCall();
        entered = 1;
        _;
        entered = 0;
    }

    /// @notice Allows a fee source or automation to send native ETH here.
    receive() external payable {}

    /// @notice Distributes all native ETH currently held by this splitter.
    ///         Anyone may call; proceeds always go to the immutable recipients.
    function distributeNative() external nonReentrant {
        uint256 total = address(this).balance;
        if (total == 0) return;

        uint256 creatorAmount = (total * CREATOR_BPS) / BPS_DENOMINATOR;
        uint256 holderAmount = total - creatorAmount;

        (bool creatorOk,) = payable(creator).call{value: creatorAmount}("");
        if (!creatorOk) revert NativeTransferFailed();
        (bool holderOk,) = payable(holderRewardsVault).call{value: holderAmount}("");
        if (!holderOk) revert NativeTransferFailed();

        emit NativeFeesDistributed(total, creatorAmount, holderAmount);
    }

    /// @notice Distributes all of an ERC-20 fee asset currently held here.
    ///         Supports WETH and fee tokens; recipients are immutable.
    function distributeToken(address token) external nonReentrant {
        if (token == address(0)) revert ZeroAddress();
        (bool balanceOk, bytes memory balanceData) = token.staticcall(
            abi.encodeWithSignature("balanceOf(address)", address(this))
        );
        if (!balanceOk || balanceData.length < 32) revert TokenTransferFailed();
        uint256 total = abi.decode(balanceData, (uint256));
        if (total == 0) return;

        uint256 creatorAmount = (total * CREATOR_BPS) / BPS_DENOMINATOR;
        uint256 holderAmount = total - creatorAmount;

        _safeTransfer(token, creator, creatorAmount);
        _safeTransfer(token, holderRewardsVault, holderAmount);

        emit TokenFeesDistributed(token, total, creatorAmount, holderAmount);
    }

    function _safeTransfer(address token, address recipient, uint256 amount) private {
        (bool ok, bytes memory data) = token.call(
            abi.encodeWithSignature("transfer(address,uint256)", recipient, amount)
        );
        if (!ok || (data.length != 0 && !abi.decode(data, (bool)))) revert TokenTransferFailed();
    }
}
