// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title FlashboysHolderRewardsVault
/// @notice Holds the holder portion of independent FLASHBOYS trading-fee rewards. The creator
/// publishes funded Merkle roots for each reward epoch and asset; holders claim
/// their published allocation with a proof. Each epoch is fully reserved before
/// its root can be published, preventing underfunded or overlapping promises.
contract FlashboysHolderRewardsVault {
    address public immutable publisher;
    mapping(uint256 => mapping(address => bytes32)) public roots;
    mapping(uint256 => mapping(address => mapping(address => bool))) public claimed;
    mapping(uint256 => mapping(address => uint256)) public remainingAllocation;
    mapping(address => uint256) public reservedByAsset;

    event RootPublished(uint256 indexed epoch, address indexed asset, bytes32 root, uint256 allocation);
    event RewardClaimed(uint256 indexed epoch, address indexed asset, address indexed holder, uint256 amount);

    error Unauthorized();
    error InvalidRoot();
    error RootAlreadyPublished();
    error InvalidAllocation();
    error InsufficientUnreservedFunds();
    error AlreadyClaimed();
    error InvalidProof();
    error TransferFailed();

    constructor(address publisher_) {
        if (publisher_ == address(0)) revert Unauthorized();
        publisher = publisher_;
    }

    receive() external payable {}

    function publishRoot(uint256 epoch, address asset, bytes32 root, uint256 totalAllocation) external {
        if (msg.sender != publisher) revert Unauthorized();
        if (root == bytes32(0)) revert InvalidRoot();
        if (roots[epoch][asset] != bytes32(0)) revert RootAlreadyPublished();
        if (totalAllocation == 0) revert InvalidAllocation();

        uint256 alreadyReserved = reservedByAsset[asset];
        if (_assetBalance(asset) < alreadyReserved + totalAllocation) revert InsufficientUnreservedFunds();

        roots[epoch][asset] = root;
        remainingAllocation[epoch][asset] = totalAllocation;
        reservedByAsset[asset] = alreadyReserved + totalAllocation;
        emit RootPublished(epoch, asset, root, totalAllocation);
    }

    function claim(uint256 epoch, address asset, uint256 amount, bytes32[] calldata proof) external {
        if (claimed[epoch][asset][msg.sender]) revert AlreadyClaimed();
        bytes32 root = roots[epoch][asset];
        if (root == bytes32(0)) revert InvalidRoot();

        bytes32 hash = keccak256(abi.encode(epoch, msg.sender, amount));
        for (uint256 i; i < proof.length; ++i) {
            bytes32 sibling = proof[i];
            hash = hash < sibling
                ? keccak256(abi.encodePacked(hash, sibling))
                : keccak256(abi.encodePacked(sibling, hash));
        }
        if (hash != root) revert InvalidProof();

        uint256 remaining = remainingAllocation[epoch][asset];
        if (amount == 0 || amount > remaining) revert InvalidAllocation();

        claimed[epoch][asset][msg.sender] = true;
        remainingAllocation[epoch][asset] = remaining - amount;
        reservedByAsset[asset] -= amount;

        if (asset == address(0)) {
            (bool ok,) = payable(msg.sender).call{value: amount}("");
            if (!ok) revert TransferFailed();
        } else {
            (bool ok, bytes memory data) = asset.call(abi.encodeWithSignature("transfer(address,uint256)", msg.sender, amount));
            if (!ok || (data.length != 0 && !abi.decode(data, (bool)))) revert TransferFailed();
        }
        emit RewardClaimed(epoch, asset, msg.sender, amount);
    }

    function _assetBalance(address asset) private view returns (uint256 amount) {
        if (asset == address(0)) return address(this).balance;
        (bool ok, bytes memory data) = asset.staticcall(abi.encodeWithSignature("balanceOf(address)", address(this)));
        if (!ok || data.length < 32) revert TransferFailed();
        amount = abi.decode(data, (uint256));
    }
}
