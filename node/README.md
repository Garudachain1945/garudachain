# GarudaChain Node

GarudaChain is a post-quantum CBDC blockchain for Indonesia, built as a fork of
Bitcoin Core v28.1.0. It adds ML-DSA-87 (FIPS 204 Level 5) post-quantum
signatures, a native CBDC mint/burn layer, and a tamper-evident audit chain —
while preserving full Bitcoin consensus compatibility for standard transactions.

## Key Differences from Bitcoin Core

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
| Address prefix | `bc1...` | **`grd1...`** |

## Network Ports

| Network | P2P Port | RPC Port |
|---|---|---|
| Mainnet | 6300 | 6301 |
| Testnet | 16300 | 16301 |
| Testnet4 | 16340 | 16341 |
| Signet | 16330 | 16331 |
| Regtest | 18444 | 18443 |

## Build Instructions

### Dependencies

```bash
# Ubuntu / Debian
sudo apt install build-essential libtool autotools-dev automake pkg-config \
  bsdmainutils python3 libssl-dev libevent-dev libboost-dev \
  libsqlite3-dev libminiupnpc-dev libnatpmp-dev libzmq3-dev \
  systemtap-sdt-dev
```

### liboqs (required for ML-DSA-87)

```bash
git clone https://github.com/open-quantum-safe/liboqs.git
cd liboqs && mkdir build && cd build
cmake -DOQS_DIST_BUILD=ON -DBUILD_SHARED_LIBS=OFF ..
make -j$(nproc) && sudo make install
cd ../..
```

### Build GarudaChain

```bash
cd node
./autogen.sh
./configure --with-liboqs
make -j$(nproc)
sudo make install
```

Binaries: `garudad`, `garuda-cli`, `garuda-wallet`, `garuda-tx`, `garuda-util`

## Running

### Regtest (local development)

```bash
garudad -regtest -daemon
garuda-cli -regtest getblockchaininfo
garuda-cli -regtest generatetoaddress 101 $(garuda-cli -regtest getnewaddress)
```

### Testnet

```bash
garudad -testnet -daemon
garuda-cli -testnet getblockchaininfo
```

### Docker (recommended for development)

```bash
docker-compose -f docker-compose.ci.yml up -d
```

## Post-Quantum Addresses

Generate a quantum-safe ML-DSA-87 keypair and address:

```bash
# Generate keypair
garuda-cli -regtest generatepqckeypair

# Get PQC address from public key
garuda-cli -regtest getpqcaddress <pubkey_hex>

# Verify a PQC signature
garuda-cli -regtest verifypqcsig <address> <message> <signature>
```

PQC addresses use witness version 2 (`grd1z...`) and are resistant to
quantum computer attacks (Shor's algorithm).

## CBDC RPC Commands

```bash
# Mint CBDC tokens
garuda-cli -regtest cbdcmint '{"address":"grd1...","amount":1000,"asset":"IDR"}'

# Burn CBDC tokens
garuda-cli -regtest cbdcburn '{"address":"grd1...","amount":500,"asset":"IDR"}'

# List assets
garuda-cli -regtest listassets
```

## Security

See [SECURITY.md](../SECURITY.md) for the full threat model and security
hardening documentation (12 passes, 99.99% testnet coverage).

Report vulnerabilities privately to: security@garudachain.id

## License

GarudaChain node is released under the [MIT License](COPYING).

Copyright (c) 2009-2024 The Bitcoin Core developers  
Copyright (c) 2026 GarudaChain developers
