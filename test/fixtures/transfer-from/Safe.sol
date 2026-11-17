// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s) external;
}

contract SafeVault {
    IERC20 public token;
    address public owner;
    mapping(address => mapping(address => uint256)) public allowed;

    modifier onlyOwner() { require(msg.sender == owner, "owner"); _; }

    function deposit(uint256 amount) external { token.transferFrom(msg.sender, address(this), amount); }

    function depositChecked(address from, uint256 amount) external {
        require(from == msg.sender, "not sender");
        token.transferFrom(from, address(this), amount);
    }

    function depositWithAllowance(address from, uint256 amount) external {
        allowed[from][msg.sender] -= amount;
        token.transferFrom(from, address(this), amount);
    }

    function depositWithPermit(address from, uint256 amount, uint256 deadline, uint8 v, bytes32 r, bytes32 s) external {
        token.permit(from, address(this), amount, deadline, v, r, s);
        token.transferFrom(from, address(this), amount);
    }

    function sweep(address from, uint256 amount) external onlyOwner { token.transferFrom(from, owner, amount); }

    function _pull(address from, uint256 amount) internal { token.transferFrom(from, address(this), amount); }
}

library TransferHelper {
    function safeTransferFrom(address token, address from, address to, uint256 value) internal { IERC20(token).transferFrom(from, to, value); }
}

contract RouterLike {
    // token is caller-chosen, but `from` is msg.sender
    function addLiquidity(address token, address pair, uint256 amount) external { TransferHelper.safeTransferFrom(token, msg.sender, pair, amount); }
}

abstract contract ERC721Like {
    function transferFrom(address from, address to, uint256 id) public virtual {}
}

contract KongzLike is ERC721Like {
    // override that calls the inherited implementation (which checks approval)
    function transferFrom(address from, address to, uint256 id) public override {
        ERC721Like.transferFrom(from, to, id);
    }
}

contract SuperLike is ERC721Like {
    function transferFrom(address from, address to, uint256 id) public override {
        super.transferFrom(from, to, id);
    }
}

abstract contract ERC721Data {
    function safeTransferFrom(address from, address to, uint256 id, bytes memory data) public virtual {}
}

contract KongzSafeLike is ERC721Data {
    function safeTransferFrom(address from, address to, uint256 id, bytes memory data) public override {
        ERC721Data.safeTransferFrom(from, to, id, data);
    }
}
