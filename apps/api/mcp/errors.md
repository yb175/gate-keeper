# Error Handling in the MCP Client Gateway

This document explains the architecture and implementation of error handling, status code propagation, and security mitigations in the Gatekeeper MCP gateway.

## Structured AppError Model

The gateway implements a custom error class, `AppError` (defined in [types.ts](../types.ts)), which extends the native `Error` class and introduces a `statusCode` field.

This model enables:

1. **Decoupled Error Classification**: The core logic (e.g., input validation, tool execution, and registry lookup) determines the semantic meaning of a failure and assigns the appropriate HTTP status code at the throw site.
2. **Safe Route Mapping**: The Express routing layer does not parse message strings or substrings. Instead, it inspects whether the caught error is an instance of `AppError` and maps it directly using `error.statusCode`.

### Status Code Mapping Table

| Error Scenario                   | HTTP Status Code          | Thrown From                  | Exception Class  |
| -------------------------------- | ------------------------- | ---------------------------- | ---------------- |
| Invalid toolName type            | 400 Bad Request           | `ToolExecutor.execute`       | `AppError`       |
| Empty toolName value             | 400 Bad Request           | `ToolExecutor.execute`       | `AppError`       |
| Policy decision is not ALLOW     | 403 Forbidden             | `ToolExecutor.execute`       | `AppError`       |
| Requested tool is not registered | 404 Not Found             | `ToolExecutor.execute`       | `AppError`       |
| Internal service crash / timeout | 500 Internal Server Error | Subprocess spawn / transport | Standard `Error` |

---

## Security Mitigations

### 1. Substring Collision Prevention

Using `instanceof AppError` and `error.statusCode` prevents routing bugs where user-supplied parameters (like a tool name consisting of the substring `"must be a"` or a decision value containing `"Tool not found"`) would accidentally match Express error handling filters.

### 2. Information Leakage Prevention (CWE-209)

Any exception that is not a subclass of `AppError` (such as a database connection pool timeout, subprocess exit code error, or network failure) is treated as an internal error. The Express route handler intercepts these, logs the raw error to `stderr` for internal auditing, and returns a generic response payload to the client:

```json
{
  "error": "Failed to execute tool"
}
```

This masks server internals and prevents stack trace details from leaking to external clients.

### 3. Execution Timeout and Resource Cleanups

If a tool execution takes longer than the configured timeout, the request is aborted using `Promise.race()` and a standard Timeout `Error` is thrown, which naturally maps to a `500` response. The pending timer is cleaned up in a `finally` block to prevent timer leakages.
