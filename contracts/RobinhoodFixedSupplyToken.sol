// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * Fixed-supply FLASHBOYS ERC-20. Exactly 1,000,000,000 tokens are created
 * at deployment. There is no mint or owner function, so supply cannot be
 * increased after deployment.
 */
contract RobinhoodFixedSupplyToken {
    string public name;
    string public symbol;
    uint8 public constant decimals = 18;
    uint256 public constant totalSupply = 1_000_000_000 * 10 ** 18;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    constructor(string memory name_, string memory symbol_) {
        require(bytes(name_).length > 0 && bytes(symbol_).length > 0, "Name and symbol required");
        name = name_; symbol = symbol_; balanceOf[msg.sender] = totalSupply;
        emit Transfer(address(0), msg.sender, totalSupply);
    }
    function transfer(address to, uint256 value) external returns (bool) { _transfer(msg.sender, to, value); return true; }
    function approve(address spender, uint256 value) external returns (bool) { allowance[msg.sender][spender] = value; emit Approval(msg.sender, spender, value); return true; }
    function transferFrom(address from, address to, uint256 value) external returns (bool) {
        uint256 permitted = allowance[from][msg.sender]; require(permitted >= value, "ERC20: insufficient allowance");
        if (permitted != type(uint256).max) { allowance[from][msg.sender] = permitted - value; emit Approval(from, msg.sender, allowance[from][msg.sender]); }
        _transfer(from, to, value); return true;
    }
    function _transfer(address from, address to, uint256 value) internal {
        require(to != address(0), "ERC20: transfer to zero address"); require(balanceOf[from] >= value, "ERC20: insufficient balance");
        unchecked { balanceOf[from] -= value; balanceOf[to] += value; } emit Transfer(from, to, value);
    }
}