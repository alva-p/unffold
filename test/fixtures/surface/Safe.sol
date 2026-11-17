// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Safe counterpart of Vuln.sol: none of these should produce findings.
// Comments mentioning selfdestruct, delegatecall and tx.origin must not trigger checks.
contract SurfaceSafe {
    address public owner;
    uint256 public fee;
    bool private _initialized;
    mapping(address => string) public nickname;

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    modifier initializer() {
        require(!_initialized, "initialized");
        _initialized = true;
        _;
    }

    // locks the implementation (pre-_disableInitializers OZ pattern)
    constructor() initializer {}

    function initialize(address newOwner) external initializer {
        owner = newOwner;
    }

    function setFee(uint256 newFee) external onlyOwner {
        fee = newFee;
    }

    // auth via internal helper instead of a modifier
    function setLimit(uint256 newFee) external {
        _checkOwner();
        fee = newFee;
    }

    // privileged-looking name, but only affects the caller
    function setNickname(string calldata name) external {
        nickname[msg.sender] = name;
    }

    // tx.origin as an EOA check is not authorization
    function deposit() external payable {
        require(tx.origin == msg.sender, "no contracts");
    }

    // custom one-time flag instead of a modifier (USDC style)
    uint8 private _initializedVersion;
    function initializeV2() external {
        require(_initializedVersion == 0, "done");
        _initializedVersion = 1;
    }

    function _checkOwner() internal view {
        require(msg.sender == owner, "not owner");
    }
}

contract HelperChecksSender {
    mapping(address => uint256) public shares;

    function removeLiquidity(uint256 amount) public { shares[msg.sender] -= amount; }

    // auth lives one level down, in removeLiquidity
    function removeLiquidityETH(uint256 amount) external { removeLiquidity(amount); }
}

contract PublicSale {
    uint256 public minted;

    // public sale: payable, intentionally callable by anyone
    function mint(uint256 count) external payable { minted += count; }
}
