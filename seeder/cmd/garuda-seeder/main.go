// garuda-seeder — GarudaChain DNS seed server
//
// Crawls the GarudaChain P2P network and serves live node IPs via DNS A/AAAA
// records. Used to populate the DNS seeds configured in chainparams.cpp:
//
//	seed.garudachain.id.   → mainnet nodes
//	seed2.garudachain.id.  → mainnet nodes (second nameserver)
//	testnet-seed.garudachain.id. → testnet nodes
//
// # Usage
//
//	garuda-seeder [flags]
//
// # Environment variables
//
//	SEEDER_HOST        Hostname to serve, e.g. seed.garudachain.id (required)
//	SEEDER_BIND        DNS bind address (default :53)
//	SEEDER_HTTP        HTTP status/metrics bind address (default :8080)
//	SEEDER_NETWORK     mainnet or testnet (default mainnet)
//	SEEDER_BOOTSTRAP   Comma-separated bootstrap peers, e.g. node1.example.com:6300
//
// # Deployment
//
// The seed server must be the authoritative NS for the seed hostname.
// Add these DNS records at your registrar:
//
//	seed.garudachain.id.  NS  ns1.garudachain.id.
//	ns1.garudachain.id.   A   <this server's IP>
//
// Run with CAP_NET_BIND_SERVICE or as root to bind port 53.
// In production use the systemd unit in deploy/seed-node/.
package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"garuda-seeder/internal/crawler"
	"garuda-seeder/internal/dns"
)

func main() {
	host       := flag.String("host",      envOr("SEEDER_HOST", ""),                     "Hostname to serve (e.g. seed.garudachain.id)")
	bind       := flag.String("bind",      envOr("SEEDER_BIND", ":53"),                  "DNS bind address")
	httpBind   := flag.String("http",      envOr("SEEDER_HTTP", ":8080"),                "HTTP status bind address")
	network    := flag.String("network",   envOr("SEEDER_NETWORK", "mainnet"),           "mainnet or testnet")
	bootstrap  := flag.String("bootstrap", envOr("SEEDER_BOOTSTRAP", ""),               "Comma-separated bootstrap peers")
	flag.Parse()

	if *host == "" {
		log.Fatal("SEEDER_HOST must be set (e.g. seed.garudachain.id)")
	}

	// Select network
	magic := crawler.MainnetMagic
	if *network == "testnet" {
		magic = crawler.TestnetMagic
	}

	// Bootstrap peers
	seeds := defaultSeeds(*network)
	if *bootstrap != "" {
		for _, s := range strings.Split(*bootstrap, ",") {
			s = strings.TrimSpace(s)
			if s != "" {
				seeds = append(seeds, s)
			}
		}
	}

	log.Printf("[main] network=%s host=%s dns=%s http=%s seeds=%v",
		*network, *host, *bind, *httpBind, seeds)

	// Start crawler
	c := crawler.New(magic, seeds)
	c.Start()

	// Start HTTP status server
	go serveHTTP(*httpBind, c)

	// Start DNS server
	srv := dns.New(*bind, *host, c)
	log.Printf("[main] garuda-seeder started for %s", *host)
	if err := srv.Serve(); err != nil {
		log.Fatalf("[main] DNS server error: %v", err)
	}
}

// defaultSeeds returns hardcoded bootstrap nodes for initial crawl.
// These should be long-running, well-connected GarudaChain nodes.
func defaultSeeds(network string) []string {
	if network == "testnet" {
		return []string{
			// Add testnet bootstrap nodes here after launch
		}
	}
	// Mainnet bootstrap nodes (add IPs after launch)
	return []string{
		// "node1.garudachain.id:6300",
		// "node2.garudachain.id:6300",
	}
}

// serveHTTP provides a simple status API for monitoring.
func serveHTTP(addr string, c *crawler.Crawler) {
	mux := http.NewServeMux()

	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		nodes := c.GoodNodes()
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"status":     "ok",
			"good_nodes": len(nodes),
			"time":       time.Now().UTC().Format(time.RFC3339),
		})
	})

	mux.HandleFunc("/nodes", func(w http.ResponseWriter, r *http.Request) {
		nodes := c.GoodNodes()
		ips := make([]string, len(nodes))
		for i, ip := range nodes {
			ips[i] = ip.String()
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"count": len(ips),
			"nodes": ips,
		})
	})

	mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		count := c.GoodNodeCount()
		if count == 0 {
			w.WriteHeader(http.StatusServiceUnavailable)
			fmt.Fprintln(w, "no good nodes")
			return
		}
		fmt.Fprintf(w, "ok — %d nodes\n", count)
	})

	log.Printf("[http] status server on %s", addr)
	http.ListenAndServe(addr, mux)
}

func envOr(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
