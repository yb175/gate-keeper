---
name: error-handling
description: Guidelines for robust, structured, and secure error handling across the gateway and endpoints, preventing HTTP status mismatches and information leaks.
license: Complete terms in LICENSE.txt
---

# Error Handling

This skill establishes the standards for error handling across the Gatekeeper codebase. By using structured error types and strict validation guards, we prevent security vulnerabilities (such as Information Leakage) and routing bugs (such as HTTP status code mismatches).

## Core Principles

### 1. Never Match Error Messages Against Substrings

- **Vulnerable**: Matching `errMsg.includes("Tool not found")` can be broken if a user inputs that substring inside parameters (such as `toolName` or `decision`).
- **Secure**: Use typed and structured error classes that carry meta-properties (e.g. `statusCode`) and check their types or properties directly.

### 2. Use Structured Error Classes

- Throw instances of `AppError` for expected client validation, parameter mismatches, or policy rejections:
  - `400 Bad Request` for parameter validation (e.g. missing inputs, invalid types).
  - `403 Forbidden` for policy decision rejections (e.g. non-ALLOW decisions).
  - `404 Not Found` for missing resources (e.g. unregistered tools).
- Use standard `Error` classes for internal system failures.

### 3. Prevent Information Leakage (CWE-209)

- Do not return detailed internal exceptions, database stack traces, or process errors directly in response bodies for HTTP `500` status codes.
- Mask unexpected errors with a generic message: `"Failed to execute tool"`.

### 4. Input Sanitization

- Enforce strict bounds validation (e.g. ranges for timers/timeouts) and apply comparisons against hardcoded constant boundaries rather than trusting client parameters.
- Verify types and coerce inputs safely before doing logic checks.
