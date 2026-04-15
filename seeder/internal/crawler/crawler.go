// Package crawler implements a GarudaChain network crawler.
// It connects to known nodes via the Bitcoin P2P protocol, performs the
// version handshake, and collects peer addresses via getaddr.
// Nodes that respond are stored as "good" and served by the DNS layer.
package crawler

import (
	"crypto/sha256"
	"encoding/binary"
	"fmt"
	"log"
	"math/rand"
	"net"
	"sync"
	"time"
)

const (
	MainnetMagic = "\x47\x52\x44\x4d" // GRDM
	TestnetMagic = "\x47\x52\x44\x54" // GRDT

	MainnetPort     = 6300
	TestnetPort     = 16300
	ProtocolVersion = 70015

	dialTimeout   = 5 * time.Second
	crawlInterval = 10 * time.Minute
	nodeExpiry    = 3 * time.Hour
	maxConcurrent = 64
)

// Node represents a peer on the network.
type Node struct {
	Addr      string
	Port      uint16
	LastSeen  time.Time
	Good      bool
	UserAgent string
}

// Crawler crawls the GarudaChain P2P network and maintains live node list.
type Crawler struct {
	magic  string
	mu     sync.RWMutex
	nodes  map[string]*Node
	seeds  []string
	stopCh chan struct{}
}

// New creates a Crawler seeded with bootstrap addresses (host:port).
func New(magic string, seeds []string) *Crawler {
	c := &Crawler{
		magic:  magic,
		nodes:  make(map[string]*Node),
		seeds:  seeds,
		stopCh: make(chan struct{}),
	}
	defaultPort := uint16(MainnetPort)
	if magic == TestnetMagic {
		defaultPort = TestnetPort
	}
	for _, s := range seeds {
		host, portStr, err := net.SplitHostPort(s)
		if err != nil {
			// No port in string — use default
			host = s
		}
		port := defaultPort
		if portStr != "" {
			var p int
			fmt.Sscanf(portStr, "%d", &p)
			port = uint16(p)
		}
		key := net.JoinHostPort(host, fmt.Sprintf("%d", port))
		c.nodes[key] = &Node{Addr: host, Port: port}
	}
	return c
}

// Start begins background crawling.
func (c *Crawler) Start() { go c.loop() }

// Stop halts the crawler.
func (c *Crawler) Stop() { close(c.stopCh) }

// GoodNodes returns IPs of nodes seen within nodeExpiry that passed handshake.
func (c *Crawler) GoodNodes() []net.IP {
	c.mu.RLock()
	defer c.mu.RUnlock()
	cutoff := time.Now().Add(-nodeExpiry)
	var out []net.IP
	for _, n := range c.nodes {
		if n.Good && n.LastSeen.After(cutoff) {
			if ip := net.ParseIP(n.Addr); ip != nil {
				out = append(out, ip)
			}
		}
	}
	return out
}

// GoodNodeCount returns the number of currently live nodes.
func (c *Crawler) GoodNodeCount() int { return len(c.GoodNodes()) }

func (c *Crawler) loop() {
	c.crawlAll()
	ticker := time.NewTicker(crawlInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ticker.C:
			c.crawlAll()
		case <-c.stopCh:
			return
		}
	}
}

func (c *Crawler) crawlAll() {
	c.mu.RLock()
	targets := make([]*Node, 0, len(c.nodes))
	for _, n := range c.nodes {
		targets = append(targets, n)
	}
	c.mu.RUnlock()

	rand.Shuffle(len(targets), func(i, j int) { targets[i], targets[j] = targets[j], targets[i] })

	sem := make(chan struct{}, maxConcurrent)
	var wg sync.WaitGroup
	for _, n := range targets {
		wg.Add(1)
		sem <- struct{}{}
		go func(node *Node) {
			defer wg.Done()
			defer func() { <-sem }()
			c.probe(node)
		}(n)
	}
	wg.Wait()
	log.Printf("[crawler] done: %d good / %d total", c.GoodNodeCount(), len(targets))
}

func (c *Crawler) probe(n *Node) {
	addr := net.JoinHostPort(n.Addr, fmt.Sprintf("%d", n.Port))
	conn, err := net.DialTimeout("tcp", addr, dialTimeout)
	if err != nil {
		c.markBad(n)
		return
	}
	defer conn.Close()
	conn.SetDeadline(time.Now().Add(15 * time.Second))

	if err := c.sendVersion(conn); err != nil {
		c.markBad(n)
		return
	}
	ua, err := c.recvVersion(conn)
	if err != nil {
		c.markBad(n)
		return
	}
	c.sendVerack(conn)

	c.mu.Lock()
	n.Good = true
	n.LastSeen = time.Now()
	n.UserAgent = ua
	c.mu.Unlock()

	peers := c.getaddr(conn)
	c.addPeers(peers)
}

func (c *Crawler) markBad(n *Node) {
	c.mu.Lock()
	n.Good = false
	c.mu.Unlock()
}

func (c *Crawler) addPeers(peers []peerAddr) {
	c.mu.Lock()
	defer c.mu.Unlock()
	for _, p := range peers {
		key := net.JoinHostPort(p.IP, fmt.Sprintf("%d", p.Port))
		if _, ok := c.nodes[key]; !ok {
			c.nodes[key] = &Node{Addr: p.IP, Port: p.Port}
		}
	}
}

// ── P2P wire format ───────────────────────────────────────────────────────

type peerAddr struct{ IP string; Port uint16 }

func sha256d(data []byte) []byte {
	h1 := sha256.Sum256(data)
	h2 := sha256.Sum256(h1[:])
	return h2[:]
}

func buildMsg(magic, command string, payload []byte) []byte {
	msg := make([]byte, 0, 24+len(payload))
	msg = append(msg, []byte(magic)...)
	cmd := [12]byte{}
	copy(cmd[:], command)
	msg = append(msg, cmd[:]...)
	length := make([]byte, 4)
	binary.LittleEndian.PutUint32(length, uint32(len(payload)))
	msg = append(msg, length...)
	cs := sha256d(payload)
	msg = append(msg, cs[:4]...)
	msg = append(msg, payload...)
	return msg
}

func (c *Crawler) sendVersion(conn net.Conn) error {
	var buf [86]byte
	binary.LittleEndian.PutUint32(buf[0:], ProtocolVersion)
	// services = 0, timestamp
	binary.LittleEndian.PutUint64(buf[12:], uint64(time.Now().Unix()))
	// recv addr (26 bytes), from addr (26 bytes) — zeroed
	nonce := rand.Uint64()
	binary.LittleEndian.PutUint64(buf[72:], nonce)
	ua := []byte("/garuda-seeder:1.0/")
	payload := append(buf[:80], byte(len(ua)))
	payload = append(payload, ua...)
	payload = append(payload, 0, 0, 0, 0) // start height
	payload = append(payload, 1)           // relay
	_, err := conn.Write(buildMsg(c.magic, "version", payload))
	return err
}

func (c *Crawler) recvVersion(conn net.Conn) (string, error) {
	hdr, err := readFull(conn, 24)
	if err != nil {
		return "", err
	}
	if string(hdr[0:4]) != c.magic {
		return "", fmt.Errorf("magic mismatch")
	}
	cmd := string(hdr[4:16])
	_ = cmd
	length := binary.LittleEndian.Uint32(hdr[16:20])
	if length > 2048 {
		return "", fmt.Errorf("version too long")
	}
	payload, err := readFull(conn, int(length))
	if err != nil {
		return "", err
	}
	if len(payload) > 81 {
		uaLen := int(payload[80])
		if 81+uaLen <= len(payload) {
			return string(payload[81 : 81+uaLen]), nil
		}
	}
	return "/unknown/", nil
}

func (c *Crawler) sendVerack(conn net.Conn) {
	conn.Write(buildMsg(c.magic, "verack", nil))
}

func (c *Crawler) getaddr(conn net.Conn) []peerAddr {
	conn.Write(buildMsg(c.magic, "getaddr", nil))
	conn.SetDeadline(time.Now().Add(6 * time.Second))
	hdr, err := readFull(conn, 24)
	if err != nil {
		return nil
	}
	length := binary.LittleEndian.Uint32(hdr[16:20])
	if length > 512*1024 {
		return nil
	}
	payload, err := readFull(conn, int(length))
	if err != nil {
		return nil
	}
	return parseAddr(payload)
}

func parseAddr(payload []byte) []peerAddr {
	if len(payload) < 1 {
		return nil
	}
	count := int(payload[0])
	pos := 1
	var peers []peerAddr
	// Each entry: 4 (time) + 8 (services) + 16 (IP) + 2 (port) = 30 bytes
	for i := 0; i < count && pos+30 <= len(payload); i++ {
		ipBytes := payload[pos+12 : pos+28]
		port := binary.BigEndian.Uint16(payload[pos+28 : pos+30])
		ip := net.IP(ipBytes)
		if ip4 := ip.To4(); ip4 != nil {
			peers = append(peers, peerAddr{ip4.String(), port})
		} else {
			peers = append(peers, peerAddr{ip.String(), port})
		}
		pos += 30
	}
	return peers
}

func readFull(conn net.Conn, n int) ([]byte, error) {
	buf := make([]byte, n)
	pos := 0
	for pos < n {
		read, err := conn.Read(buf[pos:])
		pos += read
		if err != nil {
			return buf[:pos], err
		}
	}
	return buf, nil
}
