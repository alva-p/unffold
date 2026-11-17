// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Intentionally vulnerable fixture: `from` is caller-chosen and never checked.
interface IERC20 { function transferFrom(address from, address to, uint256 amount) external returns (bool); }

library TransferHelper {
    function safeTransferFrom(IERC20 token, address from, address to, uint256 amount) internal { token.transferFrom(from, to, amount); }
}

contract DrainVault {
    IERC20 public token;
    mapping(address => uint256) public balances;

    // anyone can pull any approver's tokens and credit themselves
    function deposit(address from, uint256 amount) external {
        token.transferFrom(from, address(this), amount);
        balances[msg.sender] += amount;
    }

    function depositFor(address user, address to, uint256 amount) external {
        TransferHelper.safeTransferFrom(token, user, to, amount);
    }
}
