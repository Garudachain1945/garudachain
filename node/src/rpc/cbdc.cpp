// Copyright (c) 2026 GarudaChain developers
// RPC endpoints: mintgaruda, burngaruda, getcbdcinfo, rotateauthoritykey, generatepqckeypair
#include <config/bitcoin-config.h> // IWYU pragma: keep

#include <cbdc/authority.h>
#include <chainparams.h>
#include <consensus/amount.h>
#include <consensus/merkle.h>
#include <core_io.h>
#include <crypto/pqc/ml_dsa87.h>
#include <crypto/sha256.h>
#include <key.h>
#include <key_io.h>
#include <node/context.h>
#include <interfaces/mining.h>
#include <node/miner.h>
#include <node/transaction.h>
#include <node/types.h>
#include <pow.h>
#include <primitives/transaction.h>
#include <rpc/cbdc.h>
#include <rpc/server.h>
#include <rpc/server_util.h>
#include <rpc/util.h>
#include <script/script.h>
#include <univalue.h>
#include <random.h>
#include <support/cleanse.h>
#include <util/strencodings.h>
#include <util/transaction_identifier.h>
#include <array>
#include <util/time.h>
#include <validation.h>

#include <secp256k1.h>
#include <secp256k1_schnorrsig.h>

using node::NodeContext;
using node::BroadcastTransaction;
using node::TransactionError;

// ---------------------------------------------------------------------------
// mintgaruda <amount_in_grd> <address> <authority_privkey_hex> [pqc_secret_key_hex]
// ---------------------------------------------------------------------------
static RPCHelpMan mintgaruda()
{
    return RPCHelpMan{
        "mintgaruda",
        "Mint CBDC tokens with hybrid Schnorr + ML-DSA-87 signature.\n"
        "Includes replay protection (chain ID) and automatic fee burn.\n"
        "Requires -walletmode=cbdc.\n",
        {
            {"amount",         RPCArg::Type::AMOUNT, RPCArg::Optional::NO,  "Jumlah yang dicetak dalam GRD"},
            {"address",        RPCArg::Type::STR,    RPCArg::Optional::NO,  "Alamat tujuan"},
            {"authprivkeyhex", RPCArg::Type::STR,    RPCArg::Optional::NO,  "32-byte authority Schnorr private key (hex)"},
            {"pqcseckeyhex",   RPCArg::Type::STR,    RPCArg::Optional::OMITTED, "ML-DSA-87 authority key (pk||sk combined, 7488 bytes hex). Required if PQC is active."},
        },
        RPCResult{RPCResult::Type::OBJ, "", "", {
            {RPCResult::Type::STR_HEX, "txid", "TXID"},
            {RPCResult::Type::STR_HEX, "blockhash", "Block hash"},
            {RPCResult::Type::STR_AMOUNT, "fee_burned", "Fee burned (GRD)"},
        }},
        RPCExamples{
            HelpExampleCli("mintgaruda", "1000 grd1q... <64-hex-privkey>") +
            HelpExampleCli("mintgaruda", "1000 grd1q... <64-hex-privkey> <pqc-seckey-hex>")
        },
        [&](const RPCHelpMan& self, const JSONRPCRequest& request) -> UniValue
        {
            if (CBDC::GetWalletMode() != CBDC::WalletMode::CBDC) {
                throw JSONRPCError(RPC_MISC_ERROR,
                    "Node tidak dalam mode cbdc. Tambah -walletmode=cbdc di bitcoin.conf");
            }

            NodeContext& node = EnsureAnyNodeContext(request.context);

            CAmount nAmount = AmountFromValue(request.params[0]);
            if (nAmount <= 0)
                throw JSONRPCError(RPC_INVALID_PARAMETER, "Amount harus positif");

            const std::string strAddr = request.params[1].get_str();
            CTxDestination dest = DecodeDestination(strAddr);
            if (!IsValidDestination(dest))
                throw JSONRPCError(RPC_INVALID_ADDRESS_OR_KEY, "Alamat tidak valid: " + strAddr);
            CScript scriptPubKey = GetScriptForDestination(dest);

            const std::string privKeyHex = request.params[2].get_str();
            std::vector<unsigned char> privKeyBytes = ParseHex(privKeyHex);
            if (privKeyBytes.size() != 32)
                throw JSONRPCError(RPC_INVALID_PARAMETER, "authprivkeyhex harus 32 byte (64 hex)");

            // ---- Build transaction ----
            CMutableTransaction mtx;
            mtx.version = CBDC::CBDC_MINT_VERSION;

            {
                auto now = std::chrono::steady_clock::now().time_since_epoch();
                auto micros = std::chrono::duration_cast<std::chrono::microseconds>(now).count();
                mtx.nLockTime = static_cast<uint32_t>(micros & 0xFFFFFFFF);
            }

            // ---- Per-mint unique synthetic input ----
            //
            // Wallets track transaction conflicts by the full COutPoint
            // (hash + n). Before this change, every mint used n=0, so two
            // mints submitted in quick succession appeared to the wallet as
            // conflicting double-spends of the same synthetic UTXO — only
            // the latest mint was reflected in `getbalance` even though all
            // mints were confirmed on-chain (scantxoutset saw them fine).
            //
            // Fix: give each mint a fresh 32-bit random n. The consensus
            // rule in IsCBDCMintTx / VerifyCBDCMintSig only inspects
            // prevout.hash, so no hard fork is required — old nodes still
            // validate these txs correctly. The n field is part of the
            // sighash, so tx identity and replay protection remain intact.
            unsigned char nonce_bytes[4];
            GetStrongRandBytes(Span{nonce_bytes, 4});
            uint32_t mint_nonce = (uint32_t(nonce_bytes[0]) << 24) |
                                  (uint32_t(nonce_bytes[1]) << 16) |
                                  (uint32_t(nonce_bytes[2]) << 8)  |
                                  (uint32_t(nonce_bytes[3]));

            CTxIn vin;
            vin.prevout = COutPoint(Txid::FromUint256(CBDC::CBDC_MINT_MARKER), mint_nonce);
            vin.nSequence = CTxIn::SEQUENCE_FINAL;
            mtx.vin.push_back(vin);

            // Main output: recipient
            mtx.vout.push_back(CTxOut(nAmount, scriptPubKey));

            // ---- Fee burn output ----
            int64_t fee_ppm = CBDC::GetMintFeePPM();
            CAmount fee_amount = 0;
            if (fee_ppm > 0) {
                __int128 fee128 = (__int128)nAmount * (__int128)fee_ppm / 1000000LL;
                fee_amount = (CAmount)fee128;
                if (fee_amount < 1) fee_amount = 1;

                CScript feeScript;
                feeScript << OP_RETURN << std::vector<unsigned char>{'M', 'F', 'E', 'E'};
                mtx.vout.push_back(CTxOut(fee_amount, feeScript));
            }

            // ---- Sign: Schnorr with replay-protected hash ----
            CTransaction txForHash(mtx);
            uint256 sighash = CBDC::GetReplayProtectedHash(txForHash);

            secp256k1_context* ctx = secp256k1_context_create(SECP256K1_CONTEXT_SIGN);
            // Randomize context to protect against side-channel attacks
            unsigned char rand_bytes[32];
            GetStrongRandBytes(Span{rand_bytes, 32});
            if (!secp256k1_context_randomize(ctx, rand_bytes)) {
                secp256k1_context_destroy(ctx);
                throw JSONRPCError(RPC_INTERNAL_ERROR, "Gagal randomize secp256k1 context");
            }
            secp256k1_keypair keypair;
            if (!secp256k1_keypair_create(ctx, &keypair, privKeyBytes.data())) {
                secp256k1_context_destroy(ctx);
                throw JSONRPCError(RPC_INVALID_PARAMETER, "Private key tidak valid");
            }

            // Verify pubkey matches configured authority
            secp256k1_xonly_pubkey xonly_pub;
            (void)secp256k1_keypair_xonly_pub(ctx, &xonly_pub, nullptr, &keypair);
            unsigned char pub_bytes[32];
            secp256k1_xonly_pubkey_serialize(ctx, pub_bytes, &xonly_pub);
            std::string expected_hex = CBDC::GetAuthorityPubkeyHex();
            std::vector<unsigned char> expected_pub = ParseHex(expected_hex);
            if (std::vector<unsigned char>(pub_bytes, pub_bytes + 32) != expected_pub) {
                secp256k1_context_destroy(ctx);
                throw JSONRPCError(RPC_INVALID_PARAMETER,
                    "Private key tidak sesuai AUTHORITY_PUBKEY. Cek -cbdcauthoritypubkey.");
            }

            unsigned char aux[32];
            GetStrongRandBytes(Span{aux, 32});
            std::vector<unsigned char> sig(64);
            bool ok = secp256k1_schnorrsig_sign32(ctx, sig.data(), sighash.data(), &keypair, aux) == 1;
            memory_cleanse(aux, 32);
            memory_cleanse(privKeyBytes.data(), privKeyBytes.size());
            memory_cleanse(&keypair, sizeof(keypair));
            secp256k1_context_destroy(ctx);

            if (!ok)
                throw JSONRPCError(RPC_INTERNAL_ERROR, "Schnorr signing gagal");

            // ---- Witness: Schnorr sig ----
            mtx.vin[0].scriptWitness.stack.clear();
            mtx.vin[0].scriptWitness.stack.push_back(sig);

            // ---- Optional PQC signature ----
            std::string pqc_hash_hex = CBDC::GetAuthorityPQCPubkeyHashHex();
            if (!pqc_hash_hex.empty()) {
                // PQC is active — must provide secret key
                if (request.params[3].isNull())
                    throw JSONRPCError(RPC_INVALID_PARAMETER,
                        "PQC aktif. Berikan pqcseckeyhex (ML-DSA-87 secret key, 4896 bytes hex).");

                std::string pqc_sk_hex = request.params[3].get_str();
                auto pqc_sk = ParseHex(pqc_sk_hex);
                const size_t kCombined = PQC::ML_DSA_87_PUBKEY_SIZE + PQC::ML_DSA_87_SECKEY_SIZE;
                if (pqc_sk.size() != kCombined)
                    throw JSONRPCError(RPC_INVALID_PARAMETER,
                        strprintf("pqcseckeyhex harus %d bytes (pk||sk combined format)", kCombined));

                // Extract pubkey from secret key (keygen with same seed would give same pair)
                // We need the pubkey for the witness — derive it
                // ML-DSA-87 sk contains the pubkey embedded in it
                // For now, generate sig and include pubkey separately
                // The user should also provide the pubkey, or we extract from the sk
                // In ML-DSA-87, the first 2592 bytes of the 4896-byte sk is NOT the pubkey.
                // We need to ask for it or derive it. Simplest: user provides pk too.
                // Alternative: generate keypair from seed and cache both.
                // For security, we'll re-derive via keygen from the first 32 bytes as seed.

                // Actually, in OQS the pubkey is NOT embedded in the sk in a simple way.
                // Best approach: accept pk as part of pqcseckeyhex param, format: pk||sk
                // Or better: generate both at once with generatepqckeypair RPC.
                // For this RPC, we'll accept a combined hex: pubkey (2592) + seckey (4896) = 7488 bytes

                if (pqc_sk.size() == PQC::ML_DSA_87_SECKEY_SIZE + PQC::ML_DSA_87_PUBKEY_SIZE) {
                    // Combined format: pk || sk
                    auto pqc_pk_data = std::vector<unsigned char>(pqc_sk.begin(), pqc_sk.begin() + PQC::ML_DSA_87_PUBKEY_SIZE);
                    auto pqc_sk_data = std::vector<unsigned char>(pqc_sk.begin() + PQC::ML_DSA_87_PUBKEY_SIZE, pqc_sk.end());

                    // Verify pubkey hash matches
                    uint256 pk_hash;
                    CSHA256().Write(pqc_pk_data.data(), pqc_pk_data.size()).Finalize(pk_hash.begin());
                    auto expected_hash = ParseHex(pqc_hash_hex);
                    if (memcmp(pk_hash.begin(), expected_hash.data(), 32) != 0)
                        throw JSONRPCError(RPC_INVALID_PARAMETER,
                            "PQC pubkey hash tidak cocok dengan -cbdcpqcpubkeyhash.");

                    // Sign with ML-DSA-87
                    std::vector<unsigned char> pqc_sig(PQC::ML_DSA_87_SIG_SIZE);
                    size_t pqc_sig_len = 0;
                    if (!PQC::MLDSA87Sign(pqc_sig.data(), &pqc_sig_len,
                                          sighash.data(), 32, pqc_sk_data.data())) {
                        memory_cleanse(pqc_sk_data.data(), pqc_sk_data.size());
                        throw JSONRPCError(RPC_INTERNAL_ERROR, "ML-DSA-87 signing gagal");
                    }

                    // Wipe secret key from memory after use
                    memory_cleanse(pqc_sk_data.data(), pqc_sk_data.size());

                    // Add to witness: stack[1] = pqc_sig, stack[2] = pqc_pubkey
                    mtx.vin[0].scriptWitness.stack.push_back(pqc_sig);
                    mtx.vin[0].scriptWitness.stack.push_back(pqc_pk_data);
                } else {
                    throw JSONRPCError(RPC_INVALID_PARAMETER,
                        strprintf("pqcseckeyhex harus %d bytes (pk+sk combined) atau %d bytes (sk only saat PQC nonaktif)",
                                  PQC::ML_DSA_87_PUBKEY_SIZE + PQC::ML_DSA_87_SECKEY_SIZE,
                                  PQC::ML_DSA_87_SECKEY_SIZE));
                }
            }

            // ---- Mine into block ----
            CTransactionRef tx_ref = MakeTransactionRef(std::move(mtx));
            const uint256 txid = tx_ref->GetHash();

            interfaces::Mining& miner = EnsureMining(node);
            ChainstateManager& chainman = EnsureChainman(node);

            CScript coinbase_script = scriptPubKey;
            CBlock block;

            {
                LOCK(chainman.GetMutex());
                std::unique_ptr<node::CBlockTemplate> blocktemplate{
                    miner.createNewBlock(coinbase_script, {.use_mempool = false})};
                if (!blocktemplate)
                    throw JSONRPCError(RPC_INTERNAL_ERROR, "Gagal membuat block template");
                block = blocktemplate->block;
            }

            block.vtx.insert(block.vtx.begin() + 1, tx_ref);
            block.hashMerkleRoot = BlockMerkleRoot(block);

            while (!CheckProofOfWork(block.GetHash(), block.nBits, chainman.GetConsensus())) {
                ++block.nNonce;
            }

            auto blockptr = std::make_shared<const CBlock>(block);
            if (!miner.processNewBlock(blockptr, nullptr)) {
                throw JSONRPCError(RPC_INTERNAL_ERROR, "Block berisi CBDC_MINT ditolak");
            }

            UniValue result(UniValue::VOBJ);
            result.pushKV("txid", txid.GetHex());
            result.pushKV("blockhash", block.GetHash().GetHex());
            result.pushKV("fee_burned", ValueFromAmount(fee_amount));
            result.pushKV("fee_ppm", fee_ppm);
            result.pushKV("pqc_active", !pqc_hash_hex.empty());
            result.pushKV("replay_protection", CBDC::CHAIN_ID);
            return result;
        },
    };
}

// ---------------------------------------------------------------------------
// burngaruda <txid> <vout> <privkey_wif> <amount>
// ---------------------------------------------------------------------------
static RPCHelpMan burngaruda()
{
    return RPCHelpMan{
        "burngaruda",
        "Bakar token CBDC dengan membelanjakan UTXO ke OP_RETURN BURN.\n",
        {
            {"txid",    RPCArg::Type::STR_HEX, RPCArg::Optional::NO, "TXID dari UTXO"},
            {"vout",    RPCArg::Type::NUM,      RPCArg::Optional::NO, "Output index"},
            {"privkey", RPCArg::Type::STR,      RPCArg::Optional::NO, "Private key (WIF)"},
            {"amount",  RPCArg::Type::AMOUNT,   RPCArg::Optional::NO, "Jumlah (GRD)"},
            {"pqcseckeyhex", RPCArg::Type::STR, RPCArg::Optional::OMITTED, "ML-DSA-87 authority key (pk||sk, 7488 bytes hex). Wajib jika PQC aktif."},
        },
        RPCResult{RPCResult::Type::STR_HEX, "txid", "TXID transaksi burn"},
        RPCExamples{HelpExampleCli("burngaruda", "\"<txid>\" 0 \"<WIF>\" 1000.00")},
        [&](const RPCHelpMan& self, const JSONRPCRequest& request) -> UniValue
        {
            NodeContext& node = EnsureAnyNodeContext(request.context);

            uint256 prevTxId = ParseHashV(request.params[0], "txid");
            int prevOut = request.params[1].getInt<int>();
            const std::string wifKey = request.params[2].get_str();
            CAmount amount = AmountFromValue(request.params[3]);

            if (prevOut < 0) throw JSONRPCError(RPC_INVALID_PARAMETER, "vout harus >= 0");
            if (amount <= 0) throw JSONRPCError(RPC_INVALID_PARAMETER, "amount harus positif");

            std::string pqc_hex = (request.params.size() > 4 && !request.params[4].isNull())
                                  ? request.params[4].get_str() : "";
            try {
                CBDC::RequirePQCAuth(pqc_hex, "burngaruda",
                                     prevTxId.GetHex() + "|" + std::to_string(prevOut) + "|" +
                                     std::to_string(amount));
            } catch (const std::runtime_error& e) {
                throw JSONRPCError(RPC_INVALID_PARAMETER, e.what());
            }

            CKey key = DecodeSecret(wifKey);
            if (!key.IsValid())
                throw JSONRPCError(RPC_INVALID_ADDRESS_OR_KEY, "Private key tidak valid (WIF)");

            CMutableTransaction mtx;
            mtx.version = 2;

            CTxIn txin;
            txin.prevout = COutPoint(Txid::FromUint256(prevTxId), (uint32_t)prevOut);
            txin.nSequence = CTxIn::SEQUENCE_FINAL;
            mtx.vin.push_back(txin);

            CScript burnScript;
            burnScript << OP_RETURN << std::vector<unsigned char>{'B', 'U', 'R', 'N'};
            mtx.vout.push_back(CTxOut(0, burnScript));

            CPubKey pubkey = key.GetPubKey();
            CScript scriptPubKey = GetScriptForDestination(WitnessV0KeyHash(pubkey.GetID()));

            uint256 sighash = SignatureHash(scriptPubKey, mtx, 0, SIGHASH_ALL, amount,
                                            SigVersion::WITNESS_V0);
            std::vector<unsigned char> sig;
            if (!key.Sign(sighash, sig))
                throw JSONRPCError(RPC_INTERNAL_ERROR, "Signing gagal");
            sig.push_back(SIGHASH_ALL);

            mtx.vin[0].scriptWitness.stack.clear();
            mtx.vin[0].scriptWitness.stack.push_back(sig);
            mtx.vin[0].scriptWitness.stack.push_back(
                std::vector<unsigned char>(pubkey.begin(), pubkey.end()));

            CTransactionRef tx_ref = MakeTransactionRef(std::move(mtx));
            std::string err;
            TransactionError err_code = BroadcastTransaction(
                node, tx_ref, err, 0, true, false);
            if (err_code != TransactionError::OK)
                throw JSONRPCError(RPC_TRANSACTION_ERROR, err);

            return tx_ref->GetHash().GetHex();
        },
    };
}

// ---------------------------------------------------------------------------
// getcbdcinfo
// ---------------------------------------------------------------------------
static RPCHelpMan getcbdcinfo()
{
    return RPCHelpMan{
        "getcbdcinfo",
        "Informasi lengkap sistem CBDC GarudaChain.\n",
        {},
        RPCResult{RPCResult::Type::OBJ, "", "", {}},
        RPCExamples{HelpExampleCli("getcbdcinfo", "")},
        [&](const RPCHelpMan& self, const JSONRPCRequest& request) -> UniValue
        {
            UniValue result(UniValue::VOBJ);
            result.pushKV("authority_pubkey", CBDC::GetAuthorityPubkeyHex());
            result.pushKV("pqc_pubkey_hash", CBDC::GetAuthorityPQCPubkeyHashHex().empty()
                          ? "DISABLED" : CBDC::GetAuthorityPQCPubkeyHashHex());
            result.pushKV("pqc_active", !CBDC::GetAuthorityPQCPubkeyHashHex().empty());
            result.pushKV("chain_id", CBDC::CHAIN_ID);
            result.pushKV("mint_tx_version", (int)CBDC::CBDC_MINT_VERSION);
            result.pushKV("mint_marker", CBDC::CBDC_MINT_MARKER.GetHex());
            result.pushKV("apbn_hash", CBDC::GetAPBNPubkeyHashHex());
            result.pushKV("apbn_script", HexStr(CBDC::GetAPBNScript()));
            result.pushKV("mint_fee_ppm", CBDC::GetMintFeePPM());
            result.pushKV("mint_fee_pct", (double)CBDC::GetMintFeePPM() / 10000.0);
            result.pushKV("max_mint_per_tx_grd", (double)CBDC::MAX_MINT_PER_TX / 100000000.0);
            result.pushKV("max_mint_per_block_grd", (double)CBDC::MAX_MINT_PER_BLOCK / 100000000.0);
            result.pushKV("max_mint_txs_per_block", CBDC::MAX_MINT_TXS_PER_BLOCK);

            auto tc = CBDC::GetTreasuryConfig();
            UniValue treasury(UniValue::VOBJ);
            treasury.pushKV("required_sigs", tc.required_sigs);
            treasury.pushKV("total_keys", tc.total_keys);
            treasury.pushKV("timelock_blocks", tc.timelock_blocks);
            result.pushKV("treasury_config", treasury);

            std::string mode;
            switch (CBDC::GetWalletMode()) {
                case CBDC::WalletMode::CBDC:    mode = "cbdc";    break;
                case CBDC::WalletMode::CREATOR: mode = "creator"; break;
                case CBDC::WalletMode::PUBLIC:  mode = "public";  break;
                default:                         mode = "normal";  break;
            }
            result.pushKV("wallet_mode", mode);
            return result;
        },
    };
}

// ---------------------------------------------------------------------------
// generatepqckeypair [seed_hex]
// Generate ML-DSA-87 keypair for CBDC authority
// ---------------------------------------------------------------------------
static RPCHelpMan generatepqckeypair()
{
    return RPCHelpMan{
        "generatepqckeypair",
        "Generate ML-DSA-87 (FIPS 204, NIST Level 5) keypair untuk CBDC authority.\n"
        "Mengembalikan pubkey hash yang bisa di-set ke -cbdcpqcpubkeyhash.\n",
        {
            {"seed_hex", RPCArg::Type::STR, RPCArg::Optional::OMITTED,
             "32-byte seed (hex) untuk deterministic keygen. Tanpa seed = random."},
        },
        RPCResult{RPCResult::Type::OBJ, "", "", {}},
        RPCExamples{HelpExampleCli("generatepqckeypair", "")},
        [&](const RPCHelpMan& self, const JSONRPCRequest& request) -> UniValue
        {
            if (CBDC::GetWalletMode() != CBDC::WalletMode::CBDC)
                throw JSONRPCError(RPC_MISC_ERROR, "Hanya node CBDC yang boleh generate PQC keypair.");

            std::vector<uint8_t> pk(PQC::ML_DSA_87_PUBKEY_SIZE);
            std::vector<uint8_t> sk(PQC::ML_DSA_87_SECKEY_SIZE);
            bool ok;

            if (!request.params[0].isNull()) {
                auto seed = ParseHex(request.params[0].get_str());
                if (seed.size() != 32)
                    throw JSONRPCError(RPC_INVALID_PARAMETER, "seed_hex harus 32 bytes (64 hex chars)");
                ok = PQC::MLDSA87KeygenFromSeed(seed.data(), pk.data(), sk.data());
            } else {
                ok = PQC::MLDSA87Keygen(pk.data(), sk.data());
            }

            if (!ok) throw JSONRPCError(RPC_INTERNAL_ERROR, "ML-DSA-87 keygen gagal");

            // Compute SHA256(pubkey) for the config hash.
            // NOTE: we return raw-byte hex (HexStr), NOT uint256::GetHex() which
            // reverses bytes for display. The validator in RequirePQCAuth compares
            // raw SHA256 bytes via memcmp, so -cbdcpqcpubkeyhash must be raw-order.
            std::array<unsigned char, 32> pk_hash_raw;
            CSHA256().Write(pk.data(), pk.size()).Finalize(pk_hash_raw.data());
            std::string pk_hash_hex = HexStr(pk_hash_raw);

            // Combined key for mintgaruda: pk || sk
            std::vector<uint8_t> combined(pk.size() + sk.size());
            memcpy(combined.data(), pk.data(), pk.size());
            memcpy(combined.data() + pk.size(), sk.data(), sk.size());

            UniValue result(UniValue::VOBJ);
            result.pushKV("pubkey_hash", pk_hash_hex);
            result.pushKV("pubkey_hex", HexStr(pk));
            result.pushKV("seckey_hex", HexStr(sk));
            result.pushKV("combined_hex", HexStr(combined));
            result.pushKV("pubkey_size", (int)pk.size());
            result.pushKV("seckey_size", (int)sk.size());
            result.pushKV("algorithm", "ML-DSA-87 (FIPS 204, NIST Level 5)");
            result.pushKV("config_instruction",
                strprintf("Tambahkan ke bitcoin.conf:\n  cbdcpqcpubkeyhash=%s\n"
                          "Lalu restart node.", pk_hash_hex));

            return result;
        },
    };
}

// ---------------------------------------------------------------------------
// rotateauthoritykey <new_pubkey_hex> <old_privkey_hex> [new_pqc_pubkey_hash]
// ---------------------------------------------------------------------------
static RPCHelpMan rotateauthoritykey()
{
    return RPCHelpMan{
        "rotateauthoritykey",
        "Rotasi authority key. Harus di-sign oleh authority key lama.\n"
        "Key baru langsung aktif setelah command berhasil.\n",
        {
            {"new_pubkey_hex",    RPCArg::Type::STR, RPCArg::Optional::NO,
             "New Schnorr authority pubkey (32 bytes hex)"},
            {"old_privkey_hex",   RPCArg::Type::STR, RPCArg::Optional::NO,
             "Current authority private key (32 bytes hex) untuk otorisasi rotasi"},
            {"new_pqc_hash_hex",  RPCArg::Type::STR, RPCArg::Optional::OMITTED,
             "New PQC pubkey hash (32 bytes hex). Kosongkan untuk disable PQC."},
            {"pqcseckeyhex",      RPCArg::Type::STR, RPCArg::Optional::OMITTED,
             "ML-DSA-87 authority key (pk||sk, 7488 bytes hex). Wajib jika PQC aktif."},
        },
        RPCResult{RPCResult::Type::OBJ, "", "", {}},
        RPCExamples{HelpExampleCli("rotateauthoritykey", "\"<new_pub>\" \"<old_priv>\"")},
        [&](const RPCHelpMan& self, const JSONRPCRequest& request) -> UniValue
        {
            if (CBDC::GetWalletMode() != CBDC::WalletMode::CBDC)
                throw JSONRPCError(RPC_MISC_ERROR, "Hanya node CBDC.");

            std::string new_pubkey_hex = request.params[0].get_str();
            std::string old_privkey_hex = request.params[1].get_str();

            auto new_pub = ParseHex(new_pubkey_hex);
            auto old_priv = ParseHex(old_privkey_hex);

            if (new_pub.size() != 32)
                throw JSONRPCError(RPC_INVALID_PARAMETER, "new_pubkey_hex harus 32 bytes");
            if (old_priv.size() != 32)
                throw JSONRPCError(RPC_INVALID_PARAMETER, "old_privkey_hex harus 32 bytes");

            std::string pqc_hex = (request.params.size() > 3 && !request.params[3].isNull())
                                  ? request.params[3].get_str() : "";
            try {
                CBDC::RequirePQCAuth(pqc_hex, "rotateauthoritykey",
                                     new_pubkey_hex + "|" +
                                     (request.params[2].isNull() ? "" : request.params[2].get_str()));
            } catch (const std::runtime_error& e) {
                throw JSONRPCError(RPC_INVALID_PARAMETER, e.what());
            }

            // Verify old_priv matches current authority pubkey
            secp256k1_context* ctx = secp256k1_context_create(SECP256K1_CONTEXT_SIGN);
            unsigned char rand_bytes2[32];
            GetStrongRandBytes(Span{rand_bytes2, 32});
            (void)secp256k1_context_randomize(ctx, rand_bytes2);
            secp256k1_keypair keypair;
            if (!secp256k1_keypair_create(ctx, &keypair, old_priv.data())) {
                secp256k1_context_destroy(ctx);
                throw JSONRPCError(RPC_INVALID_PARAMETER, "Private key tidak valid");
            }

            secp256k1_xonly_pubkey xonly;
            (void)secp256k1_keypair_xonly_pub(ctx, &xonly, nullptr, &keypair);
            unsigned char pub32[32];
            secp256k1_xonly_pubkey_serialize(ctx, pub32, &xonly);

            std::string current_hex = CBDC::GetAuthorityPubkeyHex();
            auto current_pub = ParseHex(current_hex);
            if (std::vector<unsigned char>(pub32, pub32 + 32) != current_pub) {
                secp256k1_context_destroy(ctx);
                throw JSONRPCError(RPC_INVALID_PARAMETER,
                    "Private key tidak cocok dengan authority key saat ini.");
            }

            // Sign the rotation message: SHA256("ROTATE" || old_pub || new_pub)
            uint256 rotate_hash;
            {
                CSHA256 hasher;
                const std::string prefix = "ROTATE";
                hasher.Write((const unsigned char*)prefix.data(), prefix.size());
                hasher.Write(pub32, 32);
                hasher.Write(new_pub.data(), 32);
                hasher.Finalize(rotate_hash.begin());
            }

            unsigned char aux[32];
            GetStrongRandBytes(Span{aux, 32});
            unsigned char sig[64];
            bool ok = secp256k1_schnorrsig_sign32(ctx, sig, rotate_hash.data(), &keypair, aux) == 1;
            memory_cleanse(aux, 32);
            secp256k1_context_destroy(ctx);

            if (!ok)
                throw JSONRPCError(RPC_INTERNAL_ERROR, "Rotation signing gagal");

            // Apply rotation
            std::string old_pub_hex = current_hex;
            CBDC::SetAuthorityPubkeyHex(new_pubkey_hex);

            if (!request.params[2].isNull()) {
                std::string new_pqc = request.params[2].get_str();
                CBDC::SetAuthorityPQCPubkeyHashHex(new_pqc);
            }

            UniValue result(UniValue::VOBJ);
            result.pushKV("status", "OK");
            result.pushKV("old_pubkey", old_pub_hex);
            result.pushKV("new_pubkey", new_pubkey_hex);
            result.pushKV("rotation_sig", HexStr(std::vector<unsigned char>(sig, sig + 64)));
            result.pushKV("message", "Authority key rotated. Update bitcoin.conf dengan key baru.");
            return result;
        },
    };
}

// ---------------------------------------------------------------------------
void RegisterCBDCRPCCommands(CRPCTable& t)
{
    static const CRPCCommand commands[]{
        {"cbdc", &mintgaruda},
        {"cbdc", &burngaruda},
        {"cbdc", &getcbdcinfo},
        {"cbdc", &generatepqckeypair},
        {"cbdc", &rotateauthoritykey},
    };
    for (const auto& c : commands) {
        t.appendCommand(c.name, &c);
    }
}
