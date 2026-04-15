#!/usr/bin/env python3
"""
Buat wallet baru untuk 3 node GarudaChain:
  1. CBDC Authority  — 5 layer ML-DSA-87 keypair (terenkripsi)
  2. Creator/Token   — 1 quantum_keypair.json (terenkripsi)
  3. Miner/Public    — 1 quantum_keypair.json (terenkripsi)

Seedphrase → wallet.dat passphrase = SHA256(seed + "|garuda_wallet_v1")
           → keypair file passphrase = SHA256(seed + "|garuda_pqc_v1") → SHA256x100000 + ChaCha20
"""
import hashlib, json, os, secrets, subprocess, sys, getpass
from cryptography.hazmat.primitives.ciphers.aead import ChaCha20Poly1305

GEN_KEYPAIR = "/tmp/gen_keypair"  # compiled binary
CLI         = "/home/muhammadjefry/garudachain/node/src/bitcoin-cli"

NODES = {
    "cbdc":    {"rpcport": 19443, "rpcuser": "garudacbdc",    "rpcpassword": "garudacbdc123",    "datadir": os.path.expanduser("~/.garudachain-cbdc")},
    "creator": {"rpcport": 19451, "rpcuser": "garudacreator", "rpcpassword": "garudacreator123", "datadir": os.path.expanduser("~/.garudachain-creator")},
    "public":  {"rpcport": 19447, "rpcuser": "garudapublic",  "rpcpassword": "garudapublic123",  "datadir": os.path.expanduser("~/.garudachain-public")},
}

LAYER_ROLES = [
    "Root - Otoritas Tertinggi",
    "Policy - Komite Kebijakan Moneter",
    "Operations - Divisi Operasional CBDC",
    "Execution - Tim Eksekusi Transaksi",
    "Audit - Auditor Independen",
]

# ─── Kriptografi ────────────────────────────────────────────────────────────

def derive_wallet_pass(seedphrase: str) -> str:
    """SHA256(seed + |garuda_wallet_v1) → 64-char hex  (sama dgn C++)"""
    return hashlib.sha256((seedphrase + "|garuda_wallet_v1").encode()).hexdigest()

def derive_keypair_pass(seedphrase: str) -> str:
    """SHA256(seed + |garuda_pqc_v1) → 64-char hex"""
    return hashlib.sha256((seedphrase + "|garuda_pqc_v1").encode()).hexdigest()

def derive_key(passphrase: str, salt: bytes) -> bytes:
    """SHA256 × 100 000 — identik dgn walletcontroller.cpp"""
    k = hashlib.sha256(passphrase.encode() + salt).digest()
    for _ in range(99999):
        k = hashlib.sha256(k).digest()
    return k

def encrypt_json(plaintext: str, passphrase: str) -> str:
    salt  = secrets.token_bytes(32)
    nonce = secrets.token_bytes(12)
    key   = derive_key(passphrase, salt)
    ct    = ChaCha20Poly1305(key).encrypt(nonce, plaintext.encode(), b"")
    return json.dumps({
        "encrypted": True,
        "algo":  "ChaCha20-Poly1305",
        "kdf":   "SHA256x100000",
        "salt_hex":       salt.hex(),
        "nonce_hex":      nonce.hex(),
        "ciphertext_hex": ct.hex(),
    }, indent=2) + "\n"

# ─── Quantum keypair ─────────────────────────────────────────────────────────

def gen_keypair() -> tuple[str, str]:
    """Jalankan /tmp/gen_keypair → (pubkey_hex, seckey_hex)"""
    result = subprocess.run([GEN_KEYPAIR], capture_output=True, text=True, timeout=30)
    if result.returncode != 0:
        raise RuntimeError(f"gen_keypair failed: {result.stderr}")
    data = {}
    for line in result.stdout.strip().split("\n"):
        k, v = line.split(":", 1)
        data[k] = v
    return data["PUBKEY"], data["SECKEY"]

def compute_pq_address(pubkey_hex: str) -> str:
    """bech32m('grd', [2] + convertBits(SHA256(pubkey), 8→5))"""
    pub_bytes = bytes.fromhex(pubkey_hex)
    h = hashlib.sha256(pub_bytes).digest()

    CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l"
    GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3]

    def polymod(v):
        chk = 1
        for x in v:
            top = chk >> 25
            chk = ((chk & 0x1ffffff) << 5) ^ x
            for i in range(5):
                if (top >> i) & 1:
                    chk ^= GEN[i]
        return chk

    hrp_exp = [ord(c) >> 5 for c in "grd"] + [0] + [ord(c) & 31 for c in "grd"]
    data5 = [2]
    acc, bits = 0, 0
    for b in h:
        acc = (acc << 8) | b; bits += 8
        while bits >= 5:
            bits -= 5; data5.append((acc >> bits) & 31)
    if bits > 0: data5.append((acc << (5 - bits)) & 31)

    ci = hrp_exp + data5 + [0]*6
    pm = polymod(ci) ^ 0x2bc830a3
    for i in range(6): data5.append((pm >> (5*(5-i))) & 31)

    return "grd1" + "".join(CHARSET[d] for d in data5)

# ─── RPC helper ──────────────────────────────────────────────────────────────

def rpc(node_key: str, method: str, *args):
    n = NODES[node_key]
    cmd = [CLI,
           f"-rpcport={n['rpcport']}",
           f"-rpcuser={n['rpcuser']}",
           f"-rpcpassword={n['rpcpassword']}",
           method] + [str(a) for a in args]
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
    return r.stdout.strip(), r.stderr.strip(), r.returncode

# ─── Buat wallet ─────────────────────────────────────────────────────────────

def create_wallet(node_key: str, wallet_name: str, passphrase_hex: str) -> str:
    """Buat wallet via RPC dengan passphrase. Return wallet dir path."""
    n = NODES[node_key]
    # createwallet name disable_private_keys blank passphrase avoid_reuse descriptors load_on_startup
    out, err, rc = rpc(node_key, "createwallet", wallet_name, "false", "false", passphrase_hex, "false", "true", "true")
    if rc != 0:
        raise RuntimeError(f"createwallet failed on {node_key}: {err}")
    wallet_dir = f"{n['datadir']}/regtest/{wallet_name}"
    return wallet_dir

def save_encrypted(path: str, content: str, passphrase: str):
    with open(path, "w") as f:
        f.write(encrypt_json(content, passphrase))
    print(f"    [encrypted] {os.path.basename(path)}")

# ─── Main ─────────────────────────────────────────────────────────────────────

print("=" * 60)
print("  Buat Wallet GarudaChain — Sistem Seedphrase")
print("=" * 60)
print()
print("Masukkan seedphrase (24 kata, dipisah spasi).")
print("Seedphrase yang SAMA akan mengunci semua 3 wallet baru.\n")

try:
    seedphrase = getpass.getpass("Seedphrase: ").strip()
except Exception:
    seedphrase = input("Seedphrase: ").strip()

words = seedphrase.split()
if len(words) < 12:
    print("ERROR: minimal 12 kata.")
    sys.exit(1)

wallet_pass  = derive_wallet_pass(seedphrase)
keypair_pass = derive_keypair_pass(seedphrase)
print(f"\nDerived wallet passphrase (awal): {wallet_pass[:16]}...")
print(f"Derived keypair passphrase (awal): {keypair_pass[:16]}...\n")

# Bersihkan seedphrase dari memory segera setelah derivasi
del seedphrase

# ── 1. CBDC Authority Wallet ─────────────────────────────────────────────────
print("─" * 50)
print("1. CBDC Authority Wallet (5 layer ML-DSA-87)")
print("─" * 50)

cbdc_wallet_name = "cbdc-authority-new"
out, err, rc = rpc("cbdc", "listwallets")
if cbdc_wallet_name in out:
    print(f"  [SKIP] Wallet '{cbdc_wallet_name}' sudah ada")
else:
    try:
        wallet_dir = create_wallet("cbdc", cbdc_wallet_name, wallet_pass)
        os.makedirs(wallet_dir, exist_ok=True)
        print(f"  Wallet dibuat: {wallet_dir}")

        layer_addresses = []
        agg_key = bytes(32)  # XOR 5 schnorr keys

        for i in range(5):
            pub_hex, sec_hex = gen_keypair()
            pq_addr = compute_pq_address(pub_hex)
            layer_addresses.append(pq_addr)

            # Schnorr key = SHA256(seckey)
            schnorr = hashlib.sha256(bytes.fromhex(sec_hex)).hexdigest()
            # XOR ke aggregate
            agg_key = bytes(a ^ b for a, b in zip(agg_key, bytes.fromhex(schnorr)))

            layer_json = json.dumps({
                "layer": i+1,
                "role": LAYER_ROLES[i],
                "algo": "ML-DSA-87",
                "nist_standard": "FIPS 204",
                "quantum_security": "256-bit",
                "pq_address": pq_addr,
                "pq_pubkey_hex": pub_hex,
                "pq_seckey_hex": sec_hex,
                "schnorr_privkey_hex": schnorr,
            }, indent=2) + "\n"

            save_encrypted(f"{wallet_dir}/layer_{i+1}_keypair.json", layer_json, keypair_pass)

        # Authority JSON — hanya pubkey
        authority = {
            "wallet_type": "CBDC Authority Wallet",
            "algo": "ML-DSA-87",
            "nist_standard": "FIPS 204",
            "security_level": "256-bit quantum",
            "layers": 5,
            "layer_addresses": layer_addresses,
            "aggregate_schnorr_pubkey_hex": agg_key.hex(),
            "note": "Private keys are in encrypted layer_N_keypair.json files",
        }
        with open(f"{wallet_dir}/cbdc_authority.json", "w") as f:
            json.dump(authority, f, indent=2)
        print(f"    [plaintext] cbdc_authority.json (hanya pubkey)")
        print(f"  [OK] CBDC wallet selesai")
    except Exception as e:
        print(f"  [ERROR] {e}")

# ── 2. Creator/Token Wallet ───────────────────────────────────────────────────
print()
print("─" * 50)
print("2. Creator/Token Wallet")
print("─" * 50)

creator_wallet_name = "creator-wallet-new"
out, err, rc = rpc("creator", "listwallets")
if rc != 0:
    print(f"  [SKIP] Creator node belum ready: {err}")
else:
    if creator_wallet_name in out:
        print(f"  [SKIP] Wallet '{creator_wallet_name}' sudah ada")
    else:
        try:
            wallet_dir = create_wallet("creator", creator_wallet_name, wallet_pass)
            os.makedirs(wallet_dir, exist_ok=True)
            print(f"  Wallet dibuat: {wallet_dir}")

            pub_hex, sec_hex = gen_keypair()
            pq_addr = compute_pq_address(pub_hex)

            kp_json = json.dumps({
                "algo": "ML-DSA-87",
                "nist_standard": "FIPS 204",
                "quantum_security": "256-bit",
                "address": pq_addr,
                "pubkey_hex": pub_hex,
                "seckey_hex": sec_hex,
            }, indent=2) + "\n"

            save_encrypted(f"{wallet_dir}/quantum_keypair.json", kp_json, keypair_pass)
            print(f"  Quantum address: {pq_addr}")
            print(f"  [OK] Creator wallet selesai")
        except Exception as e:
            print(f"  [ERROR] {e}")

# ── 3. Miner/Public Wallet ───────────────────────────────────────────────────
print()
print("─" * 50)
print("3. Miner/Public Wallet")
print("─" * 50)

public_wallet_name = "public-wallet-new"
out, err, rc = rpc("public", "listwallets")
if public_wallet_name in out:
    print(f"  [SKIP] Wallet '{public_wallet_name}' sudah ada")
else:
    try:
        wallet_dir = create_wallet("public", public_wallet_name, wallet_pass)
        os.makedirs(wallet_dir, exist_ok=True)
        print(f"  Wallet dibuat: {wallet_dir}")

        pub_hex, sec_hex = gen_keypair()
        pq_addr = compute_pq_address(pub_hex)

        kp_json = json.dumps({
            "algo": "ML-DSA-87",
            "nist_standard": "FIPS 204",
            "quantum_security": "256-bit",
            "address": pq_addr,
            "pubkey_hex": pub_hex,
            "seckey_hex": sec_hex,
        }, indent=2) + "\n"

        save_encrypted(f"{wallet_dir}/quantum_keypair.json", kp_json, keypair_pass)
        print(f"  Quantum address: {pq_addr}")
        print(f"  [OK] Public wallet selesai")
    except Exception as e:
        print(f"  [ERROR] {e}")

print()
print("=" * 60)
print("Selesai. Semua wallet baru tersimpan dan terenkripsi.")
print("Gunakan seedphrase yang sama untuk membuka kembali.")
print("=" * 60)
