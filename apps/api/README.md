# Gatekeeper: Agent and API orchestration

Gatekeeper is a control layer that sits between your LLM agent, your security rules, and external Model Context Protocol (MCP) servers. It intercepts tool calls and checks them against safety rules before executing any code.

---

## The architecture

When an agent requests a tool execution, the request flows through these components before reaching the target MCP server:

```text
Client request
  │
  ▼
Express API (/agent/run)
  │
  ├── memory.ts (tracks chat history and active approval IDs as read-only data)
  ├── llm.ts (handles system prompts and validates tool input schemas)
  ▼
Orchestration loop (loop.ts)
  │
  ▼
Policy engine (rules/*.ts) ──► Decision engine (decision.ts)
                                  │
                                  ▼
                            MCP executor (bootstrap.ts)
                                  │
                                  ▼
                            MCP registry ──► External MCP servers
```

### Key files and their jobs

* **[memory.ts](file:///home/yb175/projects/gate-keeper/apps/api/src/agent/memory.ts)**: Tracks the active chat history, tool execution results, and approval identifiers. It exposes these collections as read-only arrays to protect against accidental session corruption.
* **[llm.ts](file:///home/yb175/projects/gate-keeper/apps/api/src/agent/llm.ts)**: Validates input schemas, builds system prompts, and handles connection details with the language model.
* **[loop.ts](file:///home/yb175/projects/gate-keeper/apps/api/src/agent/loop.ts)**: Runs the main orchestration loop. It manages token budgets, keeps track of tool approvals, and enforces a hard limit of 30 steps to stop runaway processes.

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
Check if budget exceeded (budgetExceeded) ────[Exceeded]────► Deny
  │
  ▼ [Under Budget]
Check if approval required (needsApproval)
  │
  ├───[Requires Review]───► Requires human approval
  │
  └───[Safe / Allowed]────► Allow
```

* **Independent guardrails**: We separate static security checks from orchestrator and execution code in [engine.ts](file:///home/yb175/projects/gate-keeper/apps/api/src/policy/engine.ts). This makes safety rules easier to audit and update.
* **Race condition prevention**: We query policy rules from the database once per step. If someone edits a rule during execution, the system applies the change immediately, preventing state conflicts.
* **Strict precedence**: Safety limits always take priority. A `DENY` rule overrides both `APPROVAL` and `ALLOW` states.
* **Fail-closed default**: If a tool does not have a rule configured, the engine defaults to requiring human review before running the tool.

---

## How decisions and approvals work

The decision engine connects static checks with dynamic approval states stored in the database:

```text
Policy result
  │
  ▼
Decision engine
  ├───[Static Denied]──────────────────────────────────────────────► Return DENY
  └───[Requires Review] ──► Check if approvalId exists in request
                             │
                             ├───[No]──► Create approval row ──► Return PENDING & approvalId
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
  5    │── Resume execution ─────►│                         │                     │
  6    │   (with approvalId)      │── Query approval status ─────►│               │
       │                          │◄─ Return status ────────│                     │
       │                          │                         │                     │
       │                          │── [If APPROVED]         │                     │
  7    │                          │   Delete approval row ──►│                    │
       │                          │   Execute MCP tool      │                     │
  8    │◄─ Return results ────────│                         │                     │
       │                          │                         │                     │
       │                          │── [If PENDING/REJECTED] │                     │
  9    │◄─ Return PENDING/DENY ───│                         │                     │
```

### Safety protections

* **Strict status checks**: The orchestrator checks the approval record status before resuming. It only runs the tool if the status is explicitly `APPROVED`. A `PENDING` status prompts the client to poll again, and a `REJECTED` status cancels the request.
* **Single-use approvals**: We look up approvals by their unique identifier (`approvalId`) rather than the tool name. This binds each approval to a specific tool call, preventing replay attacks where a previously approved tool runs again without authorization.

---

## How we protect API boundaries

* **Server-side token tracking**: The backend calculates and tracks token budgets in the database. You cannot bypass limits by altering client payloads.
* **Message history sanitization**: The system strips out any messages with the `"system"` role from incoming history payloads, preventing clients from injecting override prompts.
* **Timeout limits on model requests**: We wrap connections to the model API in an `AbortSignal.timeout(timeoutMs)`. If the upstream service freezes or runs slow, the connection terminates cleanly instead of stalling your server thread. The timeout duration is safely parsed and falls back to 30 seconds if config variables are invalid.

---
