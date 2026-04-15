# GarudaChain Consensus Specification

This document describes the consensus-layer changes GarudaChain makes on top
of Bitcoin Core v28.1.0. All Bitcoin consensus rules apply unless explicitly
overridden here.

---

## 1. Network Parameters

| Parameter | Value | Notes |
|---|---|---|
| Network magic (mainnet) | `0x47524444` (`GRDM`) | |
| Network magic (testnet) | `0x47524454` (`GRDT`) | |
| P2P port (mainnet) | 6300 | |
| RPC port (mainnet) | 6301 | |
| Block target time | 5 minutes | `nPowTargetSpacing = 300` |
| Block reward | 0.01 GRD | Fixed, no halving |
| Halving interval | 1,050,000 blocks | Subsidy halving disabled in practice |
| Bech32 HRP (mainnet) | `grd` | |
| Bech32 HRP (test nets) | `tgrd` | |
| P2PKH version byte | 38 | Addresses start with `G` |

---

## 2. Block Subsidy

`GetBlockSubsidy()` returns `COIN / 100` = 1,000,000 satoshis (0.01 GRD) for
all block heights. The halving interval is set to 1,050,000 blocks to match
Bitcoin's schedule but the fixed 0.01 GRD reward means halvings have no
economic effect.

Source: `src/validation.cpp`, function `GetBlockSubsidy`.

---

## 3. Post-Quantum Address Type: P2PQH

### 3.1 Overview

GarudaChain adds witness version 2 (P2PQH — Pay to Post-Quantum Hash) as a
new native address type alongside the standard Bitcoin address types.

- Address prefix: `grd1z...` (bech32m, witness version 2)
- Signature algorithm: ML-DSA-87 (FIPS 204, NIST Level 5)
- Key sizes: public key 2592 bytes, secret key 4896 bytes, signature ~4627 bytes
- Quantum security: 256-bit (resistant to Shor's algorithm)

### 3.2 Address Encoding

```
P2PQH address = bech32m(hrp, [2] || convert_bits(SHA256(pubkey), 8→5))
```

- Witness version: 2 (encodes as `z` in bech32m)
- Witness program: SHA-256 of the 2592-byte ML-DSA-87 public key (32 bytes)
- Encoding: bech32m (BIP350) with the `grd` HRP

### 3.3 Output Script

```
OP_2 OP_PUSHBYTES_32 <SHA256(pubkey)>
```

In hex: `5220<32-byte-hash>`

### 3.4 Spending (Witness Stack)

When spending a P2PQH output the witness stack must be:

```
stack[0] = ML-DSA-87 signature (~4627 bytes)
stack[1] = ML-DSA-87 public key (2592 bytes)
```

### 3.5 Signature Hash (BIP143-style)

The signature hash is computed identically to BIP143 (SegWit v0 P2WPKH) but
with `scriptCode = OP_2 OP_PUSHBYTES_32 <SHA256(pubkey)>`.

### 3.6 Consensus Validation

`CheckQuantumSignature()` in `src/pqc/ml_dsa87.cpp`:
1. Verifies `SHA256(stack[1]) == witness_program` (pubkey commitment)
2. Calls `OQS_SIG_ml_dsa_87_verify(sigHash, stack[0], stack[1])` via liboqs
3. Returns true only if both checks pass

Source: `src/pqc/ml_dsa87.cpp`, `src/script/interpreter.cpp`

---

## 4. CBDC Layer

### 4.1 Overview

GarudaChain embeds a native CBDC (Central Bank Digital Currency) layer
directly in the L1 protocol. CBDC operations use a dedicated RPC interface
and are recorded in the blockchain alongside standard GRD transactions.

### 4.2 RPC Commands

| Command | Description |
|---|---|
| `cbdcmint {"address","amount","asset"}` | Mint CBDC tokens to an address |
| `cbdcburn {"address","amount","asset"}` | Burn CBDC tokens from an address |
| `cbdcpeg {"address","amount"}` | Lock GRD and issue equivalent CBDC |
| `cbdcunpeg {"address","amount"}` | Burn CBDC and return GRD |
| `listassets` | List all registered CBDC assets |
| `generatepqckeypair` | Generate ML-DSA-87 keypair |
| `getpqcaddress <pubkey>` | Derive P2PQH address from public key |
| `verifypqcsig <addr> <msg> <sig>` | Verify an ML-DSA-87 signature |

### 4.3 Authority Key

CBDC mint operations require a valid signature from the CBDC authority key
(`GARUDA_AUTH_PRIVKEY`). This key is the operator's crown jewel — it must
be stored in an HSM or secrets manager, never in a plain file on disk.

### 4.4 Asset Identifier

CBDC assets are identified by a string ticker (e.g. `"IDR"` for Indonesian
Rupiah). The ticker is embedded in the transaction witness data. Multiple
assets can coexist on the same chain.

Source: `src/cbdc/`, `src/rpc/cbdc.cpp`

---

## 5. Audit Chain

### 5.1 Overview

Every block's coinbase transaction contains an OP_RETURN output embedding
a 32-byte SHA-256 hash of the off-chain audit log state at that height.
This creates a tamper-evident, publicly verifiable anchor for the audit trail.

### 5.2 Coinbase OP_RETURN Format

```
vout[0] = block reward (standard coinbase output)
vout[1] = OP_RETURN <32-byte-audit-hash>
```

The 32-byte hash is the SHA-256 of the JSONL audit log file at the point
when the block template was created.

### 5.3 Verification

Any observer can independently verify the audit chain by:
1. Downloading the off-chain JSONL audit log
2. Computing SHA-256 of the log at each checkpoint height
3. Comparing against the OP_RETURN payload in the corresponding block

Source: `api/audit_witness.go`

---

## 6. Genesis Block

### 6.1 Mainnet

```
nTime   = 1744502400  (2026-04-13 00:00:00 UTC)
nNonce  = 1652458
nBits   = 0x1e0fffff
reward  = COIN / 100  (0.01 GRD)
message = "Kompas 13/Apr/2026 Bank Indonesia luncurkan CBDC GarudaChain untuk kedaulatan keuangan digital"

hash        = 6c4bbf1c3049841a0a8821c8556944fe0a8608526e4a5c0ef398cdfed76646bc
merkle_root = 9187874be66bb9ee94d3e02ad7942ca59eb60c95f28fcc523bb8730d766aaab8
```

### 6.2 Testnet / Testnet4 / Signet

```
nTime   = 1744502400
nNonce  = 0
nBits   = 0x207fffff  (easy PoW for development)
reward  = COIN / 100

hash        = 1aa06d5fdfb1047eb545f80838438c0a63a70fe04d21ae518c0fde442f5fb527
merkle_root = 9187874be66bb9ee94d3e02ad7942ca59eb60c95f28fcc523bb8730d766aaab8
```

### 6.3 Regtest

```
hash        = 1e002e0bf16444d9c8b38996de88bd1654a402d9a4847edb0a97225a8f86dd54
merkle_root = e644b37075e76da3ba98b0706b281cffb6c48356c2b76dbeb2c453289a5a7767
```

---

## 7. Compatibility with Bitcoin

Standard Bitcoin address types (P2PKH `G...`, P2WPKH `grd1q...`, P2WSH
`grd1p...`) are fully supported. All Bitcoin consensus rules apply to
transactions using these address types. P2PQH is additive — it does not
replace or break existing Bitcoin transaction types.
