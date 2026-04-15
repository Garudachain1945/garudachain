# Contributing to GarudaChain

Thank you for your interest in contributing. This document explains the
contribution process and coding standards for the GarudaChain project.

---

## Table of Contents

1. [Code of Conduct](#code-of-conduct)
2. [Getting Started](#getting-started)
3. [How to Contribute](#how-to-contribute)
4. [Pull Request Process](#pull-request-process)
5. [Coding Standards](#coding-standards)
6. [Security Issues](#security-issues)
7. [License](#license)

---

## Code of Conduct

GarudaChain is an open-source project serving Indonesia's financial
infrastructure. Contributors must:

- Be respectful and constructive in all communication
- Prioritize correctness and security over speed
- Never introduce backdoors, vulnerabilities, or malicious code
- Disclose security issues privately (see [Security Issues](#security-issues))

---

## Getting Started

### Prerequisites

- Go 1.22+ (for the API server)
- C++17 compiler + autotools (for the node)
- liboqs (for ML-DSA-87 post-quantum support)
- Docker (optional, for CI environment)

### Fork and clone

```bash
git clone https://github.com/garudachain/garudachain.git
cd garudachain
```

### Build

```bash
# Node
cd node && ./autogen.sh && ./configure --with-liboqs && make -j$(nproc)

# API server
cd api && go build ./...

# Run API tests
cd api && go test -count=1 -race -timeout 120s ./...
```

---

## How to Contribute

### Bug reports

Open a GitHub Issue using the **Bug Report** template. Include:

- GarudaChain version / commit hash
- Operating system and Go/GCC version
- Steps to reproduce
- Expected vs. actual behaviour
- Relevant logs (sanitise any secrets before posting)

### Feature requests

Open a GitHub Issue using the **Feature Request** template. Explain:

- The problem you are solving
- Why it belongs in GarudaChain core (vs. a separate tool)
- Any consensus or security implications

### Code contributions

1. Open an issue first for non-trivial changes so the approach can be discussed
   before you invest time writing code.
2. Fork the repository and create a branch: `git checkout -b feature/my-feature`
3. Write tests before or alongside your code.
4. Ensure all existing tests pass: `go test -count=1 -race -timeout 120s ./...`
5. Open a Pull Request against `main`.

---

## Pull Request Process

1. **One logical change per PR.** Split unrelated fixes into separate PRs.
2. **Tests are required.** New functionality must include unit tests. Bug fixes
   should include a regression test.
3. **No secrets in code.** Keys, passwords, and credentials must never appear
   in source files. Use environment variables or the key provider abstraction
   in `api/key_provider.go`.
4. **Pass CI.** All checks must be green before review begins.
5. **Changelog.** Update `SECURITY.md` if your change affects the security
   posture (new endpoints, auth changes, crypto changes).
6. **Two approvals** are required from maintainers before merging.

### Commit messages

```
<type>(<scope>): <short description>

<body — why, not what>
```

Types: `feat`, `fix`, `docs`, `test`, `refactor`, `chore`
Scope: `node`, `api`, `indexer`, `website`, `mobile`, `deploy`

Example:

```
fix(api): reject negative CBDC amounts before RPC call

Negative amounts passed through to the node produced an ambiguous
"invalid amount" error rather than a clear HTTP 400 with context.
```

---

## Coding Standards

### Go (API server)

- Follow standard Go idioms (`go vet`, `staticcheck`)
- No global mutable state without a mutex
- Validate all inputs at system boundaries (HTTP handlers)
- Use `writeJSONErrStatus` for all error responses — never write raw JSON
- Admin endpoints must call `requireAdmin` or `requireAdminDiagnostic`
- New audit-logged operations must call `appendAuditEvent`
- New metrics must be registered in `handleMetrics()`

### C++ (node)

- Follow Bitcoin Core coding style (clang-format, C++17)
- Consensus-critical changes require a BIP-style rationale comment
- New RPC commands must include `RPCHelpMan` documentation
- ML-DSA-87 changes must reference the FIPS 204 specification section

### Tests

- API: table-driven tests using `net/http/httptest` — no live network calls
- Node: follow Bitcoin Core's `src/test/` and `test/functional/` conventions
- Test helper functions are prefixed `new...ForTest` or `Reset...ForTest`
- Tests must not rely on timing (no `time.Sleep` in test logic)

---

## Security Issues

**Do not open a public GitHub Issue for security vulnerabilities.**

Report privately to: security@garudachain.id

Include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Any suggested mitigations

You will receive a response within 48 hours. We follow responsible disclosure:
vulnerabilities are patched before public disclosure. See [SECURITY.md](SECURITY.md)
for the full security policy.

---

## License

By contributing to GarudaChain you agree that your contributions will be
licensed under the [MIT License](node/COPYING).

Copyright (c) 2026 GarudaChain developers
