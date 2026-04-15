# GarudaChain Production Deployment

Operator-facing artifacts for running GarudaChain in production. These are
templates — copy to the target paths, fill in real secrets, and never
commit the filled versions back to the repo.

## Files

| File                         | Copy to                                              | chmod  | Owner       |
| ---------------------------- | ---------------------------------------------------- | ------ | ----------- |
| `garudaapi.env.example`      | `/etc/garudaapi/garudaapi.env`                       | 600    | root:garuda |
| `garudaapi.service`          | `/etc/systemd/system/garudaapi.service`              | 644    | root:root   |
| `garudad-cbdc.service`       | `/etc/systemd/system/garudad-cbdc.service`           | 644    | root:root   |
| `nginx-garudachain.conf`     | `/etc/nginx/sites-available/garudachain`             | 644    | root:root   |

## First-time install

```bash
# 1. System user
sudo useradd --system --home /var/lib/garudachain-cbdc --shell /usr/sbin/nologin garuda

# 2. Paths
sudo mkdir -p /opt/garudachain/api /opt/garudachain/wallets \
              /var/lib/garudachain-cbdc /var/lib/garudachain-public /var/lib/garudachain-creator \
              /etc/garudaapi /var/log/garudaapi /var/cache/nginx/garuda
sudo chown -R garuda:garuda /var/lib/garudachain-* /var/log/garudaapi
sudo chown root:garuda /etc/garudaapi
sudo chmod 750 /etc/garudaapi

# 3. Binaries
sudo cp /path/to/repo/api/garudaapi /opt/garudachain/api/
sudo cp /path/to/repo/wallets/garudad /path/to/repo/wallets/garuda-cli /opt/garudachain/wallets/

# 4. Environment file (fill in secrets first!)
sudo cp garudaapi.env.example /etc/garudaapi/garudaapi.env
sudoedit /etc/garudaapi/garudaapi.env    # replace every REPLACE_* value
sudo chown root:garuda /etc/garudaapi/garudaapi.env
sudo chmod 600 /etc/garudaapi/garudaapi.env

# 5. bitcoin.conf for each node (must match GARUDA_RPC_PASS_*)
sudo -u garuda tee /var/lib/garudachain-cbdc/bitcoin.conf >/dev/null <<EOF
walletmode=cbdc
rpcuser=garudacbdc
rpcpassword=$(grep GARUDA_RPC_PASS_CBDC /etc/garudaapi/garudaapi.env | cut -d= -f2)
rpcbind=127.0.0.1
rpcallowip=127.0.0.1
rpcport=19443
server=1
daemon=1
EOF
sudo chmod 600 /var/lib/garudachain-cbdc/bitcoin.conf

# 6. systemd units
sudo cp garudad-cbdc.service garudaapi.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now garudad-cbdc garudaapi

# 7. nginx + TLS
sudo cp nginx-garudachain.conf /etc/nginx/sites-available/garudachain
sudo ln -sf ../sites-available/garudachain /etc/nginx/sites-enabled/
sudo certbot --nginx -d api.garudachain.org
sudo nginx -t && sudo systemctl reload nginx
```

## Verification

```bash
# Service up
systemctl status garudaapi garudad-cbdc
journalctl -u garudaapi -n 50 --no-pager

# No [SECURITY WARN] in the output — if there are, a secret is still default.
journalctl -u garudaapi --since '5 min ago' | grep -i 'SECURITY WARN'

# Health check via nginx (TLS)
curl -sS https://api.garudachain.org/api/healthz

# Admin endpoint should 401 without a key
curl -sS -o /dev/null -w '%{http_code}\n' -X POST \
  https://api.garudachain.org/api/dex/qris/confirm \
  -H 'Content-Type: application/json' -d '{"id":"x"}'

# Rate limit on admin (should hit 429 after a few bursts)
for i in $(seq 1 10); do
  curl -sS -o /dev/null -w '%{http_code} ' -X POST \
    https://api.garudachain.org/api/dex/qris/confirm \
    -H 'Content-Type: application/json' -d '{"id":"x","admin_key":"wrong"}'
done; echo
```

## Secret rotation

1. Edit `/etc/garudaapi/garudaapi.env`, replace the value(s).
2. If rotating RPC passwords, also edit the matching `bitcoin.conf` file
   and restart the affected node first: `systemctl restart garudad-cbdc`.
3. `systemctl restart garudaapi`.
4. Verify health + audit log for any `admin_auth fail` entries.

## Upgrade procedure

```bash
# Drop-in binary swap for garudaapi
sudo systemctl stop garudaapi
sudo cp /path/to/new/garudaapi /opt/garudachain/api/garudaapi.new
sudo mv /opt/garudachain/api/garudaapi /opt/garudachain/api/garudaapi.prev
sudo mv /opt/garudachain/api/garudaapi.new /opt/garudachain/api/garudaapi
sudo systemctl start garudaapi
# Watch logs for 60s; if regression, swap back:
#   sudo systemctl stop garudaapi && sudo mv garudaapi.prev garudaapi && systemctl start garudaapi

# Node binary swap (requires coordinated maintenance window —
# consensus changes should be tested on regtest first)
sudo systemctl stop garudad-cbdc
sudo cp /path/to/new/garudad /opt/garudachain/wallets/garudad
sudo systemctl start garudad-cbdc
sudo -u garuda /opt/garudachain/wallets/garuda-cli \
     -datadir=/var/lib/garudachain-cbdc getblockchaininfo
```

---

## DNS Seed Node Setup

GarudaChain nodes find each other via DNS seeds configured in `chainparams.cpp`:

```
mainnet:  seed.garudachain.org.   seed2.garudachain.org.
testnet:  testnet-seed.garudachain.org.
```

### Requirements

- A VPS with a **static public IP** and ports **6300/tcp** (P2P) and **53/udp+tcp** (DNS) open
- Domain control over `garudachain.org` to add NS glue records

### Step 1 — Add NS glue records at your registrar

```
# At your DNS registrar (e.g. Cloudflare, Namecheap):
seed.garudachain.org.  NS   ns1.garudachain.org.
ns1.garudachain.org.   A    <YOUR_SERVER_IP>
```

Repeat for `seed2.garudachain.org` → `ns2.garudachain.org` if running a second server.

### Step 2 — Deploy with Docker Compose

```bash
# On the seed server:
git clone https://github.com/garudachain/garudachain.git
cd garudachain/deploy/seed-node

cp .env.example .env
# Edit .env:
#   SEED_NODE_IP=<this server's public IP>
#   GARUDA_RPC_PASS=<openssl rand -hex 24>
#   SEEDER_HOST=seed.garudachain.org

# Create data directory
sudo mkdir -p /var/lib/garudachain/mainnet
sudo chown $USER /var/lib/garudachain/mainnet

docker-compose up -d
docker-compose logs -f
```

### Step 3 — Verify DNS is working

```bash
# From another machine (allow 24-48h for DNS propagation):
dig seed.garudachain.org A
nslookup seed.garudachain.org <YOUR_SERVER_IP>

# Check seeder status:
curl http://<YOUR_SERVER_IP>:8080/
curl http://<YOUR_SERVER_IP>:8080/nodes
```

### Step 4 — Update chainparams bootstrap IPs (optional)

Once the seed node has been running for a few days and has a list of live
peers, you can optionally hardcode a few IPs in `node/src/chainparamsseeds.h`
as additional bootstrap nodes. Format:

```cpp
// chainparamsseeds.h — add known good mainnet IPs
static const uint8_t chainparams_seed_main[] = {
    // IPv4: encode as 4 bytes big-endian + 2 bytes port big-endian
    // e.g. 1.2.3.4:6300 → 0x01, 0x02, 0x03, 0x04, 0x18, 0x9c
};
```

### Monitoring

The `garuda-seeder` exposes an HTTP status API on port 8080:

| Endpoint | Description |
|----------|-------------|
| `GET /` | JSON: good node count + timestamp |
| `GET /nodes` | JSON: list of all good node IPs |
| `GET /healthz` | 200 OK if ≥1 good node, 503 otherwise |

Set up an uptime monitor (UptimeRobot, Grafana, etc.) on `/healthz` to alert
if the seeder goes down.
