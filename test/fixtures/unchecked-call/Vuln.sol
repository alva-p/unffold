// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Intentionally vulnerable fixture for unffold's security checks.
// Local Anvil only. Never deploy to a public network.
contract UncheckedCalls {
    function bareSend(address payable to, uint256 amount) external {
        to.send(amount);
    }

    function bareCallWithValue(address target, bytes calldata data) external payable {
        target.call{value: msg.value}(data);
    }

    function ignoredSuccess(address target, bytes calldata data) external {
        (bool ok, ) = target.call(data);
    }

    function droppedSuccess(address target, bytes calldata data) external view returns (bytes memory) {
        (, bytes memory ret) = target.staticcall(data);
        return ret;
    }
}
