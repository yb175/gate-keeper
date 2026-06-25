# Gatekeeper: Agent and API orchestration

Gatekeeper is a control layer that sits between your LLM agent, your security rules, and external Model Context Protocol (MCP) servers. It intercepts tool calls and checks them against safety rules before executing any code.

---

### The architecture

When an agent requests a tool execution (either a single tool or multiple parallel tools), the request flows through these components before reaching the target MCP server:

```text
Client request
  │
  ▼
Express API (/agent/run)
  │
  ├── memory.ts (tracks chat history and active approval IDs as read-only data)
  ├── llm.ts (handles system prompts, routes to fallback models, and validates input schemas)
  ▼
Orchestration loop (loop.ts)
  │
  ├── Parses either single 'tool_call' or parallel 'tool_calls'
  ▼
Policy engine (rules/*.ts) ──► Decision engine (decision.ts)
                                  │
                                  ├── Intercepts parallel steps as 'multiple_tool_calls'
                                  ├── Checks each individual tool policy
                                  ▼
                            MCP executor (bootstrap.ts)
                                  │
                                  ├── Runs allowed tools in parallel (Promise.all)
                                  ▼
                            MCP registry ──► External MCP servers
```

### Key files and their jobs

- **[memory.ts](file:///home/yb175/projects/gate-keeper/apps/api/src/agent/memory.ts)**: Tracks the active chat history, tool execution results, and approval identifiers. It exposes these collections as read-only arrays to protect against accidental session corruption.
- **[llm.ts](file:///home/yb175/projects/gate-keeper/apps/api/src/agent/llm.ts)**: Validates input schemas, builds system prompts, and handles connection details with the language model. Automatically handles fallback routing (Gemini primary -> Grok/Groq fallback) and request timeouts.
- **[loop.ts](file:///home/yb175/projects/gate-keeper/apps/api/src/agent/loop.ts)**: Runs the main orchestration loop. It manages token budgets, handles parallel tool execution triggers using `Promise.all`, checks approvals, and enforces a hard limit of 30 steps.

---

## Rules and boundaries

The policy engine evaluates your tool calls against rules stored in the database. It runs through three validation steps sequentially to determine whether to execute, pause, or block the request:

```text
Policy evaluation
  │
  ▼
Check if blocked (isBlocked) ────[Blocked]────► Deny
  │
  ▼ [Allowed]
Check if path is within sandbox (withinSandboxPath) ────[Escaped]────► Deny
  │
  ▼ [Safe]
Check if budget exceeded (budgetExceeded) ────[Exceeded]────► Deny
  │
  ▼ [Under Budget]
Check if approval required (needsApproval)
  │
  ├───[Requires Review]───► Requires human approval
  │
  └───[Safe / Allowed]────► Allow
```

- **Independent guardrails**: We separate static security checks from orchestrator and execution code in [engine.ts](file:///home/yb175/projects/gate-keeper/apps/api/src/policy/engine.ts). This makes safety rules easier to audit and update.
- **Race condition prevention**: We query policy rules from the database once per step. If someone edits a rule during execution, the system applies the change immediately, preventing state conflicts.
- **Strict precedence**: Safety limits always take priority. A `DENY` rule overrides both `APPROVAL` and `ALLOW` states.
- **Fail-closed default**: If a tool does not have a rule configured, the engine defaults to requiring human review before running the tool.

---

## Sandbox path enforcement

Each policy record has an optional `sandbox_path` field. When set, the **path rule** ([`pathRule.ts`](file:///home/yb175/projects/gate-keeper/apps/api/src/policy/rules/pathRule.ts)) validates every string-valued argument in the tool call before it reaches the MCP server.

### How it works

```text
Tool call arguments
  │
  ▼
For each string argument:
  Resolve path relative to sandbox_path root
    │
    ├── Syntactic traversal check (path.relative starts with "..")
    │       └── Deny immediately
    │
    ├── Absolute path that escapes root (path.isAbsolute)
    │       └── Deny immediately
    │
    └── Symlink traversal check (getRealAncestor check)
            └── Deny if real ancestor lands outside sandbox root
  │
  ▼
All arguments safe → proceed to budget check
```

### Edge cases handled

| Scenario                                                                 | Behaviour                                                                |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| No `sandbox_path` on policy                                              | Rule is skipped — no restriction                                         |
| Tool has no string arguments (e.g. `list_files`)                         | Rule is skipped — nothing to check                                       |
| Path prefixed with the sandbox directory name (`sandbox/file.txt`)       | Prefix is stripped before resolving, same as the file-manager-mcp itself |
| Relative traversal (`../../etc/passwd`)                                  | Caught by `path.relative` starting with `..`                             |
| Absolute path outside root (`/etc/passwd`)                               | Caught by `path.isAbsolute(relative)`                                    |
| Symlink inside sandbox pointing outside                                  | Caught by resolving the real ancestor and re-checking                    |
| Sandbox root is itself a symlink                                         | Root is canonicalised with `fs.realpathSync` before all checks           |
| Empty string argument                                                    | Denied with a descriptive error                                          |
| Database error                                                           | Fail-closed: `success:false` → engine returns `DENY`                     |
| Multiple path arguments (e.g. `move_file` with `source` + `destination`) | Every string argument is checked independently                           |

### Configuring a sandbox path

Use the `PATCH /policies/:toolName` endpoint to update an existing policy, optionally configuring its `sandbox_path`:

```bash
curl -X PATCH http://localhost:3001/policies/write_file \
  -H 'Content-Type: application/json' \
  -d '{ "action": "ALLOW", "sandbox_path": "/home/user/sandbox" }'
```

The file-manager-mcp already enforces its own sandbox internally — the policy-level path rule provides an additional defence-in-depth layer controlled centrally by the admin dashboard.

---

## How decisions and approvals work

The decision engine connects static checks with dynamic approval states stored in the database.

### Parallel Tool Call Batching

When the agent loop generates multiple parallel tool calls (a `tool_calls` step), the decision engine intercepts the request under a virtual composite tool name `"multiple_tool_calls"`.

- The engine runs individual `PolicyEngine` evaluations on every tool in the parallel list.
- If **any** tool is blocked (`DENY`), the entire parallel step is immediately denied.
- If **any** tool requires approval (and none are blocked), a single `multiple_tool_calls` approval request is logged in the database, batching all tool calls together so the user can approve or reject the entire step as a single action.

```text
Policy result
  │
  ▼
Decision engine
  ├───[Static Denied (Single or Parallel)] ────────────────────────► Return DENY
  └───[Requires Review] ──► Check if approvalId exists in request
                             │
                             ├───[No]──► Create approval row ──► Return PENDING & approvalId
                             │          (Batches parallel tools under 'multiple_tool_calls')
                             │
                             └───[Yes]──► Fetch approval from database
                                            │
                                            ▼
                                     Is status APPROVED?
                                       ├───[Yes]──► Return ALLOW & delete approval row
                                       ├───[No / Pending]──► Return PENDING
                                       └───[Rejected]──► Return DENY
```

### The approval lifecycle

When a policy flags a tool execution, the engine logs the parameters to the database as `PENDING`, pauses the execution loop, and returns a unique `approvalId` to your application.

```text
Client Application             loop.ts                  SQLite DB          Admin Dashboard
       │                          │                         │                     │
  1    │── Prompt / Resume ──────►│                         │                     │
       │                          │── Run policy check      │                     │
       │                          │                         │                     │
       │                          │── [If needs review] ───►│                     │
  2    │                          │   Create PENDING        │                     │
       │                          │◄── Return approvalId ───│                     │
  3    │◄─ Return PENDING ────────│                         │                     │
       │                          │                         │                     │
       │   [Execution Suspended]  │                         │                     │
  4    │                          │                         │◄── Approve/Reject ──│
       │                          │                         │                     │
       │   [Real-time Polling]    │                         │                     │
  5    │── Poller detects APPROVED│                         │                     │
  6    │── Resume execution ─────►│                         │                     │
       │   (with approvalId)      │── Query approval status ─────►│               │
       │                          │◄─ Return status ────────│                     │
       │                          │                         │                     │
       │                          │── [If APPROVED]         │                     │
  7    │                          │   Delete approval row ──►│                    │
       │                          │   Execute MCP tool(s)   │                     │
  8    │◄─ Return results ────────│                         │                     │
```

### Safety & Concurrency protections

- **Strict status checks**: The orchestrator checks the approval record status before resuming. It only runs the tool if the status is explicitly `APPROVED`. A `PENDING` status prompts the client to poll again, and a `REJECTED` status cancels the request.
- **Single-use approvals**: We look up approvals by their unique identifier (`approvalId`) rather than the tool name. This binds each approval to a specific tool call, preventing replay attacks where a previously approved tool runs again without authorization.
- **Idempotency and Delete Protection**:
  - The manual approval and rejection endpoints (`/policies/approvals/:id/approve` and `/policies/approvals/:id/reject`) are fully idempotent. Re-submitting an already approved or rejected request returns success (`200`) instead of failing.
  - To prevent database exceptions when the client's automated real-time polling detects an approval status transition and resumes execution at the exact same split-second that the user manually clicks "Resume Execution", all `db.approval.delete()` operations are wrapped in safe catch blocks. If a concurrent thread has already deleted the single-use record, the request ignores the missing record error and continues execution.

---

## How we protect API boundaries

- **Server-side token tracking**: The backend calculates and tracks token budgets in the database. You cannot bypass limits by altering client payloads.
- **Automatic budget window resets**: Token budgets are tracked per conversation. If a 3-minute inactivity window is exceeded during sequential agent execution, the conversation's accumulated token count automatically resets.
- **Message history sanitization**: The system strips out any messages with the `"system"` role from incoming history payloads, preventing clients from injecting override prompts.
- **Timeout limits on model requests**: We wrap connections to the model API in an `AbortSignal.timeout(timeoutMs)`. If the upstream service freezes or runs slow, the connection terminates cleanly instead of stalling your server thread. The timeout duration is safely parsed and falls back to 30 seconds if config variables are invalid.

---

## Decision Logging & Auditing

Every evaluation made by the policy decision engine writes a detailed audit entry to the SQLite database. This ensures developers and administrators have a clear, immutable record of what the agent tried to do and why it was allowed or blocked.

### Log Database Schema (`Log` Model)

```prisma
model Log {
  id         String   @id @default(uuid())
  tool_name  String
  decision   Decision // ALLOW | DENY | PENDING | FAILED
  reason     String?
  createdAt  DateTime @default(now())
}
```

### When Logs are Written

1.  **`ALLOW`**:
    - Written immediately when a tool execution is approved naturally by policy.
    - Written when the orchestrator resumes and executes a tool call that was manually `APPROVED` by an administrator.
    - For parallel tool executions (`multiple_tool_calls`), an `ALLOW` log is written for each constituent tool run.
2.  **`PENDING`**:
    - Written when a tool execution (single or parallel) requires manual administrator review, capturing the unique `approvalId`.
3.  **`DENY`**:
    - Written when a tool is blocked by policy configuration.
    - Written when an administrator rejects a pending approval request.
    - Written when a critical failure occurs inside the decision engine (logged as `Decision engine failure`).

### Audit Management

Administrators can inspect logs in real-time on the **Decision Logs** tab of the dashboard and reset/clear all logs via a single action (`DELETE /logs`), which truncates the log table for clean developer iteration.

---

## REST API Reference

The Express backend serves the following REST endpoints:

### 🤖 Agent Orchestration

#### `POST /agent/run`

Runs the main LLM orchestration loop for a conversation.

- **Payload**:
  ```json
  {
    "message": "Create a file named hello.txt",
    "conversationId": "conv-uuid-123",
    "approvalId": "approval-uuid-abc" // Optional. Pass to resume a paused execution.
  }
  ```
- **Response (SUCCESS)**:
  ```json
  {
    "status": "SUCCESS",
    "answer": "File hello.txt successfully created."
  }
  ```
- **Response (PENDING)**:
  ```json
  {
    "status": "PENDING",
    "approvalId": "approval-uuid-abc"
  }
  ```
- **Response (DENY)**:
  ```json
  {
    "status": "DENY",
    "reason": "Tool execution blocked: write_file - path not allowed."
  }
  ```

---

### 🛡️ Policy Configurations

#### `GET /policies`

Returns a list of all configured policy actions.

- **Response**:
  ```json
  [
    { "tool_name": "read_file", "action": "ALLOW" },
    { "tool_name": "write_file", "action": "APPROVAL" }
  ]
  ```

#### `GET /policies/:toolName`

Retrieves the policy for a specific tool. If no rule exists, it defaults to a fail-closed `APPROVAL` response.

- **Response**:
  ```json
  {
    "tool_name": "read_file",
    "action": "ALLOW"
  }
  ```

#### `POST /policies`

Creates a new policy rule.

- **Payload**:
  ```json
  {
    "tool_name": "delete_file",
    "action": "DENY"
  }
  ```
- **Response**: `201 Created` with the newly created policy object.

#### `PATCH /policies/:toolName`

Updates an existing policy action.

- **Payload**:
  ```json
  {
    "action": "ALLOW"
  }
  ```

#### `DELETE /policies/:toolName`

Deletes a policy configuration, reverting it to the default fail-closed behavior.

---

### 📥 Manual Approvals

#### `GET /approvals`

Retrieves a list of all manual approval records ordered by creation date (newest first).

#### `POST /policies/approvals/:id/approve`

Approves a pending request.

- **Response**: `{ "id": "uuid", "status": "APPROVED" }`.
- **Idempotency**: Returns `200` with the approved state if the request is already approved.

#### `POST /policies/approvals/:id/reject`

Rejects a pending request.

- **Response**: `{ "id": "uuid", "status": "REJECTED" }`.
- **Idempotency**: Returns `200` with the rejected state if the request is already rejected.

---

### 📜 Audit Logs

#### `GET /logs`

Retrieves all recorded policy decisions.

#### `DELETE /logs`

Clears/resets all decision log records from the database. Returns `204 No Content`.
