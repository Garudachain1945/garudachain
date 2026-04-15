#!/usr/bin/env python3
# Copyright (c) 2026 GarudaChain developers
# Distributed under the MIT software license, see the accompanying
# file COPYING or http://www.opensource.org/licenses/mit-license.php.
"""Test ML-DSA-87 post-quantum address generation and transaction signing.

Tests:
  - generatepqckeypair returns valid publicKey and secretKey hex
  - getpqcaddress returns a bech32m grd1z... address (witness v2, P2PQH)
  - Address is deterministic: same pubkey → same address
  - verifypqcsig returns true for a valid signature
  - verifypqcsig returns false for a tampered signature
  - PQC transactions are accepted by the mempool and mined
"""

from test_framework.test_framework import BitcoinTestFramework
from test_framework.util import assert_equal, assert_raises_rpc_error


class PQCAddressTest(BitcoinTestFramework):
    def set_test_params(self):
        self.num_nodes = 1
        self.setup_clean_chain = True

    def skip_test_if_missing_module(self):
        self.skip_if_no_wallet()

    def run_test(self):
        node = self.nodes[0]

        self.log.info("Mine initial blocks so coinbase is spendable")
        self.generate(node, 101)

        # ── keypair generation ────────────────────────────────────────────
        self.log.info("Test: generatepqckeypair returns publicKey and secretKey")
        kp = node.generatepqckeypair()
        assert "publicKey" in kp, "keypair missing publicKey field"
        assert "secretKey" in kp, "keypair missing secretKey field"
        # ML-DSA-87: publicKey = 2592 bytes = 5184 hex chars
        assert_equal(len(kp["publicKey"]), 5184)
        # ML-DSA-87: secretKey = 4896 bytes = 9792 hex chars
        assert_equal(len(kp["secretKey"]), 9792)

        # ── address derivation ────────────────────────────────────────────
        self.log.info("Test: getpqcaddress produces grd1z... bech32m address")
        addr = node.getpqcaddress(kp["publicKey"])
        assert addr.startswith("grd1z"), f"expected grd1z... prefix, got {addr!r}"

        # Deterministic: same pubkey → same address
        addr2 = node.getpqcaddress(kp["publicKey"])
        assert_equal(addr, addr2)

        # Different keypair → different address
        kp2 = node.generatepqckeypair()
        addr3 = node.getpqcaddress(kp2["publicKey"])
        assert addr != addr3, "different keypairs produced the same address"

        # ── signature verification ────────────────────────────────────────
        self.log.info("Test: verifypqcsig accepts valid signature")
        message = "GarudaChain post-quantum signature test"
        sig_result = node.signpqcmessage(kp["secretKey"], message)
        assert "signature" in sig_result, "signpqcmessage missing signature field"

        ok = node.verifypqcsig(addr, message, sig_result["signature"])
        assert ok, "verifypqcsig should return true for a valid signature"

        self.log.info("Test: verifypqcsig rejects tampered signature")
        bad_sig = sig_result["signature"][:-4] + "0000"
        ok_bad = node.verifypqcsig(addr, message, bad_sig)
        assert not ok_bad, "verifypqcsig should return false for a tampered signature"

        self.log.info("Test: verifypqcsig rejects wrong address")
        ok_wrong_addr = node.verifypqcsig(addr3, message, sig_result["signature"])
        assert not ok_wrong_addr, "verifypqcsig should return false for wrong address"

        # ── send to PQC address ───────────────────────────────────────────
        self.log.info("Test: send GRD to a P2PQH (quantum-safe) address")
        txid = node.sendtoaddress(addr, 0.5)
        assert txid, "sendtoaddress to PQC address returned empty txid"

        self.log.info("Test: PQC-address tx is mined in next block")
        self.generate(node, 1)
        tx_info = node.gettransaction(txid)
        assert_equal(tx_info["confirmations"], 1)

        self.log.info("All PQC address tests passed")


if __name__ == "__main__":
    PQCAddressTest(__file__).main()
