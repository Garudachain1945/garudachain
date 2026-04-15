# Attribution

GarudaChain is a derivative work of several open-source projects. All original
authors retain their copyright; GarudaChain modifications are licensed under
the same terms as the respective upstream (MIT for Bitcoin Core, etc.).

## Upstream: Bitcoin Core

The `node/` directory was forked from **Bitcoin Core** at commit
[`32efe850438ef22e2de39e562af557872a402c31`](https://github.com/bitcoin/bitcoin/commit/32efe850438ef22e2de39e562af557872a402c31)
(Merge bitcoin/bitcoin#31594: 28.x 28.1 backports and final changes).

Upstream repository: <https://github.com/bitcoin/bitcoin>
Upstream license: MIT License — `node/COPYING`

The following subsystems are **original GarudaChain work** not present in
Bitcoin Core upstream:

- `node/src/cbdc/` — CBDC authority module (hybrid Schnorr + ML-DSA-87)
- `node/src/crypto/pqc/` — ML-DSA-87 (FIPS 204 Level 5) bindings to liboqs
- `node/src/dex/` — on-chain DEX primitives (orderbook, market maker, oracle)
- `node/src/assets/` — asset DB (stocks, stablecoins, bonds, tokens)
- `node/src/rpc/cbdc.cpp`, `rpc/assets.cpp`, `rpc/dex.cpp`, `rpc/pqc.cpp`
- `node/src/test/garudachain_tests.cpp`
- SHA3-256 PoW (replaces SHA256d in `node/src/hash.h` / `pow.cpp`)
- Chainparams magic bytes (`GRDM`/`GRDT`/`GRD4`), bech32 HRP (`grd`/`tgrd`),
  mainnet genesis, halving schedule, block time (5 min)

To sync a future upstream Bitcoin Core security fix, re-attach the upstream
remote:

```bash
cd node
git init
git remote add upstream https://github.com/bitcoin/bitcoin.git
git fetch --depth=1 upstream 32efe850438ef22e2de39e562af557872a402c31
# cherry-pick the specific patch you need
```

## Third-party libraries bundled in this repository

- **liboqs** (`node/src/crypto/pqc/`) — Open Quantum Safe, MIT
  <https://github.com/open-quantum-safe/liboqs>
- **secp256k1** (`node/src/secp256k1/`) — Bitcoin Core, MIT
- **leveldb** (`node/src/leveldb/`) — Google, BSD-3-Clause
- **crc32c** (`node/src/crc32c/`) — Google, BSD-3-Clause
- **minisketch** (`node/src/minisketch/`) — Bitcoin Core, MIT

## Trademarks

"Bitcoin" is not a registered trademark. "GarudaChain" and the garuda
logomark are trademarks of their respective owners. This project does not
claim any affiliation with or endorsement by Bitcoin Core developers.
