# GarudaChain: A Post-Quantum Peer-to-Peer Electronic Cash and CBDC System

**Version 1.0 — April 2026**

---

## Abstract

A purely peer-to-peer version of electronic cash should remain secure against adversaries equipped with cryptographically relevant quantum computers. This paper describes GarudaChain, a Bitcoin Core v28.1.0 fork that replaces the legacy ECDSA/Schnorr signature scheme with **ML-DSA-87 (FIPS 204, Level 5)** post-quantum signatures, while preserving Bitcoin's UTXO model, peer-to-peer gossip, and longest-chain consensus rule. GarudaChain additionally introduces a sovereign mint layer that allows a designated authority to issue a Central Bank Digital Currency (CBDC) on the same chain as a permissionless cryptocurrency, with every issuance event hash-chained into a tamper-evident audit log. The system uses **SHA3-256** for proof-of-work, a **5-minute** target block interval, a **fixed (non-halving) 0.01 GRD** subsidy, and a **90 billion GRD** hard cap. Standard Bitcoin transactions remain valid under the same consensus rules; quantum-resistant addresses use a new witness program version (`grd1z...`, P2PQH).

---

## 1. Introduction

Commerce on the Internet has come to rely almost exclusively on financial institutions serving as trusted third parties. Bitcoin removed this dependency for the digital cash use case by inventing an open, peer-to-peer network secured by proof-of-work. However, two structural problems remain:

1. **Quantum vulnerability.** Bitcoin's signature schemes (ECDSA, Schnorr) are broken by Shor's algorithm. Any address whose public key has been revealed on-chain is permanently exposed once a sufficiently large quantum computer exists.

2. **Sovereign issuance.** Nation-states cannot issue a digital currency on Bitcoin without trusting a wrapping layer, and existing CBDC designs require a fully permissioned ledger that sacrifices the censorship-resistance properties that make blockchains valuable in the first place.

GarudaChain addresses both problems by (a) adopting a NIST-standardized post-quantum signature scheme at the consensus layer, and (b) adding a constrained sovereign mint primitive whose every action is publicly auditable on the same chain that secures permissionless transactions.

---

## 2. Post-Quantum Signatures

We use **ML-DSA-87** (Dilithium, NIST FIPS 204, security category 5), which provides 256-bit classical security and is believed secure against quantum adversaries under the Module-LWE and Module-SIS hardness assumptions.

A new SegWit witness version (`v2`) is allocated for **Pay-to-Post-Quantum-Hash (P2PQH)** outputs. The witness program is the SHA3-256 hash of the ML-DSA-87 public key. Spending a P2PQH output requires revealing the public key and a valid ML-DSA-87 signature over the transaction's signature hash. P2PQH addresses are bech32m-encoded with the human-readable part `grd`:

```
grd1z...   (witness v2, P2PQH, 32-byte hash)
```

Standard Bitcoin script types (P2PKH, P2WPKH, P2TR) remain valid and continue to use ECDSA/Schnorr. Users who require quantum security migrate funds to P2PQH; users who do not, do not pay the larger ML-DSA-87 witness cost. This dual-track design avoids forcing a hard cutover and lets the market price post-quantum security directly.

---

## 3. Proof-of-Work

GarudaChain uses **SHA3-256** (Keccak family, NIST FIPS 202) instead of double-SHA256. SHA3 is structurally distinct from SHA2 and is not known to admit any quantum speedup beyond Grover's generic √N attack, which can be neutralized by doubling the work factor.

- **Block interval target:** 5 minutes (half of Bitcoin's 10).
- **Difficulty adjustment:** every 2016 blocks (≈7 days), identical algorithm to Bitcoin Core.
- **Reference miner:** GPU implementation achieving ~75 MH/s on commodity hardware.

The shorter block interval reduces settlement latency for retail payments without materially changing orphan rates given modern network propagation.

---

## 4. Monetary Policy

| Parameter | Value |
|---|---|
| Hard cap (`MAX_MONEY`) | **90,000,000,000 GRD** |
| Block subsidy | **0.01 GRD** (fixed, no halving) |
| Smallest unit | 1 satoshi = 10⁻⁸ GRD |
| Block interval | 5 minutes |

The fixed subsidy is a deliberate departure from Bitcoin's halving schedule. Halvings create discontinuous miner-revenue cliffs that historically correlate with security-budget stress; a constant subsidy provides a predictable, gently inflating issuance curve that asymptotically approaches the hard cap over approximately 850 years. After the cap is reached, miners are compensated solely by transaction fees.

---

## 5. Sovereign Mint Layer

GarudaChain introduces a constrained sovereign mint primitive that allows a designated authority — in the reference deployment, an Indonesian central-bank entity — to issue CBDC value into circulation **without** the ability to freeze, censor, or reverse permissionless transactions.

### 5.1 Mechanism

`GetBlockSubsidy` in [node/src/validation.cpp](node/src/validation.cpp) reads a file at `/tmp/garuda-mint` at block-template construction time. The file specifies a one-time additional subsidy to be added to the next block. Historical mints are recorded in an append-only `HISTORICAL_MINTS` constant compiled into the binary, so any node performing initial block download can independently verify the entire mint history.

The miner coinbase formula in [node/src/node/miner.cpp](node/src/node/miner.cpp) is:

```
coinbase_value = nSubsidy + nFees − nApbnFee
```

where `nApbnFee` is a 30% public-revenue fee split that is sent to a designated address controlled by the issuing authority. This means **30% of every block's fee revenue is automatically directed to the public treasury**, providing a sustainable funding source for the authority without relying on discretionary mints.

### 5.2 Constraints

The sovereign mint primitive is bound by consensus rules that no entity — including the issuer — can violate:

1. **Hard cap.** No combination of mints can cause the total supply to exceed 90B GRD. The check is enforced in `CheckBlock`.
2. **No retroactive mints.** `HISTORICAL_MINTS` is hardcoded; nodes reject any block whose subsidy disagrees with the constant for any historical height.
3. **No double-mint.** Each mint file is consumed exactly once, identified by `(height, amount, txid_commitment)`.
4. **Public visibility.** Every mint is a normal coinbase transaction visible in any block explorer.

### 5.3 Audit Log

Every mint, burn, and peg event is recorded in a hash-chained JSONL audit file with an `OP_RETURN` commitment in the same block. The hash chain is rooted in genesis, so any tampering with historical mint records is detectable by anyone who has retained the genesis hash. This provides the core accountability property of a permissioned CBDC ledger **without** requiring nodes to trust the issuer for transaction validity.

---

## 6. Network

| Parameter | Mainnet | Testnet | Regtest |
|---|---|---|---|
| Magic bytes | `47524444` (`GRDM`) | (testnet magic) | (regtest magic) |
| P2P port | 6300 | 16300 | 18444 |
| RPC port | 6301 | 16301 | 18443 |
| Address HRP | `grd` | `tgrd` | `grdrt` |

The network magic and ports are deliberately distinct from Bitcoin's to prevent accidental cross-connection between the two networks.

---

## 7. Genesis and Premine

The genesis block contains **no premine**. The first 0.01 GRD subsidy is mined at height 1 by whoever first solves the genesis difficulty target. The `HISTORICAL_MINTS` constant is empty at genesis; all sovereign issuance is recorded after-the-fact and is independently verifiable by any node syncing from genesis.

---

## 8. Open Source and Governance

GarudaChain is released under the **MIT License** (see [LICENSE](LICENSE)) and inherits Bitcoin Core's contribution model. There is no foundation, no token sale, no developer fund. Protocol changes follow a BIP-style proposal process: a written specification, reference implementation, and rough consensus among node operators determine activation. The sovereign mint authority has no special privileges in the consensus rules — it is a normal user of the chain whose mint-file capability exists only because the binary was compiled to read that file. Any node operator who disagrees can compile a binary that ignores the file and the resulting chain will fork.

This design makes the social contract explicit: **the CBDC layer exists because nodes choose to run software that recognizes it, not because the issuer can compel them.**

---

## 9. References

1. S. Nakamoto, *Bitcoin: A Peer-to-Peer Electronic Cash System*, 2008.
2. NIST, *FIPS 204: Module-Lattice-Based Digital Signature Standard*, 2024.
3. NIST, *FIPS 202: SHA-3 Standard*, 2015.
4. Bitcoin Core, v28.1.0 source release.
5. GarudaChain repository: this codebase.

---

*GarudaChain is free software. No warranty. Use at your own risk.*
