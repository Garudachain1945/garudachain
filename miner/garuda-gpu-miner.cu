/*
 * GarudaChain — CUDA GPU Miner (SHA3-256 PQC PoW)
 * ================================================
 * Real GPU mining using NVIDIA CUDA.
 * Each GPU thread grinds a different nonce range through SHA3-256 (Keccak).
 * Pure C++ — no Python dependency.
 *
 * Build:
 *   nvcc -O3 -arch=sm_86 -o garuda-gpu-miner garuda-gpu-miner.cu -lcurl -lssl -lcrypto
 *
 * Usage:
 *   ./garuda-gpu-miner --rpc-url http://127.0.0.1:19443 \
 *       --rpc-user garudacbdc --rpc-pass garudacbdc123 \
 *       --wallet cbdc-authority
 */

#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <cstdint>
#include <ctime>
#include <string>
#include <vector>
#include <chrono>
#include <signal.h>
#include <curl/curl.h>
#include <openssl/sha.h>

/* ══════════════════════════════════════════════════════════════════════════════
 *  SHA3-256 (Keccak) — device implementation
 * ══════════════════════════════════════════════════════════════════════════════ */

__device__ __constant__ uint64_t keccak_rc[24] = {
    0x0000000000000001ULL, 0x0000000000008082ULL, 0x800000000000808aULL,
    0x8000000080008000ULL, 0x000000000000808bULL, 0x0000000080000001ULL,
    0x8000000080008081ULL, 0x8000000000008009ULL, 0x000000000000008aULL,
    0x0000000000000088ULL, 0x0000000080008009ULL, 0x000000008000000aULL,
    0x000000008000808bULL, 0x800000000000008bULL, 0x8000000000008089ULL,
    0x8000000000008003ULL, 0x8000000000008002ULL, 0x8000000000000080ULL,
    0x000000000000800aULL, 0x800000008000000aULL, 0x8000000080008081ULL,
    0x8000000000008080ULL, 0x0000000080000001ULL, 0x8000000080008008ULL
};

__device__ __constant__ int keccak_rotc[24] = {
    1,3,6,10,15,21,28,36,45,55,2,14,27,41,56,8,25,43,62,18,39,61,20,44
};

__device__ __constant__ int keccak_piln[24] = {
    10,7,11,17,18,3,5,16,8,21,24,4,15,23,19,13,12,2,20,14,22,9,6,1
};

__device__ void keccakf(uint64_t st[25])
{
    uint64_t t, bc[5];
    for (int round = 0; round < 24; round++) {
        for (int i = 0; i < 5; i++)
            bc[i] = st[i] ^ st[i+5] ^ st[i+10] ^ st[i+15] ^ st[i+20];
        for (int i = 0; i < 5; i++) {
            t = bc[(i+4)%5] ^ ((bc[(i+1)%5] << 1) | (bc[(i+1)%5] >> 63));
            for (int j = 0; j < 25; j += 5) st[j+i] ^= t;
        }
        t = st[1];
        for (int i = 0; i < 24; i++) {
            int j = keccak_piln[i];
            bc[0] = st[j];
            st[j] = (t << keccak_rotc[i]) | (t >> (64-keccak_rotc[i]));
            t = bc[0];
        }
        for (int j = 0; j < 25; j += 5) {
            for (int i = 0; i < 5; i++) bc[i] = st[j+i];
            for (int i = 0; i < 5; i++) st[j+i] ^= (~bc[(i+1)%5]) & bc[(i+2)%5];
        }
        st[0] ^= keccak_rc[round];
    }
}

__device__ void sha3_256_80bytes(const uint8_t input[80], uint8_t output[32])
{
    uint64_t st[25];
    memset(st, 0, sizeof(st));

    for (int i = 0; i < 10; i++) {
        uint64_t word;
        memcpy(&word, input + i*8, 8);
        st[i] ^= word;
    }
    st[10] ^= 0x06ULL;
    st[16] ^= 0x8000000000000000ULL;

    keccakf(st);

    memcpy(output, st, 32);
}

/* ══════════════════════════════════════════════════════════════════════════════
 *  GPU Mining Kernel
 * ══════════════════════════════════════════════════════════════════════════════ */

__device__ uint32_t d_found_nonce;
__device__ uint32_t d_found;

__global__ void mine_kernel(
    const uint8_t *header_base,
    const uint8_t *target32,
    uint32_t start_nonce,
    uint32_t nonces_per_thread)
{
    uint32_t tid = blockIdx.x * blockDim.x + threadIdx.x;
    uint32_t nonce_start = start_nonce + tid * nonces_per_thread;

    uint8_t header[80];
    memcpy(header, header_base, 76);

    for (uint32_t i = 0; i < nonces_per_thread; i++) {
        if (d_found) return;

        uint32_t nonce = nonce_start + i;
        memcpy(header + 76, &nonce, 4);

        uint8_t hash[32];
        sha3_256_80bytes(header, hash);

        // Compare hash (LE uint256: byte[31]=MSB) vs target (BE: byte[0]=MSB)
        bool valid = false;
        for (int b = 31; b >= 0; b--) {
            uint8_t h = hash[b];
            uint8_t t = target32[31 - b];
            if (h < t) { valid = true; break; }
            if (h > t) break;
        }

        if (valid) {
            atomicExch(&d_found_nonce, nonce);
            atomicExch(&d_found, 1);
            return;
        }
    }
}

/* ══════════════════════════════════════════════════════════════════════════════
 *  JSON-RPC (via libcurl)
 * ══════════════════════════════════════════════════════════════════════════════ */

static std::string rpc_url, rpc_user, rpc_pass, rpc_wallet;
static volatile sig_atomic_t g_stop = 0;

void sighandler(int) { g_stop = 1; }

struct CurlBuf { std::string data; };

static size_t curl_cb(void *ptr, size_t sz, size_t nm, void *ud) {
    ((CurlBuf*)ud)->data.append((char*)ptr, sz*nm);
    return sz*nm;
}

std::string rpc_call(const std::string &method, const std::string &params = "[]", const std::string &wallet = "") {
    CURL *c = curl_easy_init();
    if (!c) return "";
    CurlBuf buf;
    std::string url = rpc_url;
    if (!wallet.empty()) url += "/wallet/" + wallet;
    std::string body = "{\"jsonrpc\":\"1.0\",\"id\":\"gpu\",\"method\":\"" + method + "\",\"params\":" + params + "}";
    struct curl_slist *hdrs = NULL;
    hdrs = curl_slist_append(hdrs, "Content-Type: application/json");
    curl_easy_setopt(c, CURLOPT_URL, url.c_str());
    curl_easy_setopt(c, CURLOPT_POSTFIELDS, body.c_str());
    curl_easy_setopt(c, CURLOPT_HTTPHEADER, hdrs);
    curl_easy_setopt(c, CURLOPT_USERNAME, rpc_user.c_str());
    curl_easy_setopt(c, CURLOPT_PASSWORD, rpc_pass.c_str());
    curl_easy_setopt(c, CURLOPT_WRITEFUNCTION, curl_cb);
    curl_easy_setopt(c, CURLOPT_WRITEDATA, &buf);
    curl_easy_setopt(c, CURLOPT_TIMEOUT, 30L);
    CURLcode res = curl_easy_perform(c);
    curl_slist_free_all(hdrs);
    curl_easy_cleanup(c);
    if (res != CURLE_OK) return "";
    return buf.data;
}

/* ══════════════════════════════════════════════════════════════════════════════
 *  Hex / JSON / crypto helpers
 * ══════════════════════════════════════════════════════════════════════════════ */

uint8_t hex_val(char c) {
    if (c >= '0' && c <= '9') return c-'0';
    if (c >= 'a' && c <= 'f') return c-'a'+10;
    if (c >= 'A' && c <= 'F') return c-'A'+10;
    return 0;
}

std::vector<uint8_t> hex_decode(const std::string &s) {
    std::vector<uint8_t> out(s.size()/2);
    for (size_t i = 0; i < out.size(); i++)
        out[i] = (hex_val(s[2*i]) << 4) | hex_val(s[2*i+1]);
    return out;
}

std::string hex_encode(const uint8_t *d, size_t n) {
    std::string out(n*2, '0');
    for (size_t i = 0; i < n; i++) {
        static const char hx[] = "0123456789abcdef";
        out[2*i] = hx[d[i]>>4]; out[2*i+1] = hx[d[i]&0xf];
    }
    return out;
}

std::string hex_encode_vec(const std::vector<uint8_t> &v) {
    return hex_encode(v.data(), v.size());
}

void sha256d(const uint8_t *data, size_t len, uint8_t out[32]) {
    uint8_t tmp[32];
    SHA256(data, len, tmp);
    SHA256(tmp, 32, out);
}

std::string json_str(const std::string &json, const std::string &key) {
    std::string needle = "\"" + key + "\"";
    size_t p = json.find(needle);
    if (p == std::string::npos) return "";
    p = json.find("\"", p + needle.size() + 1);
    if (p == std::string::npos) return "";
    size_t e = json.find("\"", p+1);
    if (e == std::string::npos) return "";
    return json.substr(p+1, e-p-1);
}

int64_t json_int(const std::string &json, const std::string &key) {
    std::string needle = "\"" + key + "\"";
    size_t p = json.find(needle);
    if (p == std::string::npos) return 0;
    p = json.find(":", p);
    if (p == std::string::npos) return 0;
    return strtoll(json.c_str()+p+1, NULL, 10);
}

void bits_to_target(const std::string &bits_hex, uint8_t target[32]) {
    uint32_t bits = strtoul(bits_hex.c_str(), NULL, 16);
    int exp = bits >> 24;
    uint32_t mant = bits & 0xffffff;
    memset(target, 0, 32);
    if (exp <= 3) {
        mant >>= 8*(3-exp);
        target[31] = mant & 0xff;
        target[30] = (mant >> 8) & 0xff;
        target[29] = (mant >> 16) & 0xff;
    } else {
        int off = 32 - exp;
        if (off >= 0 && off < 30) {
            target[off]   = (mant >> 16) & 0xff;
            target[off+1] = (mant >> 8) & 0xff;
            target[off+2] = mant & 0xff;
        }
    }
}

/* ══════════════════════════════════════════════════════════════════════════════
 *  Coinbase + Header builder (pure C++)
 * ══════════════════════════════════════════════════════════════════════════════ */

static void push_le32(std::vector<uint8_t> &v, uint32_t x) {
    v.push_back(x & 0xff); v.push_back((x>>8)&0xff);
    v.push_back((x>>16)&0xff); v.push_back((x>>24)&0xff);
}

static void push_le64(std::vector<uint8_t> &v, int64_t x) {
    for (int i = 0; i < 8; i++) v.push_back((x >> (i*8)) & 0xff);
}

static void push_varint(std::vector<uint8_t> &v, uint64_t n) {
    if (n < 253) { v.push_back((uint8_t)n); }
    else if (n <= 0xffff) { v.push_back(0xfd); v.push_back(n&0xff); v.push_back((n>>8)&0xff); }
    else { v.push_back(0xfe); push_le32(v, (uint32_t)n); }
}

static void push_height_script(std::vector<uint8_t> &sig, int height) {
    // Matches CScript::push_int64 — BIP34 compatible
    if (height == 0) {
        sig.push_back(0x00); // OP_0
    } else if (height >= 1 && height <= 16) {
        sig.push_back(0x50 + height); // OP_1..OP_16
    } else {
        // CScriptNum::serialize
        std::vector<uint8_t> h_bytes;
        int n = height;
        while (n > 0) { h_bytes.push_back(n & 0xff); n >>= 8; }
        if (h_bytes.back() & 0x80) h_bytes.push_back(0);
        sig.push_back((uint8_t)h_bytes.size());
        sig.insert(sig.end(), h_bytes.begin(), h_bytes.end());
    }
}

struct BlockTemplate {
    int version;
    std::string prev_hash;
    int height;
    std::string bits;
    int curtime;
    int64_t coinbasevalue;
    std::string default_witness_commitment;
    std::vector<uint8_t> header76;
    std::vector<uint8_t> coinbase_full;
};

bool build_block_template(BlockTemplate &bt) {
    std::string tmpl_json = rpc_call("getblocktemplate", "[{\"rules\":[\"segwit\"]}]");
    if (tmpl_json.empty()) return false;

    bt.version = (int)json_int(tmpl_json, "version");
    bt.prev_hash = json_str(tmpl_json, "previousblockhash");
    bt.height = (int)json_int(tmpl_json, "height");
    bt.bits = json_str(tmpl_json, "bits");
    bt.curtime = (int)json_int(tmpl_json, "curtime");
    bt.coinbasevalue = json_int(tmpl_json, "coinbasevalue");
    bt.default_witness_commitment = json_str(tmpl_json, "default_witness_commitment");

    if (bt.prev_hash.empty() || bt.bits.empty()) return false;

    std::string addr_json = rpc_call("getnewaddress", "[\"miner\",\"legacy\"]", rpc_wallet);
    std::string addr = json_str(addr_json, "result");
    if (addr.empty()) return false;

    std::string info_json = rpc_call("getaddressinfo", "[\"" + addr + "\"]", rpc_wallet);
    std::string spk_hex = json_str(info_json, "scriptPubKey");
    if (spk_hex.empty()) return false;

    auto spk = hex_decode(spk_hex);
    auto wc_bytes = bt.default_witness_commitment.empty()
        ? std::vector<uint8_t>() : hex_decode(bt.default_witness_commitment);

    // Build coinbase scriptSig: push_height + push_extranonce(8 random bytes)
    std::vector<uint8_t> sig;
    push_height_script(sig, bt.height);
    sig.push_back(8);
    for (int i = 0; i < 8; i++) sig.push_back(rand() & 0xff);

    // Non-witness serialization (for txid)
    std::vector<uint8_t> nw;
    push_le32(nw, 2); // version
    push_varint(nw, 1); // 1 input
    for (int i = 0; i < 32; i++) nw.push_back(0); // null prevout hash
    push_le32(nw, 0xffffffff); // prevout index
    push_varint(nw, sig.size());
    nw.insert(nw.end(), sig.begin(), sig.end());
    push_le32(nw, 0xffffffff); // sequence

    int n_out = wc_bytes.empty() ? 1 : 2;
    push_varint(nw, n_out);
    push_le64(nw, bt.coinbasevalue);
    push_varint(nw, spk.size());
    nw.insert(nw.end(), spk.begin(), spk.end());
    if (!wc_bytes.empty()) {
        push_le64(nw, 0);
        push_varint(nw, wc_bytes.size());
        nw.insert(nw.end(), wc_bytes.begin(), wc_bytes.end());
    }
    push_le32(nw, 0); // locktime

    // Compute txid = SHA256d(non-witness)
    uint8_t txid[32];
    sha256d(nw.data(), nw.size(), txid);

    // Full coinbase with witness
    bt.coinbase_full.clear();
    push_le32(bt.coinbase_full, 2); // version
    bt.coinbase_full.push_back(0x00); // marker
    bt.coinbase_full.push_back(0x01); // flag
    push_varint(bt.coinbase_full, 1); // 1 input
    for (int i = 0; i < 32; i++) bt.coinbase_full.push_back(0);
    push_le32(bt.coinbase_full, 0xffffffff);
    push_varint(bt.coinbase_full, sig.size());
    bt.coinbase_full.insert(bt.coinbase_full.end(), sig.begin(), sig.end());
    push_le32(bt.coinbase_full, 0xffffffff);

    push_varint(bt.coinbase_full, n_out);
    push_le64(bt.coinbase_full, bt.coinbasevalue);
    push_varint(bt.coinbase_full, spk.size());
    bt.coinbase_full.insert(bt.coinbase_full.end(), spk.begin(), spk.end());
    if (!wc_bytes.empty()) {
        push_le64(bt.coinbase_full, 0);
        push_varint(bt.coinbase_full, wc_bytes.size());
        bt.coinbase_full.insert(bt.coinbase_full.end(), wc_bytes.begin(), wc_bytes.end());
    }
    // witness stack: 1 item, 32 zero bytes
    push_varint(bt.coinbase_full, 1);
    bt.coinbase_full.push_back(0x20);
    for (int i = 0; i < 32; i++) bt.coinbase_full.push_back(0);
    push_le32(bt.coinbase_full, 0); // locktime

    // Build 76-byte header (without nonce)
    bt.header76.clear();
    push_le32(bt.header76, bt.version);
    // prev_hash: hex string -> bytes reversed (internal byte order)
    auto prev_bytes = hex_decode(bt.prev_hash);
    for (int i = 31; i >= 0; i--) bt.header76.push_back(prev_bytes[i]);
    // merkle root = txid (only coinbase, no other txs)
    for (int i = 0; i < 32; i++) bt.header76.push_back(txid[i]);
    push_le32(bt.header76, bt.curtime);
    // bits: hex -> bytes reversed
    auto bits_bytes = hex_decode(bt.bits);
    for (int i = 3; i >= 0; i--) bt.header76.push_back(bits_bytes[i]);

    return bt.header76.size() == 76;
}

/* ══════════════════════════════════════════════════════════════════════════════
 *  Host SHA3-256 for block hash display
 * ══════════════════════════════════════════════════════════════════════════════ */

static void host_keccakf(uint64_t st[25]) {
    static const uint64_t rc[24] = {
        0x0000000000000001ULL,0x0000000000008082ULL,0x800000000000808aULL,
        0x8000000080008000ULL,0x000000000000808bULL,0x0000000080000001ULL,
        0x8000000080008081ULL,0x8000000000008009ULL,0x000000000000008aULL,
        0x0000000000000088ULL,0x0000000080008009ULL,0x000000008000000aULL,
        0x000000008000808bULL,0x800000000000008bULL,0x8000000000008089ULL,
        0x8000000000008003ULL,0x8000000000008002ULL,0x8000000000000080ULL,
        0x000000000000800aULL,0x800000008000000aULL,0x8000000080008081ULL,
        0x8000000000008080ULL,0x0000000080000001ULL,0x8000000080008008ULL
    };
    static const int rotc[24] = {1,3,6,10,15,21,28,36,45,55,2,14,27,41,56,8,25,43,62,18,39,61,20,44};
    static const int piln[24] = {10,7,11,17,18,3,5,16,8,21,24,4,15,23,19,13,12,2,20,14,22,9,6,1};
    uint64_t t, bc[5];
    for (int round = 0; round < 24; round++) {
        for(int i=0;i<5;i++) bc[i]=st[i]^st[i+5]^st[i+10]^st[i+15]^st[i+20];
        for(int i=0;i<5;i++){t=bc[(i+4)%5]^((bc[(i+1)%5]<<1)|(bc[(i+1)%5]>>63));for(int j=0;j<25;j+=5)st[j+i]^=t;}
        t=st[1];
        for(int i=0;i<24;i++){int j=piln[i];bc[0]=st[j];st[j]=(t<<rotc[i])|(t>>(64-rotc[i]));t=bc[0];}
        for(int j=0;j<25;j+=5){for(int i=0;i<5;i++)bc[i]=st[j+i];for(int i=0;i<5;i++)st[j+i]^=(~bc[(i+1)%5])&bc[(i+2)%5];}
        st[0]^=rc[round];
    }
}

void host_sha3_256(const uint8_t *input, size_t len, uint8_t output[32]) {
    uint64_t st[25] = {0};
    for (size_t i = 0; i < len/8; i++) {
        uint64_t w; memcpy(&w, input+i*8, 8);
        st[i] ^= w;
    }
    st[10] ^= 0x06ULL;
    st[16] ^= 0x8000000000000000ULL;
    host_keccakf(st);
    memcpy(output, st, 32);
}

/* ══════════════════════════════════════════════════════════════════════════════
 *  Main
 * ══════════════════════════════════════════════════════════════════════════════ */

#define RED     "\033[1;31m"
#define GREEN   "\033[0;32m"
#define YELLOW  "\033[1;33m"
#define CYAN    "\033[0;36m"
#define MAGENTA "\033[0;35m"
#define BOLD    "\033[1m"
#define DIM     "\033[2m"
#define NC      "\033[0m"

int main(int argc, char **argv)
{
    rpc_url  = "http://127.0.0.1:19443";
    rpc_user = "garudacbdc";
    rpc_pass = "garudacbdc123";
    rpc_wallet = "cbdc-authority";

    for (int i = 1; i < argc; i++) {
        if (!strcmp(argv[i],"--rpc-url")  && i+1<argc) rpc_url  = argv[++i];
        if (!strcmp(argv[i],"--rpc-user") && i+1<argc) rpc_user = argv[++i];
        if (!strcmp(argv[i],"--rpc-pass") && i+1<argc) rpc_pass = argv[++i];
        if (!strcmp(argv[i],"--wallet")   && i+1<argc) rpc_wallet = argv[++i];
    }

    signal(SIGINT, sighandler);
    curl_global_init(CURL_GLOBAL_ALL);
    srand(time(NULL));

    printf(RED "\n"
    "  ██████╗  █████╗ ██████╗ ██╗   ██╗██████╗  █████╗  ██████╗██╗  ██╗ █████╗ ██╗███╗   ██╗\n"
    " ██╔════╝ ██╔══██╗██╔══██╗██║   ██║██╔══██╗██╔══██╗██╔════╝██║  ██║██╔══██╗██║████╗  ██║\n"
    " ██║  ███╗███████║██████╔╝██║   ██║██║  ██║███████║██║     ███████║███████║██║██╔██╗ ██║\n"
    " ██║   ██║██╔══██║██╔══██╗██║   ██║██║  ██║██╔══██║██║     ██╔══██║██╔══██║██║██║╚██╗██║\n"
    " ╚██████╔╝██║  ██║██║  ██║╚██████╔╝██████╔╝██║  ██║╚██████╗██║  ██║██║  ██║██║██║ ╚████║\n"
    "  ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝ ╚═════╝ ╚═╝  ╚═╝ ╚═════╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝╚═╝  ╚═══╝\n"
    NC "\n"
    BOLD CYAN "       ── CUDA GPU Miner — SHA3-256 PQC PoW ──\n" NC "\n");

    cudaDeviceProp prop;
    if (cudaGetDeviceProperties(&prop, 0) != cudaSuccess) {
        fprintf(stderr, RED "  ✗ No CUDA GPU detected. GPU required for mining.\n" NC);
        return 1;
    }

    printf("  " DIM "GPU:" NC "    %s (%d SMs, %d MHz)\n", prop.name, prop.multiProcessorCount, prop.clockRate/1000);
    printf("  " DIM "VRAM:" NC "   %lu MB\n", prop.totalGlobalMem / (1024*1024));
    printf("  " DIM "Algo:" NC "   SHA3-256 (NIST FIPS 202 Keccak)\n");
    printf("  " DIM "Node:" NC "   %s\n", rpc_url.c_str());
    printf("  " DIM "Wallet:" NC " %s\n\n", rpc_wallet.c_str());

    printf(BOLD GREEN "  ⛏  GPU MINING STARTED — Ctrl+C to stop\n" NC);
    printf("  " DIM "════════════════════════════════════════════════════════════════\n" NC);

    int blocks_mined = 0;
    uint64_t total_hashes = 0;
    auto t_start = std::chrono::steady_clock::now();

    const int GRID = prop.multiProcessorCount * 8;
    const int BLOCK_THREADS = 256;
    const int NONCES_PER_THREAD = 4096;
    const uint64_t HASHES_PER_ROUND = (uint64_t)GRID * BLOCK_THREADS * NONCES_PER_THREAD;

    uint8_t *d_header, *d_target;
    cudaMalloc(&d_header, 76);
    cudaMalloc(&d_target, 32);

    while (!g_stop) {
        BlockTemplate bt;
        if (!build_block_template(bt)) {
            fprintf(stderr, "  " RED "✗" NC " Failed to get block template, retrying...\n");
            usleep(2000000);
            continue;
        }

        uint8_t target[32];
        bits_to_target(bt.bits, target);

        cudaMemcpy(d_header, bt.header76.data(), 76, cudaMemcpyHostToDevice);
        cudaMemcpy(d_target, target, 32, cudaMemcpyHostToDevice);

        uint32_t zero = 0;
        cudaMemcpyToSymbol(d_found, &zero, sizeof(uint32_t));
        cudaMemcpyToSymbol(d_found_nonce, &zero, sizeof(uint32_t));

        uint32_t nonce_offset = 0;
        bool found = false;
        uint32_t winning_nonce = 0;
        auto t0 = std::chrono::steady_clock::now();

        while (!found && !g_stop) {
            mine_kernel<<<GRID, BLOCK_THREADS>>>(d_header, d_target, nonce_offset, NONCES_PER_THREAD);
            cudaDeviceSynchronize();

            uint32_t f;
            cudaMemcpyFromSymbol(&f, d_found, sizeof(uint32_t));
            if (f) {
                cudaMemcpyFromSymbol(&winning_nonce, d_found_nonce, sizeof(uint32_t));
                found = true;
            }

            nonce_offset += HASHES_PER_ROUND;
            total_hashes += HASHES_PER_ROUND;

            auto t1 = std::chrono::steady_clock::now();
            double el = std::chrono::duration<double>(t1-t0).count() + 1e-9;
            double rate = (double)(nonce_offset) / el;

            printf("\r  " DIM "grinding" NC " height=" BOLD "%d" NC " hashes=%lu rate=" YELLOW, bt.height, (unsigned long)nonce_offset);
            if (rate > 1e9) printf("%.2f GH/s", rate/1e9);
            else if (rate > 1e6) printf("%.2f MH/s", rate/1e6);
            else printf("%.2f KH/s", rate/1e3);
            printf(NC "   ");
            fflush(stdout);
        }

        if (g_stop) break;

        // Build and submit block
        uint8_t nonce_bytes[4];
        memcpy(nonce_bytes, &winning_nonce, 4);

        std::string block_hex = hex_encode_vec(bt.header76) + hex_encode(nonce_bytes, 4);
        block_hex += "01"; // varint: 1 transaction
        block_hex += hex_encode_vec(bt.coinbase_full);

        std::string submit_result = rpc_call("submitblock", "[\"" + block_hex + "\"]");

        blocks_mined++;
        auto t1 = std::chrono::steady_clock::now();
        double elapsed = std::chrono::duration<double>(t1-t0).count();
        double tot_elapsed = std::chrono::duration<double>(t1-t_start).count();
        double rate = (double)nonce_offset / (elapsed + 1e-9);

        // Compute block hash on host for display
        std::vector<uint8_t> full_hdr(80);
        memcpy(full_hdr.data(), bt.header76.data(), 76);
        memcpy(full_hdr.data()+76, nonce_bytes, 4);
        uint8_t bhash[32];
        host_sha3_256(full_hdr.data(), 80, bhash);

        uint8_t bhash_be[32];
        for(int i=0;i<32;i++) bhash_be[i] = bhash[31-i];
        std::string hash_str = hex_encode(bhash_be, 32);

        // submitblock returns {"result":null} on success, {"result":"high-hash"} etc on failure
        bool accepted = !submit_result.empty() && submit_result.find("\"result\":null") != std::string::npos
                         && submit_result.find("\"error\":null") != std::string::npos;
        time_t now = time(NULL);
        struct tm *tm = localtime(&now);
        char ts[16]; strftime(ts, sizeof(ts), "%H:%M:%S", tm);

        printf("\r                                                                              \r");
        printf("  " GREEN "[%s]" NC " " BOLD "Block #%d" NC "  Nonce: %u  ", ts, bt.height, winning_nonce);
        if (rate > 1e9) printf(YELLOW "%.2f GH/s" NC, rate/1e9);
        else if (rate > 1e6) printf(YELLOW "%.2f MH/s" NC, rate/1e6);
        else printf(YELLOW "%.2f KH/s" NC, rate/1e3);
        printf("  %s\n", accepted ? GREEN "accepted" NC : RED "REJECTED" NC);
        printf("  " DIM "├─ hash: " NC "%s\n", hash_str.substr(0, 40).c_str());

        if (blocks_mined % 5 == 0) {
            std::string bal_json = rpc_call("getbalance", "[]", rpc_wallet);
            double avg = (double)total_hashes / (tot_elapsed + 1e-9);
            printf("  " DIM "├─ mined=%d total_hashes=%lu avg=", blocks_mined, (unsigned long)total_hashes);
            if (avg > 1e9) printf("%.2f GH/s", avg/1e9);
            else if (avg > 1e6) printf("%.2f MH/s", avg/1e6);
            else printf("%.2f KH/s", avg/1e3);
            printf(" elapsed=%.0fs" NC "\n", tot_elapsed);
        }
    }

    cudaFree(d_header);
    cudaFree(d_target);

    printf("\n  " YELLOW "■ Mining stopped.\n" NC);
    auto t_end = std::chrono::steady_clock::now();
    double total_time = std::chrono::duration<double>(t_end - t_start).count();
    printf("  " DIM "════════════════════════════════════════════════════════════════\n" NC);
    printf("  " BOLD "Blocks: %d   Total hashes: %lu   Elapsed: %.0fs\n" NC, blocks_mined, (unsigned long)total_hashes, total_time);

    curl_global_cleanup();
    return 0;
}
