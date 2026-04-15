// Copyright (c) 2026 GarudaChain developers
#include <cbdc/authority.h>
#include <crypto/pqc/ml_dsa87.h>
#include <crypto/sha256.h>
#include <primitives/transaction.h>
#include <script/script.h>
#include <support/cleanse.h>
#include <util/strencodings.h>
#include <common/args.h>
#include <logging.h>
#include <secp256k1.h>
#include <secp256k1_schnorrsig.h>

#include <algorithm>
#include <span>
#include <stdexcept>

namespace CBDC {

// ---- Runtime state (protected by mutex) ----
static std::mutex g_authority_mutex;
static std::string g_authority_pubkey_hex;
static std::string g_authority_pqc_pubkey_hash_hex;
static std::string g_apbn_pubkeyhash_hex;
static int64_t g_mint_fee_ppm = 1000; // 0.1% default
static WalletMode g_wallet_mode = WalletMode::NORMAL;
static TreasuryConfig g_treasury_config = {2, 3, 144}; // 2-of-3, 144 block timelock

// ---- Getters (thread-safe) ----
std::string GetAuthorityPubkeyHex() {
    std::lock_guard<std::mutex> lock(g_authority_mutex);
    return g_authority_pubkey_hex;
}
std::string GetAuthorityPQCPubkeyHashHex() {
    std::lock_guard<std::mutex> lock(g_authority_mutex);
    return g_authority_pqc_pubkey_hash_hex;
}
std::string GetAPBNPubkeyHashHex() {
    std::lock_guard<std::mutex> lock(g_authority_mutex);
    return g_apbn_pubkeyhash_hex;
}
int64_t GetMintFeePPM() {
    return g_mint_fee_ppm;
}

// ---- Setters (thread-safe) ----
void SetAuthorityPubkeyHex(const std::string& hex) {
    std::lock_guard<std::mutex> lock(g_authority_mutex);
    g_authority_pubkey_hex = hex;
    LogPrintf("CBDC: Authority pubkey updated to %s\n", hex);
}
void SetAuthorityPQCPubkeyHashHex(const std::string& hex) {
    std::lock_guard<std::mutex> lock(g_authority_mutex);
    g_authority_pqc_pubkey_hash_hex = hex;
    LogPrintf("CBDC: Authority PQC pubkey hash updated to %s\n",
              hex.empty() ? "(disabled)" : hex);
}
void SetAPBNPubkeyHashHex(const std::string& hex) {
    std::lock_guard<std::mutex> lock(g_authority_mutex);
    g_apbn_pubkeyhash_hex = hex;
    LogPrintf("CBDC: APBN pubkey hash updated to %s\n", hex);
}
void SetMintFeePPM(int64_t ppm) {
    if (ppm < 0) ppm = 0;
    if (ppm > 100000) ppm = 100000; // max 10%
    g_mint_fee_ppm = ppm;
    LogPrintf("CBDC: Mint fee set to %ld PPM (%.4f%%)\n", ppm, (double)ppm / 10000.0);
}

// ---- Init from bitcoin.conf ----
void InitAuthorityKeys() {
    std::lock_guard<std::mutex> lock(g_authority_mutex);

    // -cbdcauthoritypubkey=<hex>
    g_authority_pubkey_hex = gArgs.GetArg("-cbdcauthoritypubkey",
                                          DEFAULT_AUTHORITY_PUBKEY_HEX);
    // -cbdcpqcpubkeyhash=<hex>
    g_authority_pqc_pubkey_hash_hex = gArgs.GetArg("-cbdcpqcpubkeyhash",
                                                    DEFAULT_AUTHORITY_PQC_PUBKEY_HASH_HEX);
    // -cbdcapbnhash=<hex>
    g_apbn_pubkeyhash_hex = gArgs.GetArg("-cbdcapbnhash",
                                          DEFAULT_APBN_PUBKEYHASH_HEX);
    // -cbdcmintfeeppm=<int>
    g_mint_fee_ppm = gArgs.GetIntArg("-cbdcmintfeeppm", 1000);
    if (g_mint_fee_ppm < 0) g_mint_fee_ppm = 0;
    if (g_mint_fee_ppm > 100000) g_mint_fee_ppm = 100000;

    LogPrintf("CBDC Authority Init:\n");
    LogPrintf("  Schnorr pubkey:    %s\n", g_authority_pubkey_hex);
    LogPrintf("  PQC pubkey hash:   %s\n",
              g_authority_pqc_pubkey_hash_hex.empty() ? "(disabled)" : g_authority_pqc_pubkey_hash_hex);
    LogPrintf("  APBN hash:         %s\n", g_apbn_pubkeyhash_hex);
    LogPrintf("  Mint fee:          %ld PPM (%.4f%%)\n", g_mint_fee_ppm, (double)g_mint_fee_ppm / 10000.0);
    LogPrintf("  Chain ID:          %s\n", CHAIN_ID);
}

// ---- Treasury config from bitcoin.conf ----
void InitTreasuryConfig() {
    // -cbdctreasurymultisig=2-of-3
    std::string ms = gArgs.GetArg("-cbdctreasurymultisig", "2-of-3");
    int m = 2, n = 3;
    auto pos = ms.find("-of-");
    if (pos != std::string::npos) {
        try {
            m = std::stoi(ms.substr(0, pos));
            n = std::stoi(ms.substr(pos + 4));
        } catch (...) { m = 2; n = 3; }
    }
    if (m < 1) m = 1;
    if (n < m) n = m;
    if (n > 15) n = 15;

    // -cbdctreasurytimelock=144
    int timelock = (int)gArgs.GetIntArg("-cbdctreasurytimelock", 144);
    if (timelock < 0) timelock = 0;
    if (timelock > 52560) timelock = 52560; // max ~1 year

    g_treasury_config = {m, n, timelock};

    LogPrintf("CBDC Treasury: %d-of-%d multisig, timelock=%d blocks\n", m, n, timelock);
}

TreasuryConfig GetTreasuryConfig() {
    return g_treasury_config;
}

// ---- APBN Script (P2WSH with timelock + multisig) ----
CScript GetAPBNScript() {
    std::string hash_hex = GetAPBNPubkeyHashHex();
    auto hash_bytes = ParseHex(hash_hex);

    if (hash_bytes.size() == 32) {
        // P2WSH (32-byte witness script hash — for multi-sig)
        return CScript() << OP_0 << hash_bytes;
    }
    // P2WPKH fallback (20-byte key hash)
    if (hash_bytes.size() == 20) {
        return CScript() << OP_0 << hash_bytes;
    }
    // Invalid or unconfigured — return empty 20-byte P2WPKH so downstream
    // validation rejects. Do NOT fall back to a hardcoded developer hash.
    LogPrintf("CBDC WARNING: APBN hash invalid/unset (size=%d). Set -cbdcapbnhash.\n",
              hash_bytes.size());
    return CScript() << OP_0 << std::vector<unsigned char>(20, 0);
}

// ---- Replay-protected sighash ----
uint256 GetReplayProtectedHash(const CTransaction& tx) {
    // SHA256(CHAIN_ID || tx.GetHash()) — binds tx to this chain
    uint256 result;
    CSHA256 hasher;
    hasher.Write((const unsigned char*)CHAIN_ID.data(), CHAIN_ID.size());
    uint256 txhash = tx.GetHash();
    hasher.Write(txhash.data(), 32);
    hasher.Finalize(result.begin());
    return result;
}

// ---- Wallet mode ----
WalletMode GetWalletMode() { return g_wallet_mode; }

void SetWalletMode(const std::string& mode) {
    if (mode == "cbdc")    { g_wallet_mode = WalletMode::CBDC;    return; }
    if (mode == "creator") { g_wallet_mode = WalletMode::CREATOR; return; }
    if (mode == "public")  { g_wallet_mode = WalletMode::PUBLIC;  return; }
    g_wallet_mode = WalletMode::NORMAL;
}

// ---- Tx identification ----
bool IsCBDCMintTx(const CTransaction& tx) {
    if (tx.version != CBDC_MINT_VERSION) return false;
    if (tx.vin.empty()) return false;
    return tx.vin[0].prevout.hash == CBDC_MINT_MARKER;
}

// ---- Schnorr-only verification ----
bool VerifyCBDCMintSig(const CTransaction& tx, std::string& errMsg) {
    if (!IsCBDCMintTx(tx)) {
        errMsg = "bukan transaksi CBDC_MINT";
        return false;
    }
    if (tx.vin[0].scriptWitness.stack.empty()) {
        errMsg = "cbdc-mint-no-witness";
        return false;
    }
    if (tx.vout.empty()) {
        errMsg = "cbdc-mint-no-output";
        return false;
    }

    const auto& sig_bytes = tx.vin[0].scriptWitness.stack[0];
    if (sig_bytes.size() != 64) {
        errMsg = "cbdc-mint-bad-sig: harus 64 byte Schnorr";
        return false;
    }

    // Use configurable authority pubkey (NOT hardcoded)
    std::string pubkey_hex = GetAuthorityPubkeyHex();
    auto pubkey_bytes = ParseHex(pubkey_hex);
    if (pubkey_bytes.size() != 32) {
        errMsg = "cbdc-mint-bad-sig: authority pubkey tidak valid (cek -cbdcauthoritypubkey)";
        return false;
    }

    // Replay-protected hash: SHA256(CHAIN_ID || txhash)
    uint256 sighash = GetReplayProtectedHash(tx);

    secp256k1_context* ctx = secp256k1_context_create(SECP256K1_CONTEXT_VERIFY);
    secp256k1_xonly_pubkey xonly_pubkey;
    bool ok = false;
    if (secp256k1_xonly_pubkey_parse(ctx, &xonly_pubkey, pubkey_bytes.data())) {
        ok = secp256k1_schnorrsig_verify(ctx,
            sig_bytes.data(),
            sighash.data(), 32,
            &xonly_pubkey) == 1;
    }
    secp256k1_context_destroy(ctx);

    if (!ok) {
        errMsg = "cbdc-mint-bad-sig: verifikasi Schnorr gagal";
        return false;
    }
    return true;
}

// ---- Hybrid verification: Schnorr + ML-DSA-87 ----
bool VerifyCBDCMintSigHybrid(const CTransaction& tx, std::string& errMsg) {
    // Step 1: Always verify classical Schnorr signature
    if (!VerifyCBDCMintSig(tx, errMsg)) {
        return false;
    }

    // Step 2: If PQC authority key is configured, also verify ML-DSA-87
    std::string pqc_hash_hex = GetAuthorityPQCPubkeyHashHex();
    if (pqc_hash_hex.empty()) {
        return true; // PQC not yet activated — Schnorr-only is valid
    }

    // Witness stack layout for hybrid:
    // stack[0] = Schnorr sig (64 bytes)
    // stack[1] = ML-DSA-87 sig (4627 bytes)
    // stack[2] = ML-DSA-87 pubkey (2592 bytes)
    const auto& witness = tx.vin[0].scriptWitness;
    if (witness.stack.size() < 3) {
        errMsg = "cbdc-mint-hybrid: witness harus 3 elemen (schnorr_sig, pqc_sig, pqc_pubkey)";
        return false;
    }

    const auto& pqc_sig = witness.stack[1];
    const auto& pqc_pubkey = witness.stack[2];

    if (pqc_pubkey.size() != PQC::ML_DSA_87_PUBKEY_SIZE) {
        errMsg = strprintf("cbdc-mint-hybrid: PQC pubkey harus %d bytes, dapat %d",
                          PQC::ML_DSA_87_PUBKEY_SIZE, pqc_pubkey.size());
        return false;
    }

    if (pqc_sig.size() != PQC::ML_DSA_87_SIG_SIZE) {
        errMsg = strprintf("cbdc-mint-hybrid: PQC sig harus %d bytes, dapat %d",
                          PQC::ML_DSA_87_SIG_SIZE, pqc_sig.size());
        return false;
    }

    // Verify SHA256(pqc_pubkey) matches the configured authority PQC hash
    auto expected_hash = ParseHex(pqc_hash_hex);
    if (expected_hash.size() != 32) {
        errMsg = "cbdc-mint-hybrid: PQC pubkey hash config invalid (harus 64 hex chars)";
        return false;
    }

    uint256 actual_hash;
    CSHA256().Write(pqc_pubkey.data(), pqc_pubkey.size()).Finalize(actual_hash.begin());
    if (memcmp(actual_hash.begin(), expected_hash.data(), 32) != 0) {
        errMsg = "cbdc-mint-hybrid: PQC pubkey hash tidak cocok dengan authority";
        return false;
    }

    // Verify ML-DSA-87 signature over replay-protected hash
    uint256 sighash = GetReplayProtectedHash(tx);
    if (!PQC::MLDSA87Verify(sighash.data(), 32, pqc_sig.data(), pqc_sig.size(), pqc_pubkey.data())) {
        errMsg = "cbdc-mint-hybrid: verifikasi ML-DSA-87 gagal";
        return false;
    }

    LogPrintf("CBDC: Hybrid verification OK (Schnorr + ML-DSA-87) for tx %s\n",
              tx.GetHash().ToString());
    return true;
}

// ---- Unified PQC authorization helper for privileged RPCs ----
bool IsPQCActive()
{
    return !GetAuthorityPQCPubkeyHashHex().empty();
}

// Throws std::runtime_error with a short reason on any validation failure.
// Callers in RPC code should catch and convert to JSONRPCError.
void RequirePQCAuth(const std::string& pqc_key_hex,
                    const std::string& op_name,
                    const std::string& params_blob)
{
    const std::string pqc_hash_hex = GetAuthorityPQCPubkeyHashHex();
    if (pqc_hash_hex.empty()) {
        // Soft mode: PQC not activated. Allow but log.
        LogPrintf("CBDC_PQC_AUTH[%s]: PQC disabled, skipping (set -cbdcpqcpubkeyhash to enforce)\n",
                  op_name);
        return;
    }

    if (pqc_key_hex.empty())
        throw std::runtime_error("PQC aktif. RPC ini butuh pqcseckeyhex (pk||sk, " +
                                 std::to_string(PQC::ML_DSA_87_PUBKEY_SIZE + PQC::ML_DSA_87_SECKEY_SIZE) +
                                 " bytes hex).");

    auto combined = ParseHex(pqc_key_hex);
    const size_t kCombined = PQC::ML_DSA_87_PUBKEY_SIZE + PQC::ML_DSA_87_SECKEY_SIZE;
    if (combined.size() != kCombined)
        throw std::runtime_error("pqcseckeyhex ukuran salah: butuh " +
                                 std::to_string(kCombined) + " bytes (pk||sk)");

    std::vector<unsigned char> pk(combined.begin(),
                                  combined.begin() + PQC::ML_DSA_87_PUBKEY_SIZE);
    std::vector<unsigned char> sk(combined.begin() + PQC::ML_DSA_87_PUBKEY_SIZE,
                                  combined.end());

    // Verify pubkey hash matches configured authority
    unsigned char pk_hash[32];
    CSHA256().Write(pk.data(), pk.size()).Finalize(pk_hash);
    auto expected = ParseHex(pqc_hash_hex);
    if (expected.size() != 32 || memcmp(pk_hash, expected.data(), 32) != 0) {
        memory_cleanse(sk.data(), sk.size());
        throw std::runtime_error("PQC pubkey hash tidak cocok -cbdcpqcpubkeyhash");
    }

    // Sign canonical op message: SHA256(CHAIN_ID || op_name || params_blob)
    CSHA256 hasher;
    hasher.Write(reinterpret_cast<const unsigned char*>(CHAIN_ID.data()), CHAIN_ID.size());
    unsigned char sep = '|';
    hasher.Write(&sep, 1);
    hasher.Write(reinterpret_cast<const unsigned char*>(op_name.data()), op_name.size());
    hasher.Write(&sep, 1);
    hasher.Write(reinterpret_cast<const unsigned char*>(params_blob.data()), params_blob.size());
    unsigned char msg_hash[32];
    hasher.Finalize(msg_hash);

    std::vector<unsigned char> sig(PQC::ML_DSA_87_SIG_SIZE);
    size_t sig_len = 0;
    bool ok = PQC::MLDSA87Sign(sig.data(), &sig_len, msg_hash, 32, sk.data());
    memory_cleanse(sk.data(), sk.size());
    if (!ok)
        throw std::runtime_error("ML-DSA-87 signing gagal di RequirePQCAuth");

    // Verify what we just produced (defense in depth)
    if (!PQC::MLDSA87Verify(msg_hash, 32, sig.data(), sig_len, pk.data()))
        throw std::runtime_error("ML-DSA-87 self-verify gagal");

    // Audit log: short prefix only
    std::string sig_prefix = HexStr(std::span{sig.data(), std::min<size_t>(16, sig_len)});
    LogPrintf("CBDC_PQC_AUTH[%s]: OK sig_len=%llu sig[0:16]=%s\n",
              op_name, (unsigned long long)sig_len, sig_prefix);
}

} // namespace CBDC
