# GarudaChain

**Post-quantum CBDC blockchain for Indonesia**

GarudaChain is a Bitcoin Core v28.1.0 fork that adds ML-DSA-87 (FIPS 204 Level 5) post-quantum signatures, a native CBDC mint/burn layer, and a tamper-evident audit chain — while preserving full Bitcoin consensus compatibility for standard transactions.

> Network launch: Q3 2026 · Testnet open now

---

## Why GarudaChain?

| Feature | Bitcoin Core | GarudaChain |
|---|---|---|
| Signature scheme | ECDSA / Schnorr | ECDSA + **ML-DSA-87 (PQC)** |
| PQ address type | None | `grd1z...` (witness v2, P2PQH) |
| Block time | 10 minutes | **5 minutes** |
| Block reward | 50 BTC halving | **0.01 GRD** (fixed, no halving) |
| Native CBDC | No | **Yes** (mint/burn/peg RPC) |
| Audit log | No | **Hash-chained JSONL + OP_RETURN witness** |
| Network magic | `f9beb4d9` | **`47524444`** (`GRDM`) |
| Default port | 8333 | **6300** (mainnet) |
| Address prefix | `bc1...` / `1...` | **`grd1...`** / **`G...`** |

---

## Repository Layout

```
garudachain/
├── node/          Bitcoin Core v28.1.0 fork — GarudaChain consensus node
├── api/           REST API server (Go) — admin, CBDC, DEX, audit endpoints
├── indexer/       Block indexer (TypeScript)
├── website/       Public explorer / landing page
├── mobile/        Mobile wallet (React Native)
├── extension/     Browser wallet extension
├── deploy/        Deployment manifests and scripts
├── SECURITY.md    Full threat model & hardening documentation (12 passes)
└── README.md      This file
```

---

## Network Ports

| Network  | P2P Port | RPC Port |
|----------|----------|----------|
| Mainnet  | 6300     | 6301     |
| Testnet  | 16300    | 16301    |
| Testnet4 | 16340    | 16341    |
| Signet   | 16330    | 16331    |
| Regtest  | 18444    | 18443    |

---

## Quickstart

### 1 — Build the node

**Dependencies (Ubuntu/Debian)**

```bash
sudo apt install build-essential libtool autotools-dev automake pkg-config \
  bsdmainutils python3 libssl-dev libevent-dev libboost-dev \
  libsqlite3-dev libminiupnpc-dev libnatpmp-dev libzmq3-dev \
  systemtap-sdt-dev
```

**liboqs (required for ML-DSA-87)**

```bash
git clone https://github.com/open-quantum-safe/liboqs.git
cd liboqs && mkdir build && cd build
cmake -DOQS_DIST_BUILD=ON -DBUILD_SHARED_LIBS=OFF ..
make -j$(nproc) && sudo make install
cd ../..
```

**Build GarudaChain node**

```bash
cd node
./autogen.sh
./configure --with-liboqs
make -j$(nproc)
sudo make install
```

Binaries: `garudad`, `garuda-cli`, `garuda-wallet`, `garuda-tx`, `garuda-util`

### 2 — Configure credentials

```bash
cp .env.example .env
# Edit .env and fill in:
#   - GARUDA_ADMIN_KEY        (openssl rand -hex 32)
#   - GARUDA_RPC_PASS_*       (openssl rand -hex 24 — one per node)
#   - GARUDA_RPC_USER_*       (any non-empty username)
```

The dev-stack scripts (`start.sh`, `stop.sh`, `reset-chain.sh`, `mine-live.sh`,
`garuda-wallet.sh`) will refuse to run until these are set. This is
intentional — shipping hardcoded credentials in an open-source repo would
hand remote attackers an RPC shell on every fresh install.

### 3 — Run regtest (local development)

```bash
garudad -regtest -daemon
garuda-cli -regtest getblockchaininfo
garuda-cli -regtest generatetoaddress 101 $(garuda-cli -regtest getnewaddress)
```

### 4 — Run with Docker

```bash
docker-compose -f docker-compose.ci.yml up -d
```

### 5 — Build and run the API server

```bash
cd api
go build -o garudaapi .
./garudaapi
```

See `SECURITY.md` for the full security configuration reference including
AES-256-GCM encrypted key files and HashiCorp Vault integration.

---

## Post-Quantum Addresses

GarudaChain uses ML-DSA-87 (FIPS 204, NIST Level 5) for quantum-resistant
transaction signing. PQC addresses use witness version 2 (`grd1z...`) and are
immune to Shor's algorithm attacks from future quantum computers.

```bash
# Generate an ML-DSA-87 keypair
garuda-cli -regtest generatepqckeypair

# Derive the PQC address from a public key
garuda-cli -regtest getpqcaddress <pubkey_hex>

# Verify a PQC signature
garuda-cli -regtest verifypqcsig <address> <message> <signature>
```

---

## CBDC RPC Commands

All privileged CBDC operations require ML-DSA-87 (FIPS 204, NIST Level 5)
authority authorization. First generate an authority keypair, then configure
the hash in `bitcoin.conf`:

```bash
# 1. Generate the ML-DSA-87 authority keypair (7488-byte combined pk||sk)
garuda-cli generatepqckeypair

# 2. Add the raw pubkey hash to bitcoin.conf (NOT the display-reversed form)
#    cbdcpqcpubkeyhash=<32-byte raw SHA256(pubkey) hex>
#    cbdcauthoritypubkey=<32-byte Schnorr x-only pubkey hex>
#    walletmode=cbdc

# 3. Restart the node
```

Once configured, every privileged RPC takes an extra `pqcseckeyhex` argument
with the combined 7488-byte pk||sk hex:

```bash
# Mint native GRD (hybrid Schnorr + ML-DSA-87)
garuda-cli mintgaruda 1000 "grd1q..." <schnorr-privkey-hex> <pqc-combined-hex>

# Issue an asset (stock / stablecoin / bond / token)
garuda-cli issueasset "BBRI" "Saham BRI" "saham" 1000000 "grd1q..." \
    null null null null null null <pqc-combined-hex>

# Mint/burn asset supply
garuda-cli mintasset  "<asset_id>" 500000 <pqc-combined-hex>
garuda-cli burnasset  "<asset_id>" 500000 "grd1q..." <pqc-combined-hex>

# Stablecoin oracle peg (updates all pegged assets)
garuda-cli updatepegrate "IDR" 0.0000625 "CBDC_AUTHORITY" <pqc-combined-hex>
garuda-cli issuepegged   "grd1q..." 999999999 <pqc-combined-hex>

# Declare a dividend (pro-rata distribution to all holders)
garuda-cli declaredividend "<asset_id>" 1000000 "grd1q..." <pqc-combined-hex>

# Authority key rotation
garuda-cli rotateauthoritykey <new-pub-hex> <old-priv-hex> <new-pqc-hash> <pqc-combined-hex>
```

Every privileged call logs a `CBDC_PQC_AUTH[<op>]: OK sig_len=4627` audit entry
to `debug.log` with a prefix of the ML-DSA-87 signature for after-the-fact
verification.

---

## API Endpoints (summary)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/healthz` | Liveness probe |
| GET | `/api/admin/health` | Deep health (admin) |
| GET | `/api/admin/security-status` | Security config status (admin) |
| POST | `/api/cbdc/mint` | Mint CBDC tokens |
| POST | `/api/cbdc/burn` | Burn CBDC tokens |
| GET | `/api/audit/chain` | Audit log tail |
| GET | `/api/metrics` | Prometheus metrics |

Full API reference: see `api/main.go` route registration and inline docs.

---

## Security

GarudaChain went through a 12-pass security hardening process covering:

- Input validation and safe JSON handling
- Per-IP rate limiting and audit log replay protection
- AES-256-GCM envelope encryption for secret key files
- HashiCorp Vault / GCP Secret Manager key provider abstraction
- Prometheus metrics + deep health endpoint
- ML-DSA-87 post-quantum signature verification at consensus level

See [SECURITY.md](SECURITY.md) for the complete threat model, findings, and
mitigations. Report vulnerabilities privately to: security@garudachain.id

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

---

## Known Limitations

This codebase is pre-1.0 and actively hardening for public launch. Operators
should be aware of the following before deploying to anything beyond a local
dev chain:

- **Genesis reset required.** Dev test chains built during development may
  contain blocks written under earlier, inconsistent consensus rules (e.g.
  `mintgaruda` blocks that put the mint amount directly in the coinbase
  output). A fresh `reset-chain.sh --yes` is the supported path for any
  published release — the codebase is the source of truth, not historical
  test state.
- **No external audit yet.** The hybrid Schnorr + ML-DSA-87 authority flow,
  the replay-protected sighash (`SHA256(CHAIN_ID || tx.GetHash())`), and the
  M-of-N treasury multisig have been internally reviewed but not yet
  independently audited. Do not protect real value with this build.
- **Authority defaults are empty.** `DEFAULT_AUTHORITY_PUBKEY_HEX`,
  `DEFAULT_AUTHORITY_PQC_PUBKEY_HASH_HEX`, and `DEFAULT_APBN_PUBKEYHASH_HEX`
  ship empty on purpose. Operators must set all three via `bitcoin.conf`
  (`cbdcauthoritypubkey`, `cbdcpqcpubkeyhash`, `cbdcapbnhash`) before any
  privileged RPC will execute.
- **Unit test coverage for the PQC authorization gate is still being added.**
  The `CBDC::RequirePQCAuth` helper is exercised via manual regression
  (17/17 privileged RPCs) but does not yet have a fuzz/unit harness.

---

## License

GarudaChain node code derived from Bitcoin Core is released under the
[MIT License](node/COPYING).

API server, indexer, and tooling: MIT License.

Copyright (c) 2009-2024 The Bitcoin Core developers
Copyright (c) 2026 GarudaChain developers
