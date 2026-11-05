// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * FLASHBOYS fixed-supply ERC-20 for Robinhood Chain.
 * Exactly 1,000,000,000 tokens (18 decimals) are minted once to the
 * deployer at construction. There is no mint, owner, or supply-adjustment
 * function. This contract intentionally does not expose token burning.
 */
contract RobinhoodFixedSupplyToken is ERC20 {
    uint256 public constant FIXED_SUPPLY = 1_000_000_000 * 10 ** 18;

    constructor(string memory name_, string memory symbol_)
        ERC20(name_, symbol_)
    {
        _mint(msg.sender, FIXED_SUPPLY);
    }
}