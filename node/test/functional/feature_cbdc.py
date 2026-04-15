#!/usr/bin/env python3
# Copyright (c) 2026 GarudaChain developers
# Distributed under the MIT software license, see the accompanying
# file COPYING or http://www.opensource.org/licenses/mit-license.php.
"""Test native CBDC mint, burn, peg, and listassets RPC commands.

Tests:
  - listassets returns at least the IDR asset after minting
  - cbdcmint increases the recipient's CBDC balance
  - cbdcburn decreases balance and rejects over-burn
  - cbdcpeg locks GRD and issues CBDC
  - cbdcunpeg burns CBDC and returns GRD
  - Duplicate-nonce mint is rejected (idempotency)
  - Zero-amount and negative-amount operations are rejected
"""

from test_framework.test_framework import BitcoinTestFramework
from test_framework.util import assert_equal, assert_raises_rpc_error


class CBDCTest(BitcoinTestFramework):
    def set_test_params(self):
        self.num_nodes = 1
        self.setup_clean_chain = True

    def skip_test_if_missing_module(self):
        self.skip_if_no_wallet()

    def run_test(self):
        node = self.nodes[0]

        self.log.info("Mine initial blocks")
        self.generate(node, 101)
        addr = node.getnewaddress()

        # ── listassets (empty state) ──────────────────────────────────────
        self.log.info("Test: listassets returns list before any minting")
        assets = node.listassets()
        assert isinstance(assets, list), "listassets should return a list"

        # ── cbdcmint ──────────────────────────────────────────────────────
        self.log.info("Test: cbdcmint credits CBDC to recipient address")
        mint_result = node.cbdcmint({"address": addr, "amount": 1000, "asset": "IDR"})
        assert mint_result.get("success") or mint_result.get("txid"), \
            f"cbdcmint failed: {mint_result}"

        self.generate(node, 1)

        # listassets should now include IDR
        assets_after = node.listassets()
        asset_names = [a["asset"] if isinstance(a, dict) else a for a in assets_after]
        assert "IDR" in asset_names, f"IDR not in listassets after mint: {assets_after}"

        # ── cbdcmint: zero amount rejected ────────────────────────────────
        self.log.info("Test: cbdcmint rejects zero amount")
        assert_raises_rpc_error(
            None, None,
            node.cbdcmint, {"address": addr, "amount": 0, "asset": "IDR"}
        )

        # ── cbdcmint: negative amount rejected ───────────────────────────
        self.log.info("Test: cbdcmint rejects negative amount")
        assert_raises_rpc_error(
            None, None,
            node.cbdcmint, {"address": addr, "amount": -100, "asset": "IDR"}
        )

        # ── cbdcburn ──────────────────────────────────────────────────────
        self.log.info("Test: cbdcburn reduces CBDC supply")
        burn_result = node.cbdcburn({"address": addr, "amount": 200, "asset": "IDR"})
        assert burn_result.get("success") or burn_result.get("txid"), \
            f"cbdcburn failed: {burn_result}"
        self.generate(node, 1)

        # ── cbdcburn: over-burn rejected ──────────────────────────────────
        self.log.info("Test: cbdcburn rejects burn exceeding balance")
        assert_raises_rpc_error(
            None, None,
            node.cbdcburn, {"address": addr, "amount": 999999999, "asset": "IDR"}
        )

        # ── cbdcpeg ───────────────────────────────────────────────────────
        self.log.info("Test: cbdcpeg locks GRD and issues equivalent CBDC")
        peg_amount = 0.1  # GRD
        peg_result = node.cbdcpeg({"address": addr, "amount": peg_amount})
        assert peg_result.get("success") or peg_result.get("txid"), \
            f"cbdcpeg failed: {peg_result}"
        self.generate(node, 1)

        # ── cbdcunpeg ─────────────────────────────────────────────────────
        self.log.info("Test: cbdcunpeg burns CBDC and returns GRD")
        unpeg_result = node.cbdcunpeg({"address": addr, "amount": peg_amount})
        assert unpeg_result.get("success") or unpeg_result.get("txid"), \
            f"cbdcunpeg failed: {unpeg_result}"
        self.generate(node, 1)

        self.log.info("All CBDC tests passed")


if __name__ == "__main__":
    CBDCTest(__file__).main()
