// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title FlashboysHolderRewardsVault
/// @notice Holds the holder portion of Pons creator-fee claims. The creator
/// publishes immutable Merkle roots for each reward epoch and asset; holders
/// claim their published allocation with a proof.
contract FlashboysHolderRewardsVault {
    address public immutable publisher;
    mapping(uint256 => mapping(address => bytes32)) public roots;
    mapping(uint256 => mapping(address => mapping(address => bool))) public claimed;

    event RootPublished(uint256 indexed epoch, address indexed asset, bytes32 root);
    event RewardClaimed(uint256 indexed epoch, address indexed asset, address indexed holder, uint256 amount);

    error Unauthorized();
    error InvalidRoot();
    error RootAlreadyPublished();
    error AlreadyClaimed();
    error InvalidProof();
    error TransferFailed();

    constructor(address publisher_) {
        if (publisher_ == address(0)) revert Unauthorized();
        publisher = publisher_;
    }

    receive() external payable {}

    function publishRoot(uint256 epoch, address asset, bytes32 root) external {
        if (msg.sender != publisher) revert Unauthorized();
        if (root == bytes32(0)) revert InvalidRoot();
        if (roots[epoch][asset] != bytes32(0)) revert RootAlreadyPublished();
        roots[epoch][asset] = root;
        emit RootPublished(epoch, asset, root);
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
        claimed[epoch][asset][msg.sender] = true;
        if (asset == address(0)) {
            (bool ok,) = payable(msg.sender).call{value: amount}("");
            if (!ok) revert TransferFailed();
        } else {
            (bool ok, bytes memory data) = asset.call(abi.encodeWithSignature("transfer(address,uint256)", msg.sender, amount));
            if (!ok || (data.length != 0 && !abi.decode(data, (bool)))) revert TransferFailed();
        }
        emit RewardClaimed(epoch, asset, msg.sender, amount);
    }
}
