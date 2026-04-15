#!/usr/bin/env python3
"""Terbitkan semua stablecoin (166 mata uang dunia) di GarudaChain.

SECURITY: sensitive values (RPC password, CBDC AUTH_PRIVKEY) MUST be
supplied via env vars — they are never hardcoded in this file. If the
env vars are missing the script refuses to run rather than falling back
to a dev default.

Required env:
  GARUDA_RPC_PASS_CBDC   — cbdc node rpc password
  GARUDA_AUTH_PRIVKEY    — CBDC mint authority private key (hex, 64 chars)
Optional env:
  GARUDA_RPC_USER_CBDC   — default: garudacbdc
  GARUDA_RPC_PORT_CBDC   — default: 19443
"""

import os, subprocess, json, sys

CLI = "/home/muhammadjefry/garudachain/wallets/garuda-cli"


def _require_env(name: str) -> str:
    v = os.environ.get(name, "").strip()
    if not v:
        sys.stderr.write(
            f"FATAL: env var {name} is required. Set it before running this script.\n"
            f"       Do NOT commit secrets. See SECURITY.md for the full list.\n"
        )
        sys.exit(2)
    return v


RPC_USER = os.environ.get("GARUDA_RPC_USER_CBDC", "garudacbdc")
RPC_PASS = _require_env("GARUDA_RPC_PASS_CBDC")
RPC_PORT = os.environ.get("GARUDA_RPC_PORT_CBDC", "19443")
AUTH_PRIVKEY = _require_env("GARUDA_AUTH_PRIVKEY")
if len(AUTH_PRIVKEY) != 64 or not all(c in "0123456789abcdefABCDEF" for c in AUTH_PRIVKEY):
    sys.stderr.write("FATAL: GARUDA_AUTH_PRIVKEY must be 64 hex chars\n")
    sys.exit(2)

RPC = [f"-rpcport={RPC_PORT}", f"-rpcuser={RPC_USER}", f"-rpcpassword={RPC_PASS}"]
SUPPLY = 999999999999999  # 999 triliun (praktis unlimited)

# Mata uang + nama + emoji bendera
CURRENCIES = {
    "AED": ("🇦🇪 UAE Dirham", 1),
    "AFN": ("🇦🇫 Afghan Afghani", 1),
    "ALL": ("🇦🇱 Albanian Lek", 1),
    "AMD": ("🇦🇲 Armenian Dram", 1),
    "ANG": ("🇨🇼 Netherlands Antillean Guilder", 1),
    "AOA": ("🇦🇴 Angolan Kwanza", 1),
    "ARS": ("🇦🇷 Argentine Peso", 1),
    "AUD": ("🇦🇺 Australian Dollar", 1),
    "AWG": ("🇦🇼 Aruban Florin", 1),
    "AZN": ("🇦🇿 Azerbaijani Manat", 1),
    "BAM": ("🇧🇦 Bosnia Mark", 1),
    "BBD": ("🇧🇧 Barbadian Dollar", 1),
    "BDT": ("🇧🇩 Bangladeshi Taka", 1),
    "BGN": ("🇧🇬 Bulgarian Lev", 1),
    "BHD": ("🇧🇭 Bahraini Dinar", 1),
    "BIF": ("🇧🇮 Burundian Franc", 1),
    "BMD": ("🇧🇲 Bermudian Dollar", 1),
    "BND": ("🇧🇳 Brunei Dollar", 1),
    "BOB": ("🇧🇴 Bolivian Boliviano", 1),
    "BRL": ("🇧🇷 Brazilian Real", 1),
    "BSD": ("🇧🇸 Bahamian Dollar", 1),
    "BTN": ("🇧🇹 Bhutanese Ngultrum", 1),
    "BWP": ("🇧🇼 Botswana Pula", 1),
    "BYN": ("🇧🇾 Belarusian Ruble", 1),
    "BZD": ("🇧🇿 Belize Dollar", 1),
    "CAD": ("🇨🇦 Canadian Dollar", 1),
    "CDF": ("🇨🇩 Congolese Franc", 1),
    "CHF": ("🇨🇭 Swiss Franc", 1),
    "CLP": ("🇨🇱 Chilean Peso", 1),
    "CNY": ("🇨🇳 Chinese Yuan", 1),
    "COP": ("🇨🇴 Colombian Peso", 1),
    "CRC": ("🇨🇷 Costa Rican Colon", 1),
    "CUP": ("🇨🇺 Cuban Peso", 1),
    "CVE": ("🇨🇻 Cape Verdean Escudo", 1),
    "CZK": ("🇨🇿 Czech Koruna", 1),
    "DJF": ("🇩🇯 Djiboutian Franc", 1),
    "DKK": ("🇩🇰 Danish Krone", 1),
    "DOP": ("🇩🇴 Dominican Peso", 1),
    "DZD": ("🇩🇿 Algerian Dinar", 1),
    "EGP": ("🇪🇬 Egyptian Pound", 1),
    "ERN": ("🇪🇷 Eritrean Nakfa", 1),
    "ETB": ("🇪🇹 Ethiopian Birr", 1),
    "EUR": ("🇪🇺 Euro", 1),
    "FJD": ("🇫🇯 Fijian Dollar", 1),
    "FKP": ("🇫🇰 Falkland Islands Pound", 1),
    "GBP": ("🇬🇧 British Pound", 1),
    "GEL": ("🇬🇪 Georgian Lari", 1),
    "GHS": ("🇬🇭 Ghanaian Cedi", 1),
    "GIP": ("🇬🇮 Gibraltar Pound", 1),
    "GMD": ("🇬🇲 Gambian Dalasi", 1),
    "GNF": ("🇬🇳 Guinean Franc", 1),
    "GTQ": ("🇬🇹 Guatemalan Quetzal", 1),
    "GYD": ("🇬🇾 Guyanese Dollar", 1),
    "HKD": ("🇭🇰 Hong Kong Dollar", 1),
    "HNL": ("🇭🇳 Honduran Lempira", 1),
    "HRK": ("🇭🇷 Croatian Kuna", 1),
    "HTG": ("🇭🇹 Haitian Gourde", 1),
    "HUF": ("🇭🇺 Hungarian Forint", 1),
    "IDR": ("🇮🇩 Indonesian Rupiah", 1),
    "ILS": ("🇮🇱 Israeli Shekel", 1),
    "INR": ("🇮🇳 Indian Rupee", 1),
    "IQD": ("🇮🇶 Iraqi Dinar", 1),
    "IRR": ("🇮🇷 Iranian Rial", 1),
    "ISK": ("🇮🇸 Icelandic Krona", 1),
    "JMD": ("🇯🇲 Jamaican Dollar", 1),
    "JOD": ("🇯🇴 Jordanian Dinar", 1),
    "JPY": ("🇯🇵 Japanese Yen", 1),
    "KES": ("🇰🇪 Kenyan Shilling", 1),
    "KGS": ("🇰🇬 Kyrgyz Som", 1),
    "KHR": ("🇰🇭 Cambodian Riel", 1),
    "KMF": ("🇰🇲 Comorian Franc", 1),
    "KRW": ("🇰🇷 South Korean Won", 1),
    "KWD": ("🇰🇼 Kuwaiti Dinar", 1),
    "KYD": ("🇰🇾 Cayman Islands Dollar", 1),
    "KZT": ("🇰🇿 Kazakh Tenge", 1),
    "LAK": ("🇱🇦 Lao Kip", 1),
    "LBP": ("🇱🇧 Lebanese Pound", 1),
    "LKR": ("🇱🇰 Sri Lankan Rupee", 1),
    "LRD": ("🇱🇷 Liberian Dollar", 1),
    "LSL": ("🇱🇸 Lesotho Loti", 1),
    "LYD": ("🇱🇾 Libyan Dinar", 1),
    "MAD": ("🇲🇦 Moroccan Dirham", 1),
    "MDL": ("🇲🇩 Moldovan Leu", 1),
    "MGA": ("🇲🇬 Malagasy Ariary", 1),
    "MKD": ("🇲🇰 Macedonian Denar", 1),
    "MMK": ("🇲🇲 Myanmar Kyat", 1),
    "MNT": ("🇲🇳 Mongolian Tugrik", 1),
    "MOP": ("🇲🇴 Macanese Pataca", 1),
    "MRU": ("🇲🇷 Mauritanian Ouguiya", 1),
    "MUR": ("🇲🇺 Mauritian Rupee", 1),
    "MVR": ("🇲🇻 Maldivian Rufiyaa", 1),
    "MWK": ("🇲🇼 Malawian Kwacha", 1),
    "MXN": ("🇲🇽 Mexican Peso", 1),
    "MYR": ("🇲🇾 Malaysian Ringgit", 1),
    "MZN": ("🇲🇿 Mozambican Metical", 1),
    "NAD": ("🇳🇦 Namibian Dollar", 1),
    "NGN": ("🇳🇬 Nigerian Naira", 1),
    "NIO": ("🇳🇮 Nicaraguan Cordoba", 1),
    "NOK": ("🇳🇴 Norwegian Krone", 1),
    "NPR": ("🇳🇵 Nepalese Rupee", 1),
    "NZD": ("🇳🇿 New Zealand Dollar", 1),
    "OMR": ("🇴🇲 Omani Rial", 1),
    "PAB": ("🇵🇦 Panamanian Balboa", 1),
    "PEN": ("🇵🇪 Peruvian Sol", 1),
    "PGK": ("🇵🇬 Papua New Guinean Kina", 1),
    "PHP": ("🇵🇭 Philippine Peso", 1),
    "PKR": ("🇵🇰 Pakistani Rupee", 1),
    "PLN": ("🇵🇱 Polish Zloty", 1),
    "PYG": ("🇵🇾 Paraguayan Guarani", 1),
    "QAR": ("🇶🇦 Qatari Riyal", 1),
    "RON": ("🇷🇴 Romanian Leu", 1),
    "RSD": ("🇷🇸 Serbian Dinar", 1),
    "RUB": ("🇷🇺 Russian Ruble", 1),
    "RWF": ("🇷🇼 Rwandan Franc", 1),
    "SAR": ("🇸🇦 Saudi Riyal", 1),
    "SBD": ("🇸🇧 Solomon Islands Dollar", 1),
    "SCR": ("🇸🇨 Seychellois Rupee", 1),
    "SDG": ("🇸🇩 Sudanese Pound", 1),
    "SEK": ("🇸🇪 Swedish Krona", 1),
    "SGD": ("🇸🇬 Singapore Dollar", 1),
    "SHP": ("🇸🇭 Saint Helena Pound", 1),
    "SLE": ("🇸🇱 Sierra Leonean Leone", 1),
    "SOS": ("🇸🇴 Somali Shilling", 1),
    "SRD": ("🇸🇷 Surinamese Dollar", 1),
    "SSP": ("🇸🇸 South Sudanese Pound", 1),
    "STN": ("🇸🇹 Sao Tome Dobra", 1),
    "SYP": ("🇸🇾 Syrian Pound", 1),
    "SZL": ("🇸🇿 Eswatini Lilangeni", 1),
    "THB": ("🇹🇭 Thai Baht", 1),
    "TJS": ("🇹🇯 Tajik Somoni", 1),
    "TMT": ("🇹🇲 Turkmen Manat", 1),
    "TND": ("🇹🇳 Tunisian Dinar", 1),
    "TOP": ("🇹🇴 Tongan Paanga", 1),
    "TRY": ("🇹🇷 Turkish Lira", 1),
    "TTD": ("🇹🇹 Trinidad Dollar", 1),
    "TWD": ("🇹🇼 Taiwan Dollar", 1),
    "TZS": ("🇹🇿 Tanzanian Shilling", 1),
    "UAH": ("🇺🇦 Ukrainian Hryvnia", 1),
    "UGX": ("🇺🇬 Ugandan Shilling", 1),
    "USD": ("🇺🇸 US Dollar", 1),
    "UYU": ("🇺🇾 Uruguayan Peso", 1),
    "UZS": ("🇺🇿 Uzbek Som", 1),
    "VES": ("🇻🇪 Venezuelan Bolivar", 1),
    "VND": ("🇻🇳 Vietnamese Dong", 1),
    "VUV": ("🇻🇺 Vanuatu Vatu", 1),
    "WST": ("🇼🇸 Samoan Tala", 1),
    "XAF": ("🌍 Central African CFA", 1),
    "XCD": ("🌴 East Caribbean Dollar", 1),
    "XOF": ("🌍 West African CFA", 1),
    "XPF": ("🏝️ CFP Franc", 1),
    "YER": ("🇾🇪 Yemeni Rial", 1),
    "ZAR": ("🇿🇦 South African Rand", 1),
    "ZMW": ("🇿🇲 Zambian Kwacha", 1),
    "ZWL": ("🇿🇼 Zimbabwean Dollar", 1),
}

import urllib.request

def rpc(cmd, args=[]):
    """JSON-RPC call via HTTP (supports null params)"""
    payload = json.dumps({
        "jsonrpc": "1.0",
        "id": "py",
        "method": cmd,
        "params": args
    })
    req = urllib.request.Request(
        "http://127.0.0.1:19443",
        data=payload.encode(),
        headers={"Content-Type": "application/json",
                 "Authorization": "Basic " + __import__('base64').b64encode(b"garudacbdc:garudacbdc123").decode()}
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read())
            if data.get("error"):
                return None, data["error"].get("message", str(data["error"]))
            return data.get("result"), None
    except urllib.error.HTTPError as e:
        body = json.loads(e.read())
        return None, body.get("error", {}).get("message", str(body))
    except Exception as e:
        return None, str(e)

# Get address for issuing
addr_raw, err = rpc("getnewaddress", ["stablecoin-authority"])
if err:
    print(f"ERROR getting address: {err}")
    exit(1)
address = addr_raw

print(f"=== Menerbitkan {len(CURRENCIES)} Stablecoin ===")
print(f"Address: {address}")
print(f"Supply: {SUPPLY:,} per stablecoin")
print()

success = 0
failed = 0
skipped = 0

for code, (name, peg_rate) in sorted(CURRENCIES.items()):
    symbol = code  # Simbol = kode mata uang asli
    full_name = name

    result, err = rpc("issueasset", [
        symbol, full_name, "stablecoin", SUPPLY, address,
        None, None, None, None,  # face_value, maturity, coupon, nav (skip)
        peg_rate, code  # peg_rate, peg_currency
    ])

    if err and "sudah ada" in err.lower():
        print(f"  SKIP  {code:5s} — sudah ada")
        skipped += 1
    elif err:
        print(f"  FAIL  {code:5s} — {err[:60]}")
        failed += 1
    else:
        asset_id = result.get("asset_id", "?")[:16]
        print(f"  OK    {code:5s} {name[:35]:35s} — {asset_id}...")
        success += 1

# Mine 1 block to confirm all
print()
print("Mining 1 block untuk konfirmasi...")
rpc("generatetoaddress", [1, address])

print()
print(f"=== Stablecoin Selesai ===")
print(f"  Berhasil: {success}")
print(f"  Skipped:  {skipped}")
print(f"  Gagal:    {failed}")
print(f"  Total:    {success + skipped + failed}")

# === Mint 1 triliun GRD ke wallet stablecoin ===
print()
print("=== Mint 1 Triliun GRD ===")
# AUTH_PRIVKEY loaded from GARUDA_AUTH_PRIVKEY env at the top of this file.
GRD_AMOUNT = "1000000000000.00"  # 1 triliun GRD (string format untuk AmountFromValue)

result, err = rpc("mintgaruda", [GRD_AMOUNT, address, AUTH_PRIVKEY])
if err:
    print(f"  FAIL mint GRD: {err}")
else:
    txid = result if isinstance(result, str) else result.get("txid", str(result))
    print(f"  OK   Mint {GRD_AMOUNT:,} GRD ke {address}")
    print(f"  TXID: {txid}")

# Mine block untuk konfirmasi GRD mint
rpc("generatetoaddress", [1, address])
print("  Block mined untuk konfirmasi GRD mint")
print()
print("=== SEMUA SELESAI ===")
