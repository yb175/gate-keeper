---
name: testing-strategy
description: Guidelines for proposing, creating, and covering code changes with high-quality, robust, and deterministic tests.
license: Complete terms in LICENSE.txt
---

# Testing Strategy Guidelines

Whenever implementing or updating functionality, always propose and construct comprehensive test suites.

## Test Coverage Requirements

Every test suite should cover the following areas where applicable:

1. **Happy Path**: Successful executions with normal inputs.
2. **Invalid Inputs**: Malformed, empty, or unexpected input payloads.
3. **Dependency Failures**: Simulated third-party or subprocess crashes.
4. **Concurrency**: Simultaneous requests, race conditions, or lockouts.
5. **Timeouts**: Simulating slow requests or request expiration.
6. **Security Regressions**: Validating access bounds, validation checks, and injection vectors.
7. **Edge Cases**: Empty lists, boundaries, and bootstrap/zero-state settings.

## Test Design Principles

- **Prefer Determinism**: Tests should be stable and have consistent, reproducible outcomes. Avoid state leakages between test runs.
- **Integration Tests**: Avoid excessive mocking when real integration tests are practical and stable (e.g. database transactions, physical file system writes).
