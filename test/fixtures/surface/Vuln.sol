// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Intentionally vulnerable fixture for unffold's security checks.
// Local Anvil only. Never deploy to a public network.
contract SurfaceVuln {
    address public owner;
    uint256 public fee;

    // no initializer guard: anyone can (re)initialize
    function initialize(address newOwner) external {
        owner = newOwner;
    }

    // privileged name, no access control
    function setFee(uint256 newFee) external {
        fee = newFee;
    }

    // tx.origin used for authorization
    function withdrawAll(address payable to) external {
        require(tx.origin == owner, "not owner");
        to.transfer(address(this).balance);
    }

    // arbitrary delegatecall
    function execute(address target, bytes calldata data) external {
        (bool ok, ) = target.delegatecall(data);
        require(ok, "failed");
    }

    function close() external {
        selfdestruct(payable(msg.sender));
    }
}
