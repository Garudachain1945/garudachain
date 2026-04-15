#!/usr/bin/env python3
"""
Re-enkripsi file kunci kuantum menggunakan seedphrase wallet Anda.
Jalankan: python3 reencrypt_with_seedphrase.py

Passphrase enkripsi = SHA256(seedphrase + "|garuda_pqc_v1") — sama dengan kode C++.
Sehingga siapapun yang tahu seedphrase bisa decrypt file tanpa passphrase terpisah.
"""
import hashlib, json, os, secrets, sys, getpass
from cryptography.hazmat.primitives.ciphers.aead import ChaCha20Poly1305

CURRENT_PASS = "GarudaChain_PQC_2024_Secure!"  # passphrase lama (sesi sebelumnya)

def derive_key(passphrase: str, salt: bytes) -> bytes:
    """SHA256 x100000 — identik dengan walletcontroller.cpp dan mintburnpage.cpp"""
    data = passphrase.encode() + salt
    k = hashlib.sha256(data).digest()
    for _ in range(99999):
        k = hashlib.sha256(k).digest()
    return k

def seedphrase_to_encpass(seedphrase: str) -> str:
    """Turunkan passphrase enkripsi dari seedphrase — deterministik, sama dengan C++."""
    combined = (seedphrase.strip() + "|garuda_pqc_v1").encode()
    return hashlib.sha256(combined).hexdigest()

def try_decrypt(path: str, passphrase: str):
    with open(path) as f:
        obj = json.load(f)
    if not obj.get('encrypted'):
        with open(path) as f:
            return f.read()
    salt  = bytes.fromhex(obj['salt_hex'])
    nonce = bytes.fromhex(obj['nonce_hex'])
    ct    = bytes.fromhex(obj['ciphertext_hex'])
    key   = derive_key(passphrase, salt)
    try:
        return ChaCha20Poly1305(key).decrypt(nonce, ct, b"").decode()
    except Exception:
        return None

def encrypt_file(path: str, plaintext: str, passphrase: str):
    salt  = secrets.token_bytes(32)
    nonce = secrets.token_bytes(12)
    key   = derive_key(passphrase, salt)
    ct    = ChaCha20Poly1305(key).encrypt(nonce, plaintext.encode(), b"")
    with open(path, 'w') as f:
        json.dump({"encrypted": True, "algo": "ChaCha20-Poly1305",
                   "kdf": "SHA256x100000", "salt_hex": salt.hex(),
                   "nonce_hex": nonce.hex(), "ciphertext_hex": ct.hex()}, f, indent=2)
        f.write('\n')

FILES = [
    os.path.expanduser("~/.garudachain-cbdc/regtest/cbdc-authority/layer_1_keypair.json"),
    os.path.expanduser("~/.garudachain-cbdc/regtest/cbdc-authority/layer_2_keypair.json"),
    os.path.expanduser("~/.garudachain-cbdc/regtest/cbdc-authority/layer_3_keypair.json"),
    os.path.expanduser("~/.garudachain-cbdc/regtest/cbdc-authority/layer_4_keypair.json"),
    os.path.expanduser("~/.garudachain-cbdc/regtest/cbdc-authority/layer_5_keypair.json"),
    os.path.expanduser("~/.garudachain-creator/regtest/creator-wallet/quantum_keypair.json"),
    os.path.expanduser("~/.garudachain-public/regtest/public-wallet/quantum_keypair.json"),
]

print("=" * 60)
print("  Re-Enkripsi File Kunci Kuantum dengan Seedphrase")
print("=" * 60)
print()
print("Masukkan seedphrase wallet Anda (24 kata dipisah spasi).")
print("CATATAN: Script ini tidak menyimpan atau mengirim seedphrase ke mana pun.\n")

try:
    seedphrase = getpass.getpass("Seedphrase: ").strip()
except Exception:
    seedphrase = input("Seedphrase: ").strip()

words = seedphrase.split()
if len(words) < 12:
    print("ERROR: Seedphrase minimal 12 kata.")
    sys.exit(1)

new_pass = seedphrase_to_encpass(seedphrase)
print(f"\nPassphrase enkripsi diturunkan dari seedphrase [OK]")
print(f"(Hash awal: {new_pass[:16]}...)\n")

ok_count = 0
for path in FILES:
    name = os.path.basename(path)
    # Coba decrypt dengan passphrase lama
    plaintext = try_decrypt(path, CURRENT_PASS)
    if plaintext is None:
        # Mungkin sudah pakai passphrase baru atau plaintext
        plaintext = try_decrypt(path, new_pass)
    if plaintext is None:
        print(f"  [SKIP] {name} — tidak bisa decrypt (sudah pakai passphrase lain?)")
        continue
    # Re-encrypt dengan passphrase dari seedphrase
    encrypt_file(path, plaintext, new_pass)
    print(f"  [OK]   {name}")
    ok_count += 1

print(f"\nSelesai: {ok_count}/{len(FILES)} file di-re-enkripsi.")
print()
print("Mulai sekarang file hanya bisa dibuka dengan seedphrase wallet Anda.")
print("Di dialog 'Load File' pada MINT, masukkan seedphrase Anda sebagai passphrase.")
