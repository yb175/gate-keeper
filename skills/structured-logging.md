---
name: structured-logging
description: Guidelines for producing consistent structured logs rather than raw console outputs, including mandatory fields.
license: Complete terms in LICENSE.txt
---

# Structured Logging

When logging inside the codebase, always avoid using raw `console.log` statements. Prefer structured log calls using a logger instance with appropriate severity levels.

## Logging Guidelines

- **Methods**: Use `logger.info()`, `logger.warn()`, and `logger.error()`.
- **Avoid**: Never use raw `console.log()` statements.

## Required Metadata Fields

Ensure your log statements pass an object containing at least the following structured fields:
- `tool_name`: The name of the MCP tool executing (if applicable).
- `decision`: The policy decision (e.g. `ALLOW`, `DENY`, `APPROVAL`, etc.).
- `conversation_id`: The ID of the current conversation.
- `duration_ms`: Execution time in milliseconds.
- `error_message`: The text of any thrown error or warning.
