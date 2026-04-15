# GarudaChain Mainnet Launch Checklist

This document tracks the concrete engineering work that must be finished
before GarudaChain mainnet goes live. Items are grouped by risk class.
Anything marked **BLOCKER** must be green before a public launch.

---

## P0 — Consensus and cryptography

- [x] Chainparams: mainnet magic `GRDM` (`0x47524444d`), port `6300`, bech32
      `grd`, base58 version byte 38 — `node/src/kernel/chainparams.cpp:95`
- [x] Mainnet genesis block mined (hash
      `00000398481367a3ebb1d38a4c1eca9dd030cee4f29c4c1aded4dbf9cc124ecb`,
      nTime `1744502400`, nonce `1992861`) — `chainparams.cpp:153`
- [x] SHA3-256 PoW (FIPS 202) replaces SHA256d — `node/src/hash.h`,
      `node/src/pow.cpp`
- [x] ML-DSA-87 (FIPS 204 Level 5) bindings to liboqs —
      `node/src/crypto/pqc/ml_dsa87.cpp`
- [x] CBDC_MINT consensus rules: per-block cap 5B GRD, per-tx cap 1B GRD,
      max 10 mint txs/block, rate-limited by `MAX_MINT_PER_BLOCK` —
      `node/src/validation.cpp:2666-2685`
- [x] Replay protection: `SHA256(CHAIN_ID \|\| tx.GetHash())` sighash —
      `node/src/cbdc/authority.cpp:146`
- [x] `CBDC::RequirePQCAuth` gate on all 17 privileged RPCs with
      ML-DSA-87 audit signature logged to `debug.log`
- [x] 38/38 unit tests pass (`src/test/test_bitcoin --run_test=garudachain*`)
- [ ] **BLOCKER** External cryptographic audit of the hybrid Schnorr +
      ML-DSA-87 mint path. No public value should be protected by this code
      until at least one independent firm has signed off.
- [ ] **BLOCKER** Fresh genesis block verified end-to-end: start from an
      empty datadir, mine to height 200, run `-reindex-chainstate`, confirm
      reindex matches tip.

## P0 — Secrets, keys, and config

- [x] `DEFAULT_AUTHORITY_PUBKEY_HEX`, `DEFAULT_AUTHORITY_PQC_PUBKEY_HASH_HEX`,
      `DEFAULT_APBN_PUBKEYHASH_HEX` all ship empty —
      `node/src/cbdc/authority.h:15`
- [x] `generatepqckeypair` returns raw-byte SHA256 (not byte-reversed
      `uint256::GetHex()`) so operators can copy directly into `bitcoin.conf`
- [x] All dev shell scripts (`start.sh`, `stop.sh`, `reset-chain.sh`,
      `garuda-wallet.sh`, `mine-live.sh`, `start-mainnet.sh`,
      `test_100_wallets.sh`) load creds from `.env` and refuse to run if
      unset
- [x] `docker-compose.yml` reads `${GARUDA_RPC_PASS_CBDC:?}` from env
- [x] `docker-compose.ci.yml` + `.github/workflows/ci.yml`: hardcoded
      regtest creds documented as ephemeral-only
- [ ] **BLOCKER** Real mainnet authority key generated on an air-gapped
      machine, stored in an HSM (YubiHSM 2 / AWS CloudHSM / HashiCorp
      Vault), never touching a disk or shell history
- [ ] **BLOCKER** APBN treasury multisig keys generated on separate
      hardware, distributed to separate custodians; `-cbdctreasurymultisig`
      finalized (recommended: `3-of-5`) with `-cbdctreasurytimelock=144`
- [ ] Authority rotation dry-run: use `rotateauthoritykey` on testnet,
      verify old key can't sign after rotation

## P1 — Network and seeds

- [x] DNS seeds listed in chainparams: `seed.garudachain.id`,
      `seed2.garudachain.id` — `chainparams.cpp:160-161`
- [ ] **BLOCKER** DNS seed infrastructure deployed and reachable from
      public internet (seeder daemon in `seeder/`, monitored, 2+ regions)
- [ ] `vFixedSeeds` populated with a minimum of 8 hardcoded IP seeds in
      `chainparamsseeds.h` for bootstrap resilience — currently empty
      (`vFixedSeeds.clear()` at `chainparams.cpp:175`)
- [ ] At least 4 reference mainnet nodes running with different operators
      before genesis miner is unlocked
- [ ] Explorer and API server deployed and reachable
- [ ] Rate-limited public RPC endpoint (read-only) for wallet bootstrap

## P1 — Monitoring and incident response

- [ ] Prometheus metrics exported by `garudaapi` scraped by a running
      Prometheus instance; alert rules defined for:
      - block height stall > 15 minutes
      - mempool size > 10 MB
      - failed mint sigs > 1/min
      - chain reorg > 3 blocks
- [ ] Grafana dashboard provisioned with the above metrics
- [ ] On-call rotation defined; PagerDuty/Opsgenie wired to alertmanager
- [ ] Audit log rotation configured (`GARUDA_AUDIT_FILE`, logrotate)
- [ ] Runbook for: authority key compromise, treasury key compromise,
      consensus fork, mempool flood, DNS seed outage

## P1 — Build, CI, and distribution

- [x] `.gitignore` excludes all build artifacts, node_modules, wallets,
      backup binaries, nested git repos, .claude state
- [x] Attribution documented in `ATTRIBUTION.md` with upstream Bitcoin Core
      commit pin
- [ ] `./configure --with-liboqs` works from a fresh git clone on a clean
      Ubuntu 22.04 / Debian 12 VM
- [ ] Release tarball produced by `make dist` — verify it builds
- [ ] Docker image published to a public registry, tag `mainnet-v1.0.0`
- [ ] GPG signing key for release tags registered (`git tag -s`)
- [ ] Reproducible build attestation: two independent builders produce
      byte-identical binaries from the same source commit

## P2 — Wallets and tooling

- [x] CLI NUM-arg coercion for `mintgaruda`, `burngaruda`, `depositgrd`,
      `withdrawgrd`, `issuepegged` — `node/src/rpc/client.cpp:346-351`
- [ ] Desktop Qt wallet builds cleanly from source (`--with-gui=qt5`);
      signed binaries for Linux/macOS/Windows
- [ ] Mobile wallet (`mobile/`) ships both iOS and Android in their
      respective app stores
- [ ] Browser extension (`extension/`) passes Chrome Web Store + Firefox
      Add-ons review
- [ ] Hardware wallet integration (Trezor and Ledger) — at least plan
      and upstream PRs filed, even if not merged by launch

## P2 — Legal and governance

- [ ] Licensing: MIT confirmed throughout; `ATTRIBUTION.md` lists every
      bundled third-party library with its own license
- [ ] Trademark clearance for "GarudaChain" and logomark
- [ ] Privacy policy + terms of service for any centralized components
      (explorer, API, mobile wallet backend)
- [ ] For a regulated Indonesia CBDC deployment: coordination with Bank
      Indonesia / OJK on pilot parameters, if that is the intended path
- [ ] CVE disclosure policy published (`SECURITY.md` already exists —
      make sure the email is monitored)

## P2 — Documentation

- [x] `README.md` updated with correct privileged-RPC command names
      (`mintgaruda`, `issueasset`, `mintasset`, etc.)
- [x] Known Limitations section listing pre-audit caveats
- [ ] Developer onboarding guide: how to run regtest, how to mint test
      GRD, how to deploy a local explorer
- [ ] Validator operator guide: how to generate + store authority keys,
      how to rotate, how to recover from key loss (if possible)
- [ ] Wallet user guide: how to receive, send, back up seed, import
- [ ] API reference: full `garudaapi` route documentation (openapi.yaml)
- [ ] Whitepaper or spec document describing consensus, PQC integration,
      CBDC rules, and treasury model

---

## Launch day runbook sketch

1. **T-7d**: final external audit report delivered; all BLOCKER items
   green on this doc.
2. **T-3d**: genesis pre-flight — reset chainparams with finalized
   `nTime`, mine genesis block, commit hash to `chainparams.cpp`, tag
   release candidate, reproducible build attestation.
3. **T-1d**: deploy DNS seeds, deploy 4+ reference nodes (different
   operators), run final integration test against fresh network.
4. **T-0**: genesis block broadcast by designated operator. Monitor
   first 100 blocks live via explorer + metrics. Do NOT mint any CBDC
   in the first 100 blocks — let the network reach steady state first.
5. **T+24h**: post-launch retrospective; patch any non-consensus bugs
   caught; tag `mainnet-v1.0.1` if needed.
6. **T+7d**: open a public issue tracker, announce bug bounty program.

---

## Done / not done snapshot

As of this document's commit, the engineering work below the
**BLOCKER** line is ≈80% complete; every BLOCKER item above is still
open. Do not treat this codebase as launch-ready for protecting real
value — it is launch-ready for testnet / public audit review.
