## Summary

<!-- 1-3 bullets describing what this PR changes and why -->

-
-

## Related Issue

Closes #<!-- issue number -->

## Component

- [ ] Node (consensus / RPC)
- [ ] API server
- [ ] Indexer
- [ ] Website / Explorer
- [ ] Mobile wallet
- [ ] Browser extension
- [ ] Docs / Config
- [ ] CI / Deploy

## Type of Change

- [ ] Bug fix
- [ ] New feature
- [ ] Refactor (no functional change)
- [ ] Test
- [ ] Docs

## Test Plan

- [ ] Unit tests added / updated
- [ ] All existing tests pass (`go test -count=1 -race -timeout 120s ./...`)
- [ ] Manual testing steps described below

<!-- Describe manual steps if applicable -->

## Security Checklist

- [ ] No secrets, keys, or passwords in code
- [ ] Input validated at HTTP boundary
- [ ] Admin endpoints use `requireAdmin` or `requireAdminDiagnostic`
- [ ] Audit events logged for state-changing operations
- [ ] `SECURITY.md` updated if security posture changed

## Consensus Impact

- [ ] This PR changes consensus rules (requires network-wide upgrade coordination)
- [ ] No consensus impact
