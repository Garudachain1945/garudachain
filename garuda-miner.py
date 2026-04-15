#!/usr/bin/env python3
"""
GarudaChain — Real PQC Proof-of-Work CPU Miner
===============================================
PoW algorithm: SHA3-256 (NIST FIPS 202, Keccak sponge construction)

Unlike Bitcoin's SHA256d (Merkle-Damgård), GarudaChain uses SHA3-256
from the NIST post-quantum cryptography standard family. SHA3's sponge
construction provides a fundamentally different security model, making
GarudaChain's PoW fully independent of any future SHA-2 vulnerability.

Mining loop:
  1. Fetch block template via RPC `getblocktemplate`
  2. Build coinbase transaction (with segwit witness commitment)
  3. Compute merkle root (SHA256d — for tx ID compatibility)
  4. Grind header nonce with SHA3-256 until hash <= target
  5. Submit solved block via RPC `submitblock`

Full PQC stack:
  - PoW:        SHA3-256 (block hashing)
  - Signatures: ML-DSA-87 (FIPS 204 Level 5, wallet P2PQH addresses)
  - CBDC:       Schnorr + ML-DSA-87 dual signature
"""
import argparse
import base64
import hashlib
import json
import os
import random
import struct
import sys
import time
import urllib.error
import urllib.request

# ── ANSI colors ──────────────────────────────────────────────────────────────
class C:
    R = '\033[0;31m'; G = '\033[0;32m'; Y = '\033[1;33m'
    B = '\033[0;34m'; M = '\033[0;35m'; CY = '\033[0;36m'
    BOLD = '\033[1m'; DIM = '\033[2m'; RB = '\033[1;31m'; NC = '\033[0m'

def banner():
    print(C.RB + r"""
  ██████╗  █████╗ ██████╗ ██╗   ██╗██████╗  █████╗  ██████╗██╗  ██╗ █████╗ ██╗███╗   ██╗
 ██╔════╝ ██╔══██╗██╔══██╗██║   ██║██╔══██╗██╔══██╗██╔════╝██║  ██║██╔══██╗██║████╗  ██║
 ██║  ███╗███████║██████╔╝██║   ██║██║  ██║███████║██║     ███████║███████║██║██╔██╗ ██║
 ██║   ██║██╔══██║██╔══██╗██║   ██║██║  ██║██╔══██║██║     ██╔══██║██╔══██║██║██║╚██╗██║
 ╚██████╔╝██║  ██║██║  ██║╚██████╔╝██████╔╝██║  ██║╚██████╗██║  ██║██║  ██║██║██║ ╚████║
  ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝ ╚═════╝ ╚═╝  ╚═╝ ╚═════╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝╚═╝  ╚═══╝
""" + C.NC)
    print(f"{C.BOLD}{C.CY}      ── PQC Proof-of-Work Miner (SHA3-256) ──{C.NC}\n")

# ── Hash functions ────────────────────────────────────────────────────────────
def sha3(b: bytes) -> bytes:
    """SHA3-256 (NIST FIPS 202) — GarudaChain PQC PoW hash."""
    return hashlib.sha3_256(b).digest()

def dsha(b: bytes) -> bytes:
    """SHA256d — used for txid and merkle tree (not PoW)."""
    return hashlib.sha256(hashlib.sha256(b).digest()).digest()

# ── Minimal JSON-RPC client ──────────────────────────────────────────────────
class RPC:
    def __init__(self, host, port, user, pw):
        self.base = f"http://{host}:{port}"
        self.auth = "Basic " + base64.b64encode(f"{user}:{pw}".encode()).decode()

    def call(self, method, *params, wallet=None):
        url = self.base + (f"/wallet/{wallet}" if wallet else "/")
        body = json.dumps({
            "jsonrpc": "1.0", "id": "garuda-miner",
            "method": method, "params": list(params),
        }).encode()
        req = urllib.request.Request(url, data=body, headers={
            "Authorization": self.auth, "Content-Type": "application/json",
        })
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                res = json.loads(r.read())
            if res.get("error"):
                raise RuntimeError(f"{method}: {res['error']}")
            return res["result"]
        except urllib.error.HTTPError as e:
            body = e.read().decode()[:300]
            raise RuntimeError(f"{method} HTTP {e.code}: {body}")

# ── Bitcoin serialization helpers ────────────────────────────────────────────
def varint(n: int) -> bytes:
    if n < 0xfd:        return bytes([n])
    if n <= 0xffff:     return b'\xfd' + struct.pack('<H', n)
    if n <= 0xffffffff: return b'\xfe' + struct.pack('<I', n)
    return b'\xff' + struct.pack('<Q', n)

def push_bytes(b: bytes) -> bytes:
    n = len(b)
    if n < 0x4c:    return bytes([n]) + b
    if n <= 0xff:   return b'\x4c' + bytes([n]) + b
    if n <= 0xffff: return b'\x4d' + struct.pack('<H', n) + b
    return b'\x4e' + struct.pack('<I', n) + b

def push_height(h: int) -> bytes:
    # BIP34: coinbase must push block height as minimal signed LE integer
    if h == 0:
        return b'\x00'
    out = b''
    n = h
    while n:
        out += bytes([n & 0xff])
        n >>= 8
    if out[-1] & 0x80:
        out += b'\x00'
    return bytes([len(out)]) + out

def bits_to_target(bits_hex: str) -> int:
    bits = int(bits_hex, 16)
    exp  = bits >> 24
    mant = bits & 0xffffff
    if exp <= 3:
        return mant >> (8 * (3 - exp))
    return mant << (8 * (exp - 3))

# ── Coinbase construction ────────────────────────────────────────────────────
def build_coinbase(height, value, spk_hex, extranonce, witness_commit_hex):
    version  = struct.pack('<I', 2)
    locktime = struct.pack('<I', 0)

    # scriptSig: <push height> <push extranonce>
    script_sig = push_height(height) + push_bytes(extranonce)

    # Single input (null prevout, max sequence)
    prev = b'\x00' * 32 + struct.pack('<I', 0xffffffff)
    inp  = prev + varint(len(script_sig)) + script_sig + struct.pack('<I', 0xffffffff)

    # Outputs: (1) reward, (2) witness commitment if segwit
    spk = bytes.fromhex(spk_hex)
    outs = struct.pack('<Q', value) + varint(len(spk)) + spk
    n_out = 1
    if witness_commit_hex:
        wc = bytes.fromhex(witness_commit_hex)
        outs += struct.pack('<Q', 0) + varint(len(wc)) + wc
        n_out = 2

    # Non-witness serialization → txid
    non_witness = version + varint(1) + inp + varint(n_out) + outs + locktime
    txid_le = dsha(non_witness)

    # Full serialization (with segwit witness reserved value)
    witness = varint(1) + b'\x20' + b'\x00' * 32
    full = version + b'\x00\x01' + varint(1) + inp + varint(n_out) + outs + witness + locktime

    return full, txid_le

def merkle_root(txids_le):
    if not txids_le:
        return b'\x00' * 32
    layer = list(txids_le)
    while len(layer) > 1:
        if len(layer) % 2:
            layer.append(layer[-1])
        layer = [dsha(layer[i] + layer[i + 1]) for i in range(0, len(layer), 2)]
    return layer[0]

# ── Wallet integration: get a mining scriptPubKey ────────────────────────────
def get_miner_spk(rpc, wallet):
    # Use a legacy address so scriptPubKey encoding is trivial for all miners.
    try:
        addr = rpc.call("getnewaddress", "miner", "legacy", wallet=wallet)
    except RuntimeError:
        addr = rpc.call("getnewaddress", "miner", wallet=wallet)
    info = rpc.call("getaddressinfo", addr, wallet=wallet)
    return addr, info["scriptPubKey"]

# ── Mining core ──────────────────────────────────────────────────────────────
def mine_one(rpc, spk_hex, min_hashes, verbose=True):
    tmpl = rpc.call("getblocktemplate", {"rules": ["segwit"]})
    version      = tmpl["version"]
    prev_hash    = tmpl["previousblockhash"]
    height       = tmpl["height"]
    bits         = tmpl["bits"]
    curtime      = tmpl["curtime"]
    coinbasevalue = tmpl["coinbasevalue"]
    txs          = tmpl.get("transactions", [])
    wc           = tmpl.get("default_witness_commitment")
    target       = bits_to_target(bits)

    extranonce = os.urandom(8)
    cb_full, cb_txid = build_coinbase(height, coinbasevalue, spk_hex, extranonce, wc)

    all_txids = [cb_txid] + [bytes.fromhex(t["txid"])[::-1] for t in txs]
    mroot = merkle_root(all_txids)

    header_base = (
        struct.pack('<I', version)
        + bytes.fromhex(prev_hash)[::-1]
        + mroot
        + struct.pack('<I', curtime)
        + bytes.fromhex(bits)[::-1]
    )

    start_nonce = random.randint(0, 0x7fffffff)
    t0 = time.time()
    hashes = 0
    LOG_EVERY = 100_000
    found_nonce = None

    for i in range(2**32):
        nonce = (start_nonce + i) & 0xffffffff
        header = header_base + struct.pack('<I', nonce)
        h = sha3(header)
        hashes += 1

        # Target check: hash interpreted big-endian
        h_int = int.from_bytes(h[::-1], 'big')

        # min_hashes forces the miner to grind at least N SHA256d ops even
        # if the target would accept sooner (regtest target is trivially met).
        # This simulates real mining work for the demo.
        if h_int <= target and hashes >= min_hashes:
            found_nonce = nonce
            found_hash = h[::-1].hex()
            break

        if verbose and hashes % LOG_EVERY == 0:
            el = time.time() - t0 + 1e-6
            rate = hashes / el
            sys.stdout.write(
                f"\r  {C.DIM}grinding{C.NC} height={C.BOLD}{height}{C.NC} "
                f"hashes={hashes:>12,} rate={C.Y}{fmt_rate(rate)}{C.NC}   "
            )
            sys.stdout.flush()

    if verbose:
        sys.stdout.write("\r" + " " * 100 + "\r")
        sys.stdout.flush()

    elapsed = time.time() - t0 + 1e-6
    rate = hashes / elapsed

    # Build complete block for submission
    block = (
        header_base + struct.pack('<I', found_nonce)
        + varint(1 + len(txs))
        + cb_full
    )
    for t in txs:
        block += bytes.fromhex(t["data"])

    result = rpc.call("submitblock", block.hex())
    if result not in (None, ""):
        raise RuntimeError(f"submitblock rejected: {result}")

    return {
        "height":  height,
        "hash":    found_hash,
        "nonce":   found_nonce,
        "hashes":  hashes,
        "rate":    rate,
        "elapsed": elapsed,
        "target":  target,
    }

# ── Formatting helpers ───────────────────────────────────────────────────────
def fmt_rate(r):
    if r > 1e9: return f"{r/1e9:.2f} GH/s"
    if r > 1e6: return f"{r/1e6:.2f} MH/s"
    if r > 1e3: return f"{r/1e3:.2f} KH/s"
    return f"{r:.0f} H/s"

def fmt_num(n):
    return f"{n:,}".replace(",", ".")

# ── CLI entrypoint ───────────────────────────────────────────────────────────
def main():
    p = argparse.ArgumentParser(description="GarudaChain Real PoW CPU Miner")
    p.add_argument("--rpc-host",  default="127.0.0.1")
    p.add_argument("--rpc-port",  type=int, default=19443)
    p.add_argument("--rpc-user",  default="garudacbdc")
    p.add_argument("--rpc-pass",  default="garudacbdc123")
    p.add_argument("--wallet",    default="cbdc-authority")
    p.add_argument("--count",     type=int, default=0,
                   help="Number of blocks to mine (0 = infinite, Ctrl+C to stop)")
    p.add_argument("--min-hashes", type=int, default=500_000,
                   help="Minimum SHA256d ops per block (default 500k — simulates "
                        "real difficulty since regtest target is trivial)")
    p.add_argument("--no-banner", action="store_true")
    args = p.parse_args()

    if not args.no_banner:
        banner()

    rpc = RPC(args.rpc_host, args.rpc_port, args.rpc_user, args.rpc_pass)

    try:
        info = rpc.call("getblockchaininfo")
    except Exception as e:
        print(f"{C.R}  [ERROR] Cannot connect to node at {args.rpc_host}:{args.rpc_port}{C.NC}")
        print(f"  {e}")
        sys.exit(1)

    addr, spk = get_miner_spk(rpc, args.wallet)

    print(f"  {C.DIM}Chain:{C.NC}  {info['chain']}    "
          f"{C.DIM}Height:{C.NC}  {info['blocks']}    "
          f"{C.DIM}Difficulty:{C.NC}  {info['difficulty']}")
    print(f"  {C.DIM}Wallet:{C.NC} {args.wallet}    "
          f"{C.DIM}Address:{C.NC} {C.CY}{addr}{C.NC}")
    print()
    W = 80
    print(f"{C.BOLD}{C.G}  ⛏  MINING STARTED — SHA3-256 PQC PoW — Ctrl+C to stop{C.NC}")
    print(f"  {C.DIM}{'─' * W}{C.NC}")

    mined = 0
    total_hashes = 0
    t_start = time.time()
    last_print = time.time()

    try:
        while True:
            res = mine_one(rpc, spk, args.min_hashes)
            mined += 1
            total_hashes += res["hashes"]
            now = time.time()
            tot_el = now - t_start + 1e-6
            avg_rate = total_hashes / tot_el
            bal = rpc.call("getbalance", wallet=args.wallet)
            ts = time.strftime('%H:%M:%S')

            # Live status line (overwritten each block, like cgminer)
            status = (
                f"  {C.G}[{ts}]{C.NC} "
                f"{C.BOLD}Block #{res['height']}{C.NC}  "
                f"Nonce: {res['nonce']}  "
                f"{C.Y}{fmt_rate(res['rate'])}{C.NC}  "
                f"Hashes: {fmt_num(res['hashes'])}  "
            )
            sys.stdout.write("\r" + " " * (W + 10) + "\r")
            sys.stdout.write(status)
            sys.stdout.flush()

            # Every 3 blocks, print a full log line (permanent, not overwritten)
            if mined % 3 == 0 or now - last_print > 5:
                last_print = now
                print()  # lock the status line
                print(
                    f"  {C.DIM}├─ found {C.BOLD}{C.G}{res['hash'][:32]}...{C.NC}"
                )
                print(
                    f"  {C.DIM}├─ mined={C.NC}{C.BOLD}{mined}{C.NC} "
                    f"{C.DIM}total_hashes={C.NC}{fmt_num(total_hashes)} "
                    f"{C.DIM}avg={C.NC}{C.Y}{fmt_rate(avg_rate)}{C.NC} "
                    f"{C.DIM}elapsed={C.NC}{int(tot_el)}s "
                    f"{C.DIM}balance={C.NC}{C.M}{C.BOLD}{bal} GRD{C.NC}"
                )

            if args.count and mined >= args.count:
                print()
                break
    except KeyboardInterrupt:
        print(f"\n\n  {C.Y}■ Mining stopped.{C.NC}")
    except RuntimeError as e:
        print(f"\n\n  {C.R}✗ Error: {e}{C.NC}")
        sys.exit(1)

    tot_el = time.time() - t_start + 1e-6
    try:
        bal = rpc.call("getbalance", wallet=args.wallet)
    except Exception:
        bal = "?"
    print(f"  {C.DIM}{'─' * W}{C.NC}")
    print(f"  {C.BOLD}Blocks: {mined}   "
          f"Hashes: {fmt_num(total_hashes)}   "
          f"Avg: {C.Y}{fmt_rate(total_hashes / tot_el)}{C.NC}{C.BOLD}   "
          f"Balance: {C.M}{bal} GRD{C.NC}")
    print()

if __name__ == "__main__":
    main()
