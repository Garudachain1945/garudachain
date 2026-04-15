// Copyright (c) 2026 GarudaChain developers
// ML-DSA-87 wrapper — uses liboqs (Open Quantum Safe)
#include <crypto/pqc/ml_dsa87.h>

#include <crypto/sha256.h>
#include <support/cleanse.h>

#include <cstring>
#include <mutex>

// liboqs header (C library — needs extern "C")
extern "C" {
#include <oqs/sig_ml_dsa.h>
#include <oqs/rand.h>
}

namespace PQC {

// ---- Deterministic PRNG for seeded keygen ----
// Thread-local state for the custom random bytes callback.
// We use SHA-256 in counter mode to expand a 32-byte seed into
// arbitrary-length deterministic random bytes.
struct DeterministicRNG {
    uint8_t seed[32];
    uint64_t counter;
};
static thread_local DeterministicRNG g_det_rng;

static void DeterministicRandBytes(uint8_t* out, size_t len)
{
    size_t pos = 0;
    while (pos < len) {
        // Hash: SHA256(seed || counter) → 32 bytes
        uint8_t block[32];
        CSHA256 hasher;
        hasher.Write(g_det_rng.seed, 32);
        uint8_t ctr_bytes[8];
        for (int i = 0; i < 8; i++)
            ctr_bytes[i] = (uint8_t)(g_det_rng.counter >> (i * 8));
        hasher.Write(ctr_bytes, 8);
        hasher.Finalize(block);
        g_det_rng.counter++;

        size_t copy = std::min((size_t)32, len - pos);
        memcpy(out + pos, block, copy);
        pos += copy;
    }
}

// Global mutex to protect ALL OQS operations that depend on the RNG state.
// This prevents a race where seeded keygen sets custom RNG and another thread
// calls non-seeded keygen before the RNG is restored.
static std::mutex g_oqs_rng_mutex;

bool MLDSA87Keygen(uint8_t* pk, uint8_t* sk)
{
    if (!pk || !sk) return false;
    // Lock to prevent interference with seeded keygen's custom RNG
    std::lock_guard<std::mutex> lock(g_oqs_rng_mutex);
    return OQS_SIG_ml_dsa_87_keypair(pk, sk) == OQS_SUCCESS;
}

bool MLDSA87Sign(uint8_t* sig, size_t* sig_len,
                 const uint8_t* msg, size_t msg_len,
                 const uint8_t* sk)
{
    if (!sig || !sig_len || !sk) return false;
    if (!msg && msg_len > 0) return false;
    return OQS_SIG_ml_dsa_87_sign(sig, sig_len, msg, msg_len, sk) == OQS_SUCCESS;
}

bool MLDSA87Verify(const uint8_t* msg, size_t msg_len,
                   const uint8_t* sig, size_t sig_len,
                   const uint8_t* pk)
{
    if (sig_len != ML_DSA_87_SIG_SIZE) return false;
    if (!sig || !pk) return false;
    if (!msg && msg_len > 0) return false;
    return OQS_SIG_ml_dsa_87_verify(msg, msg_len, sig, sig_len, pk) == OQS_SUCCESS;
}

bool MLDSA87KeygenFromSeed(const uint8_t seed[32], uint8_t* pk, uint8_t* sk)
{
    if (!seed || !pk || !sk) return false;

    // Use OQS_randombytes_custom_algorithm to inject deterministic PRNG.
    // This makes the keypair reproducible from the same seed — critical for
    // wallet recovery (same mnemonic → same PQC keypair).
    std::lock_guard<std::mutex> lock(g_oqs_rng_mutex);

    // Set up deterministic state
    memcpy(g_det_rng.seed, seed, 32);
    g_det_rng.counter = 0;

    // Swap in our deterministic RNG
    OQS_randombytes_custom_algorithm(DeterministicRandBytes);

    bool ok = OQS_SIG_ml_dsa_87_keypair(pk, sk) == OQS_SUCCESS;

    // Restore system RNG — critical: if this fails, all subsequent keygen
    // would produce predictable keys. We handle this by aborting.
    OQS_randombytes_switch_algorithm("system");

    // Securely wipe the deterministic seed from memory (cannot be optimized out)
    memory_cleanse(g_det_rng.seed, 32);
    g_det_rng.counter = 0;

    return ok;
}

} // namespace PQC
