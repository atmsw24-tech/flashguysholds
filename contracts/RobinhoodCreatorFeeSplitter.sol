// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "./FlashboysHolderRewardsVault.sol";

interface IPonsCreatorFeeEscrow {
    function claim() external returns (uint256 amount);
    function claimToken(address token) external returns (uint256 amount);
    function balanceOf(address recipient) external view returns (uint256);
    function balanceOfToken(address recipient, address token) external view returns (uint256);
}

/// @title FlashboysPonsFeeSplitter
/// @notice Pons V2 creator-fee recipient. It claims the creator's accumulated
///         Pons escrow balance, pays 80% to the creator, and deposits 20% into
///         a dedicated holder-rewards vault. The upstream Pons protocol share
///         is untouched because this contract only claims the creator ledger.
contract FlashboysPonsFeeSplitter {
    uint256 public constant CREATOR_BPS = 8_000;
    uint256 public constant HOLDER_REWARDS_BPS = 2_000;
    uint256 private constant BPS = 10_000;

    address public immutable creator;
    FlashboysHolderRewardsVault public immutable holderRewardsVault;
    uint256 private entered;

    event PonsNativeFeesClaimed(uint256 claimed, uint256 creatorAmount, uint256 holderAmount);
    event PonsTokenFeesClaimed(address indexed asset, uint256 claimed, uint256 creatorAmount, uint256 holderAmount);

    error ZeroAddress();
    error ReentrantCall();
    error TransferFailed();
    error NothingClaimable();

    constructor(address creator_) {
        if (creator_ == address(0)) revert ZeroAddress();
        creator = creator_;
        holderRewardsVault = new FlashboysHolderRewardsVault(creator_);
    }

    modifier nonReentrant() {
        if (entered != 0) revert ReentrantCall();
        entered = 1;
        _;
        entered = 0;
    }

    /// @notice Claim this address's Pons native-asset creator fees and split them.
    /// Anyone can trigger the claim; funds always go to immutable recipients.
    function claimAndDistributeNative(address escrow) external nonReentrant {
        if (escrow == address(0)) revert ZeroAddress();
        uint256 beforeBalance = address(this).balance;
        IPonsCreatorFeeEscrow(escrow).claim();
        uint256 total = address(this).balance - beforeBalance;
        if (total == 0) revert NothingClaimable();
        uint256 creatorAmount = (total * CREATOR_BPS) / BPS;
        uint256 holderAmount = total - creatorAmount;
        (bool creatorOk,) = payable(creator).call{value: creatorAmount}("");
        if (!creatorOk) revert TransferFailed();
        (bool holderOk,) = payable(address(holderRewardsVault)).call{value: holderAmount}("");
        if (!holderOk) revert TransferFailed();
        emit PonsNativeFeesClaimed(total, creatorAmount, holderAmount);
    }

    /// @notice Claim this address's Pons ERC-20 creator fees and split them.
    function claimAndDistributeToken(address escrow, address asset) external nonReentrant {
        if (escrow == address(0) || asset == address(0)) revert ZeroAddress();
        uint256 beforeBalance = _balance(asset);
        IPonsCreatorFeeEscrow(escrow).claimToken(asset);
        uint256 total = _balance(asset) - beforeBalance;
        if (total == 0) revert NothingClaimable();
        uint256 creatorAmount = (total * CREATOR_BPS) / BPS;
        uint256 holderAmount = total - creatorAmount;
        _safeTransfer(asset, creator, creatorAmount);
        _safeTransfer(asset, address(holderRewardsVault), holderAmount);
        emit PonsTokenFeesClaimed(asset, total, creatorAmount, holderAmount);
    }

    function _balance(address asset) private view returns (uint256 amount) {
        (bool ok, bytes memory data) = asset.staticcall(abi.encodeWithSignature("balanceOf(address)", address(this)));
        if (!ok || data.length < 32) revert TransferFailed();
        amount = abi.decode(data, (uint256));
    }

    function _safeTransfer(address asset, address recipient, uint256 amount) private {
        (bool ok, bytes memory data) = asset.call(abi.encodeWithSignature("transfer(address,uint256)", recipient, amount));
        if (!ok || (data.length != 0 && !abi.decode(data, (bool)))) revert TransferFailed();
    }
}
