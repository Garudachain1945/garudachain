// Copyright (c) 2026 GarudaChain developers
// RPC: generatepqckeypair, getpqcaddress, verifypqcsig
#include <config/bitcoin-config.h> // IWYU pragma: keep

#include <bech32.h>
#include <chainparams.h>
#include <crypto/pqc/ml_dsa87.h>
#include <crypto/sha256.h>
#include <rpc/pqc.h>
#include <rpc/server.h>
#include <rpc/util.h>
#include <support/cleanse.h>
#include <univalue.h>
#include <util/strencodings.h>

#include <vector>

// ---------------------------------------------------------------------------
// Helper: convert 8-bit data to 5-bit (for bech32)
// ---------------------------------------------------------------------------
static std::vector<uint8_t> ConvertBits8to5(const std::vector<uint8_t>& data)
{
    std::vector<uint8_t> out;
    int acc = 0, bits = 0;
    for (uint8_t v : data) {
        acc = (acc << 8) | v;
        bits += 8;
        while (bits >= 5) {
            bits -= 5;
            out.push_back((acc >> bits) & 31);
        }
    }
    if (bits > 0) out.push_back((acc << (5 - bits)) & 31);
    return out;
}

// ---------------------------------------------------------------------------
// Helper: ML-DSA-87 pubkey → grd1z... (bech32m, witness v2)
// ---------------------------------------------------------------------------
static std::string PubkeyToP2PQH(const uint8_t* pubkey, size_t pk_len)
{
    // SHA256(pubkey) → 32-byte program
    uint256 hash;
    CSHA256().Write(pubkey, pk_len).Finalize(hash.begin());

    std::vector<uint8_t> program(hash.begin(), hash.end());
    std::vector<uint8_t> words = ConvertBits8to5(program);
    // Prepend witness version 2
    words.insert(words.begin(), 2);
    return bech32::Encode(bech32::Encoding::BECH32M, "grd", words);
}

// ---------------------------------------------------------------------------
// generatepqckeypair
// Generate a random ML-DSA-87 keypair
// ---------------------------------------------------------------------------
static RPCHelpMan generatepqckeypair()
{
    return RPCHelpMan{
        "generatepqckeypair",
        "Generate ML-DSA-87 (FIPS 204) post-quantum keypair.\n",
        {},
        RPCResult{RPCResult::Type::ANY, "", ""},
        RPCExamples{HelpExampleCli("generatepqckeypair", "")},
        [&](const RPCHelpMan& self, const JSONRPCRequest& request) -> UniValue
        {
            std::vector<uint8_t> pk(PQC::ML_DSA_87_PUBKEY_SIZE);
            std::vector<uint8_t> sk(PQC::ML_DSA_87_SECKEY_SIZE);

            if (!PQC::MLDSA87Keygen(pk.data(), sk.data()))
                throw JSONRPCError(RPC_INTERNAL_ERROR, "ML-DSA-87 keygen gagal");

            std::string address = PubkeyToP2PQH(pk.data(), pk.size());

            UniValue result(UniValue::VOBJ);
            result.pushKV("algorithm", "ML-DSA-87");
            result.pushKV("pubkey_hex", HexStr(pk));
            result.pushKV("seckey_hex", HexStr(sk));
            result.pushKV("pubkey_size", (int)pk.size());
            result.pushKV("seckey_size", (int)sk.size());
            result.pushKV("address", address);
            result.pushKV("witness_version", 2);
            // Cleanse secret key from memory after serializing to hex
            memory_cleanse(sk.data(), sk.size());
            return result;
        },
    };
}

// ---------------------------------------------------------------------------
// getpqcaddress <pubkey_hex>
// Derive grd1z... address from ML-DSA-87 public key
// ---------------------------------------------------------------------------
static RPCHelpMan getpqcaddress()
{
    return RPCHelpMan{
        "getpqcaddress",
        "Derive quantum address (grd1z...) dari ML-DSA-87 public key.\n",
        {
            {"pubkey", RPCArg::Type::STR_HEX, RPCArg::Optional::NO,
             "ML-DSA-87 public key (2592 bytes hex)"},
        },
        RPCResult{RPCResult::Type::ANY, "", ""},
        RPCExamples{HelpExampleCli("getpqcaddress", "\"<pubkey_hex>\"")},
        [&](const RPCHelpMan& self, const JSONRPCRequest& request) -> UniValue
        {
            std::string hex = request.params[0].get_str();
            std::vector<uint8_t> pk = ParseHex(hex);

            if (pk.size() != PQC::ML_DSA_87_PUBKEY_SIZE) {
                throw JSONRPCError(RPC_INVALID_PARAMETER,
                    strprintf("Public key harus %d bytes, dapat %d",
                              PQC::ML_DSA_87_PUBKEY_SIZE, pk.size()));
            }

            std::string address = PubkeyToP2PQH(pk.data(), pk.size());

            UniValue result(UniValue::VOBJ);
            result.pushKV("address", address);
            result.pushKV("witness_version", 2);
            result.pushKV("algorithm", "ML-DSA-87");
            result.pushKV("pubkey_size", (int)pk.size());
            return result;
        },
    };
}

// ---------------------------------------------------------------------------
// signpqc <message_hex> <seckey_hex>
// Sign a message with ML-DSA-87
// ---------------------------------------------------------------------------
static RPCHelpMan signpqc()
{
    return RPCHelpMan{
        "signpqc",
        "Sign message dengan ML-DSA-87.\n",
        {
            {"message", RPCArg::Type::STR_HEX, RPCArg::Optional::NO, "Message hex"},
            {"seckey",  RPCArg::Type::STR_HEX, RPCArg::Optional::NO, "Secret key hex (4896 bytes)"},
        },
        RPCResult{RPCResult::Type::ANY, "", ""},
        RPCExamples{HelpExampleCli("signpqc", "\"<msg_hex>\" \"<seckey_hex>\"")},
        [&](const RPCHelpMan& self, const JSONRPCRequest& request) -> UniValue
        {
            std::vector<uint8_t> msg = ParseHex(request.params[0].get_str());
            std::vector<uint8_t> sk = ParseHex(request.params[1].get_str());

            if (sk.size() != PQC::ML_DSA_87_SECKEY_SIZE) {
                memory_cleanse(sk.data(), sk.size());
                throw JSONRPCError(RPC_INVALID_PARAMETER,
                    strprintf("Secret key harus %d bytes", PQC::ML_DSA_87_SECKEY_SIZE));
            }

            std::vector<uint8_t> sig(PQC::ML_DSA_87_SIG_SIZE);
            size_t sig_len = 0;

            bool sign_ok = PQC::MLDSA87Sign(sig.data(), &sig_len, msg.data(), msg.size(), sk.data());
            // Always cleanse secret key from memory regardless of success
            memory_cleanse(sk.data(), sk.size());

            if (!sign_ok)
                throw JSONRPCError(RPC_INTERNAL_ERROR, "ML-DSA-87 sign gagal");

            sig.resize(sig_len);

            UniValue result(UniValue::VOBJ);
            result.pushKV("signature", HexStr(sig));
            result.pushKV("sig_size", (int)sig_len);
            result.pushKV("algorithm", "ML-DSA-87");
            return result;
        },
    };
}

// ---------------------------------------------------------------------------
// verifypqcsig <message_hex> <signature_hex> <pubkey_hex>
// Verify an ML-DSA-87 signature
// ---------------------------------------------------------------------------
static RPCHelpMan verifypqcsig()
{
    return RPCHelpMan{
        "verifypqcsig",
        "Verifikasi signature ML-DSA-87.\n",
        {
            {"message",   RPCArg::Type::STR_HEX, RPCArg::Optional::NO, "Message hex"},
            {"signature", RPCArg::Type::STR_HEX, RPCArg::Optional::NO, "Signature hex (4627 bytes)"},
            {"pubkey",    RPCArg::Type::STR_HEX, RPCArg::Optional::NO, "Public key hex (2592 bytes)"},
        },
        RPCResult{RPCResult::Type::ANY, "", ""},
        RPCExamples{HelpExampleCli("verifypqcsig", "\"<msg>\" \"<sig>\" \"<pk>\"")},
        [&](const RPCHelpMan& self, const JSONRPCRequest& request) -> UniValue
        {
            std::vector<uint8_t> msg = ParseHex(request.params[0].get_str());
            std::vector<uint8_t> sig = ParseHex(request.params[1].get_str());
            std::vector<uint8_t> pk  = ParseHex(request.params[2].get_str());

            if (pk.size() != PQC::ML_DSA_87_PUBKEY_SIZE)
                throw JSONRPCError(RPC_INVALID_PARAMETER,
                    strprintf("Public key harus %d bytes", PQC::ML_DSA_87_PUBKEY_SIZE));

            bool valid = PQC::MLDSA87Verify(msg.data(), msg.size(),
                                             sig.data(), sig.size(),
                                             pk.data());

            UniValue result(UniValue::VOBJ);
            result.pushKV("valid", valid);
            result.pushKV("algorithm", "ML-DSA-87");
            result.pushKV("msg_size", (int)msg.size());
            result.pushKV("sig_size", (int)sig.size());
            return result;
        },
    };
}

// ---------------------------------------------------------------------------
// getpqcinfo
// Return PQC algorithm parameters
// ---------------------------------------------------------------------------
static RPCHelpMan getpqcinfo()
{
    return RPCHelpMan{
        "getpqcinfo",
        "Informasi algoritma post-quantum yang digunakan.\n",
        {},
        RPCResult{RPCResult::Type::ANY, "", ""},
        RPCExamples{HelpExampleCli("getpqcinfo", "")},
        [&](const RPCHelpMan& self, const JSONRPCRequest& request) -> UniValue
        {
            UniValue result(UniValue::VOBJ);
            result.pushKV("algorithm", "ML-DSA-87");
            result.pushKV("standard", "FIPS 204");
            result.pushKV("security_level", 5);
            result.pushKV("pubkey_size", (int)PQC::ML_DSA_87_PUBKEY_SIZE);
            result.pushKV("seckey_size", (int)PQC::ML_DSA_87_SECKEY_SIZE);
            result.pushKV("signature_size", (int)PQC::ML_DSA_87_SIG_SIZE);
            result.pushKV("witness_version", 2);
            result.pushKV("address_prefix", "grd1z");
            result.pushKV("encoding", "bech32m");
            return result;
        },
    };
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------
void RegisterPQCRPCCommands(CRPCTable& t)
{
    static const CRPCCommand commands[]{
        {"pqc", &generatepqckeypair},
        {"pqc", &getpqcaddress},
        {"pqc", &signpqc},
        {"pqc", &verifypqcsig},
        {"pqc", &getpqcinfo},
    };
    for (const auto& c : commands) t.appendCommand(c.name, &c);
}
