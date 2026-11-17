# unffold security detectors

`unffold <address> --security` reports **triage signals**: things a human should verify, not confirmed vulnerabilities. Each finding has a severity (how bad it would be if real), a confidence (how sure the check is), and the cases where it is a false positive.

When the address is a proxy, unffold analyzes the **implementation** behind it. Code from dependencies (OpenZeppelin, solmate, solady, `lib/`, `node_modules/`) is read for context but never reported.

**Not checked:** reentrancy, business and economic logic, price or oracle manipulation, interactions with other contracts. A clean result is not a safety guarantee.

| Severity | Meaning |
|---|---|
| high | If real, an attacker can likely take control or funds |
| medium | If real, it can cause loss or lockup under some conditions, or concentrates power |
| low | Hardening issue or narrow edge case |
| info | Context: what could not be checked |

---

### upgradeable

**Detects:** the address is a proxy (EIP-1967 Transparent/UUPS, Beacon, Minimal Proxy, Diamond, OpenZeppelin legacy).
**Why it matters:** whoever controls upgrades can replace the logic after you deposit or approve.
**How to verify:** follow the admin/owner: is it a multisig, a timelock with a delay, governance, or a single key? The on-chain evidence shows the implementation slot and admin.
**False positive when:** never wrong about upgradeability itself; the risk depends on who controls it.

### single-key-control

**Detects:** following the proxy admin (or the owner) hop by hop ends at a single key (EOA, including EIP-7702 delegated accounts) with no timelock delay on the way. Medium when it controls upgrades, low when it only owns the contract.
**Why it matters:** whoever holds that key can change the contract's behavior immediately, and users have no time to exit.
**How to verify:** the evidence lists each hop (ProxyAdmin → owner → …). Check who holds the final key; a Safe shows as `Safe n/m`, a timelock as `timelock, min delay …`.
**False positive when:** the key is held in MPC or hardware custody, which looks like a single EOA on-chain.

### unprotected-privileged

**Detects:** an external/public state-changing function whose name suggests admin use (`set*`, `pause`, `upgrade*`, `mint`, `grant*`, `rescue*`…) with no access-control modifier and no `msg.sender` / `_check*` check in its body.
**Why it matters:** anyone may be able to change parameters, mint, or move funds.
**How to verify:** read the function. Is there an auth check under an unusual name? Is it meant to be public?
**False positive when:** the function is intentionally public, or auth lives in a helper with an unrecognized name.

### unprotected-initializer

**Detects:** an `initialize*` / `init` function with no `initializer` modifier, no access control, and no reference to an initialized/version flag.
**Why it matters:** anyone could re-initialize and take ownership.
**How to verify:** check whether it can run more than once and who can call it.
**False positive when:** a one-time guard uses a flag name the check does not recognize.

### uups-unprotected-upgrade

**Detects:** a UUPS `_authorizeUpgrade` override with no access-control modifier and no caller check. High confidence when the body is empty.
**Why it matters:** anyone may call `upgradeToAndCall` and replace the logic.
**How to verify:** confirm only an owner/role/timelock can pass `_authorizeUpgrade`.
**False positive when:** auth lives in a modifier or helper with an unrecognized name.

### uups-no-upgrade-function

**Detects:** the proxy is UUPS, but neither the implementation nor its dependencies define `upgradeTo` / `upgradeToAndCall`.
**Why it matters:** in UUPS the upgrade function lives in the implementation. Without it the proxy is frozen for good, including for emergency fixes. This usually happens after an upgrade to a contract that forgot to inherit `UUPSUpgradeable`.
**How to verify:** look for any function that writes the EIP-1967 implementation slot.
**False positive when:** freezing was intended, or the upgrade entry point has a non-standard name.

### uninitialized-instance

**Detects:** reading the OpenZeppelin v5 `Initializable` storage slot (`0xf0c57e16…c6a00`) on the proxy (or contract) returns 0.
**Why it matters:** `initialize()` is still callable by whoever calls it first, who then becomes owner.
**How to verify:** the evidence line gives the slot, address and block; re-read it with `cast storage <address> <slot>`.
**False positive when:** the deployment is intentionally left uninitialized until a controlled transaction.

### uninitialized-implementation

**Detects:** the same slot reads 0 on the implementation behind a proxy.
**Why it matters:** anyone can initialize the implementation and own it. Since Cancun this rarely destroys the proxy, but it is serious if the implementation can reach `delegatecall` or `selfdestruct`.
**How to verify:** re-read the slot on the implementation address from the evidence line.
**False positive when:** the implementation has no privileged logic reachable after initialization.

### initializers-not-disabled

**Detects:** (static, used when the on-chain read is not possible, e.g. OpenZeppelin v4) a contract uses `initializer` but no constructor calls `_disableInitializers()` or carries the `initializer` modifier.
**Why it matters:** the implementation contract may be initializable by anyone.
**How to verify:** read the implementation's initialized state on-chain.
**False positive when:** the contract is deployed directly (not behind a proxy) and initialized in the same transaction, or the deployer already initialized the implementation.

### unchecked-low-level-call

**Detects:** `.call`, `.delegatecall`, `.staticcall` or `.send` whose success flag is discarded, dropped from the tuple, or assigned but never read.
**Why it matters:** a failed call does not revert, so execution continues as if it succeeded (lost ETH, broken accounting).
**How to verify:** check what happens to state when the call fails.
**False positive when:** the call is deliberately best-effort (refunds, keeper tips).

### arbitrary-transfer-from

**Detects:** an external/public function without access control calls `transferFrom` / `safeTransferFrom` (including `SafeERC20.safeTransferFrom`) with a `from` taken straight from its parameters, and never compares `from` with anything, uses it as an allowance key with `msg.sender`, or verifies a permit or signature.
**Why it matters:** anyone may be able to move tokens out of every address that approved this contract. This is one of the most common causes of approval drains.
**How to verify:** read the function and its callers: can an attacker pass a victim's address as `from`?
**False positive when:** the check lives in a helper or modifier with an unrecognized name, or only trusted callers can reach it.

### oracle-stale-price

**Detects:** Chainlink `latestRoundData()` where `updatedAt` is discarded, or never compared with `block.timestamp`.
**Why it matters:** during feed outages the contract keeps using an old price, which can be exploited in lending and trading.
**How to verify:** look for a heartbeat check (`block.timestamp - updatedAt <= HEARTBEAT`) in this function or its caller.
**False positive when:** staleness is checked by the caller or a separate circuit breaker.

### oracle-answer-unchecked

**Detects:** the `answer` from `latestRoundData()` is used without checking it is positive.
**Why it matters:** casting a negative `int256` to `uint256` yields a huge price.
**How to verify:** look for `answer > 0` before use.
**False positive when:** the caller validates it, or the feed cannot report non-positive values in practice.

### oracle-latest-answer

**Detects:** use of the deprecated `latestAnswer()`.
**Why it matters:** it returns no timestamp, so staleness cannot be checked.
**False positive when:** a non-Chainlink contract exposes a function with the same name.

### oracle-no-sequencer-check

**Detects:** on Arbitrum, Optimism or Base, Chainlink prices are read and no sequencer uptime feed is referenced.
**Why it matters:** prices can be stale while the L2 sequencer is down.
**False positive when:** the check lives in another contract or under a different name.

### selfdestruct

**Detects:** `selfdestruct` (Solidity or assembly) in first-party code.
**Why it matters:** since Cancun (EIP-6780) it only deletes code in the creation transaction, but it still sends the whole ETH balance.
**How to verify:** check who can reach it and where the balance goes.

### delegatecall

**Detects:** `delegatecall` in first-party code.
**Why it matters:** it runs external code against this contract's storage and balance.
**How to verify:** check whether the target or calldata can be controlled by an untrusted caller.
**False positive when:** proxy plumbing or multicall-to-self.

### tx-origin

**Detects:** `tx.origin` used anywhere except the `tx.origin == msg.sender` EOA check.
**Why it matters:** `tx.origin` authorization can be bypassed by a malicious contract the victim interacts with.
**False positive when:** logging or gas-refund uses that do not gate access.

### no-source

**Detects:** no verified source on Etherscan or Sourcify.
**Why it matters:** only on-chain checks ran, so a clean result means little.

### parse-partial

**Detects:** a source file the Solidity parser could not fully parse.
**Why it matters:** findings in that file may be missing; review it manually.
