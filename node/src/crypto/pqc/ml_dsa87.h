// Copyright (c) 2026 GarudaChain developers
// ML-DSA-87 (FIPS 204) Post-Quantum Digital Signature — wrapper around liboqs
#pragma once

#include <cstddef>
#include <cstdint>
#include <string>
#include <vector>

namespace PQC {

// ML-DSA-87 sizes (FIPS 204 Level 5)
static constexpr size_t ML_DSA_87_PUBKEY_SIZE  = 2592;
static constexpr size_t ML_DSA_87_SECKEY_SIZE  = 4896;
static constexpr size_t ML_DSA_87_SIG_SIZE     = 4627;

/** Generate ML-DSA-87 keypair.
 *  @param[out] pk  Buffer of size ML_DSA_87_PUBKEY_SIZE
 *  @param[out] sk  Buffer of size ML_DSA_87_SECKEY_SIZE
 *  @return true on success
 */
bool MLDSA87Keygen(uint8_t* pk, uint8_t* sk);

/** Sign a message with ML-DSA-87.
 *  @param[out]    sig      Signature output (ML_DSA_87_SIG_SIZE bytes)
 *  @param[out]    sig_len  Actual signature length
 *  @param[in]     msg      Message to sign
 *  @param[in]     msg_len  Message length
 *  @param[in]     sk       Secret key (ML_DSA_87_SECKEY_SIZE bytes)
 *  @return true on success
 */
bool MLDSA87Sign(uint8_t* sig, size_t* sig_len,
                 const uint8_t* msg, size_t msg_len,
                 const uint8_t* sk);

/** Verify an ML-DSA-87 signature.
 *  @param[in] msg      Message that was signed
 *  @param[in] msg_len  Message length
 *  @param[in] sig      Signature (ML_DSA_87_SIG_SIZE bytes)
 *  @param[in] sig_len  Signature length
 *  @param[in] pk       Public key (ML_DSA_87_PUBKEY_SIZE bytes)
 *  @return true if valid
 */
bool MLDSA87Verify(const uint8_t* msg, size_t msg_len,
                   const uint8_t* sig, size_t sig_len,
                   const uint8_t* pk);

/** Deterministic keygen from 32-byte seed (SHA-256 of seedphrase).
 *  Uses seed as OQS random source to generate a reproducible keypair.
 *  @param[in]  seed  32-byte seed
 *  @param[out] pk    Public key
 *  @param[out] sk    Secret key
 *  @return true on success
 */
bool MLDSA87KeygenFromSeed(const uint8_t seed[32], uint8_t* pk, uint8_t* sk);

} // namespace PQC
