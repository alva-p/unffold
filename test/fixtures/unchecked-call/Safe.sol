// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Safe counterpart of Vuln.sol: every low-level call result is checked.
contract CheckedCalls {
    error CallFailed();

    function requireOk(address target, bytes calldata data) external {
        (bool ok, ) = target.call(data);
        require(ok, "call failed");
    }

    function revertOnFailure(address payable to, uint256 amount) external {
        bool sent = to.send(amount);
        if (!sent) revert CallFailed();
    }

    function returnsOk(address target, bytes calldata data) external returns (bool) {
        (bool ok, ) = target.call{value: 0}(data);
        return ok;
    }

    function assignmentForm(address target, bytes calldata data) external {
        bool ok;
        (ok, ) = target.call(data);
        require(ok, "call failed");
    }

    // transfer() reverts on failure: not a low-level call
    function usesTransfer(address payable to, uint256 amount) external {
        to.transfer(amount);
    }
}
