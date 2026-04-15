// Package dns implements a simple authoritative DNS server that answers
// A/AAAA queries for seed hostnames by returning live GarudaChain node IPs
// collected by the crawler.
package dns

import (
	"fmt"
	"log"
	"net"
	"strings"
	"sync"
)

const (
	maxAnswers = 25 // max IPs per DNS response (keep UDP under 512 bytes)
)

// NodeSource provides live node IPs to serve via DNS.
type NodeSource interface {
	GoodNodes() []net.IP
}

// Server is a minimal UDP DNS server (RFC 1035).
type Server struct {
	addr   string // bind address e.g. "0.0.0.0:53"
	host   string // the hostname to answer, e.g. "seed.garudachain.org."
	source NodeSource

	mu     sync.Mutex
	conn   *net.UDPConn
}

// New creates a DNS server that serves A records for host from source.
// addr is "ip:port" to listen on (typically ":53").
func New(addr, host string, source NodeSource) *Server {
	if !strings.HasSuffix(host, ".") {
		host += "."
	}
	return &Server{addr: addr, host: strings.ToLower(host), source: source}
}

// Serve starts the DNS server (blocks until error or Stop).
func (s *Server) Serve() error {
	udpAddr, err := net.ResolveUDPAddr("udp", s.addr)
	if err != nil {
		return fmt.Errorf("resolve %s: %w", s.addr, err)
	}
	conn, err := net.ListenUDP("udp", udpAddr)
	if err != nil {
		return fmt.Errorf("listen %s: %w", s.addr, err)
	}
	s.mu.Lock()
	s.conn = conn
	s.mu.Unlock()

	log.Printf("[dns] listening on %s, serving %s", s.addr, s.host)
	buf := make([]byte, 512)
	for {
		n, remote, err := conn.ReadFromUDP(buf)
		if err != nil {
			return err
		}
		pkt := make([]byte, n)
		copy(pkt, buf[:n])
		go s.handle(conn, remote, pkt)
	}
}

// Stop closes the server listener.
func (s *Server) Stop() {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.conn != nil {
		s.conn.Close()
	}
}

func (s *Server) handle(conn *net.UDPConn, remote *net.UDPAddr, pkt []byte) {
	if len(pkt) < 12 {
		return
	}
	txid := pkt[0:2]
	// Flags: QR=1 (response), AA=1, RD copy from query
	rdBit := pkt[2] & 0x01
	flags := []byte{0x84 | rdBit, 0x00} // QR+AA, RCODE=0
	qdcount := []byte{pkt[4], pkt[5]}

	// Parse question section
	qname, qtype, qclass, qEnd := parseQuestion(pkt[12:])
	if qEnd < 0 {
		return // malformed
	}
	_ = qclass

	fqdn := strings.ToLower(qname)
	if !strings.HasSuffix(fqdn, ".") {
		fqdn += "."
	}

	// Only answer our own hostname
	if fqdn != s.host {
		// NXDOMAIN
		resp := buildResponse(txid, []byte{0x84 | rdBit, 0x03}, qdcount,
			pkt[12:12+qEnd], nil)
		conn.WriteToUDP(resp, remote)
		return
	}

	nodes := s.source.GoodNodes()
	var answers [][]byte
	added := 0
	for _, ip := range nodes {
		if added >= maxAnswers {
			break
		}
		if qtype == 1 { // A record
			if ip4 := ip.To4(); ip4 != nil {
				answers = append(answers, buildA(qname, ip4, 30))
				added++
			}
		} else if qtype == 28 { // AAAA record
			if ip6 := ip.To16(); ip6 != nil && ip.To4() == nil {
				answers = append(answers, buildAAAA(qname, ip6, 30))
				added++
			}
		} else if qtype == 255 { // ANY — return A records
			if ip4 := ip.To4(); ip4 != nil {
				answers = append(answers, buildA(qname, ip4, 30))
				added++
			}
		}
	}

	resp := buildResponse(txid, flags, qdcount, pkt[12:12+qEnd], answers)
	conn.WriteToUDP(resp, remote)
	log.Printf("[dns] %s → %s qtype=%d answers=%d", remote, fqdn, qtype, len(answers))
}

// ── DNS wire format helpers ───────────────────────────────────────────────

func parseQuestion(data []byte) (name string, qtype, qclass uint16, end int) {
	pos := 0
	var parts []string
	for pos < len(data) {
		l := int(data[pos])
		if l == 0 {
			pos++
			break
		}
		if pos+1+l > len(data) {
			return "", 0, 0, -1
		}
		parts = append(parts, string(data[pos+1:pos+1+l]))
		pos += 1 + l
	}
	if pos+4 > len(data) {
		return "", 0, 0, -1
	}
	name = strings.Join(parts, ".") + "."
	qtype = uint16(data[pos])<<8 | uint16(data[pos+1])
	qclass = uint16(data[pos+2])<<8 | uint16(data[pos+3])
	return name, qtype, qclass, pos + 4
}

func encodeName(name string) []byte {
	var out []byte
	parts := strings.Split(strings.TrimSuffix(name, "."), ".")
	for _, p := range parts {
		out = append(out, byte(len(p)))
		out = append(out, []byte(p)...)
	}
	out = append(out, 0)
	return out
}

func buildA(name string, ip net.IP, ttl uint32) []byte {
	rdata := []byte(ip.To4())
	return buildRR(name, 1, ttl, rdata)
}

func buildAAAA(name string, ip net.IP, ttl uint32) []byte {
	rdata := []byte(ip.To16())
	return buildRR(name, 28, ttl, rdata)
}

func buildRR(name string, rtype, ttl uint32, rdata []byte) []byte {
	var rr []byte
	rr = append(rr, encodeName(name)...)
	rr = append(rr, byte(rtype>>8), byte(rtype))    // TYPE
	rr = append(rr, 0, 1)                            // CLASS IN
	rr = append(rr, byte(ttl>>24), byte(ttl>>16), byte(ttl>>8), byte(ttl)) // TTL
	rr = append(rr, byte(len(rdata)>>8), byte(len(rdata)))                 // RDLENGTH
	rr = append(rr, rdata...)
	return rr
}

func buildResponse(txid, flags, qdcount, question []byte, answers [][]byte) []byte {
	ancount := len(answers)
	hdr := []byte{
		txid[0], txid[1],
		flags[0], flags[1],
		qdcount[0], qdcount[1],
		byte(ancount >> 8), byte(ancount), // ANCOUNT
		0, 0, // NSCOUNT
		0, 0, // ARCOUNT
	}
	resp := append(hdr, question...)
	for _, a := range answers {
		resp = append(resp, a...)
	}
	return resp
}
