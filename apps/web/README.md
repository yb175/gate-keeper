# 🎨 Gatekeeper Admin Console: Frontend Architecture

Welcome to the **Gatekeeper Admin Console**! This dashboard is the cockpit for your LLM security guardrail system. It is a sleek, off-black web application designed to let you chat with your LLM agent, manage safety policy rule-sets, review pending tool execution requests in real-time, and audit decision logs.

Built using **Next.js (App Router)** and **Tailwind CSS**, it features a fully reactive dashboard powered by **Redux Toolkit** and an automated, real-time polling synchronizer.

---

## 🌟 Visual Philosophy & Premium Aesthetics

We believe developer tools should look as premium as consumer applications. The dashboard is designed around a strict set of visual principles:

* **The "Off-Black" Workspace**: Built with a dark, curated color scheme using deep charcoal tones (`zinc-950` backgrounds, `zinc-900` cards, and low-contrast `zinc-800` borders). This keeps it easy on the eyes during long debugging sessions.
* **Micro-Animations & Visual Cues**: When a tool is intercepted and requires human review, the UI draws attention through subtle animations (like soft pulsing amber rings) to flag execution blocks.
* **Shimmer Skeletons over Raw Loading Spinners**: Nobody likes jarring layout shifts or simple text placeholders. Every table component (Policies, Approvals, Logs) uses a CSS-gradient shimmer effect (`.shimmer` animation in [globals.css](app/globals.css)) that mimics the final grid structure while data is being loaded.
* **Utilitarian Typography**: The layout pairs clean, legible body text with monospaced accents (`Geist Mono`) for JSON representations, arguments, and tool names, emphasizing its nature as an operator's terminal.

---

## 🏗️ Folder and Route Structure

The Next.js workspace is organized as follows:

```text
apps/web/
  ├── app/                  # Next.js App Router Page Layouts
  │   ├── layout.tsx        # Base template, sets up global HTML, theme, and Redux provider wrapper
  │   ├── page.tsx          # Silent index page (immediately redirects to /chat)
  │   ├── globals.css       # Tailwind configuration and custom animation layers
  │   ├── chat/             # The principal Agent Chat Workspace
  │   ├── policies/         # Guardrail settings & policy rules editor
  │   ├── approvals/        # Review queue for intercepted actions
  │   └── logs/             # Immutably rendered audit trails
  │
  ├── components/           # Reusable View Containers
  │   ├── ChatWindow.tsx    # Renders message streams, interactive tool blocks, and pending review banners
  │   ├── PolicyTable.tsx   # Curates security policies with inline creation/update actions and shimmer tables
  │   ├── ApprovalTable.tsx # Intercepted tool parameters inspector with support for parallel batch runs
  │   ├── LogsTable.tsx     # Chronological evaluation logs display featuring "Reset Logs" capability
  │   └── Navbar.tsx        # High-level navigation bar with active route indicators
  │
  ├── services/             # Axios API Client Wrappers
  │   ├── agent.ts          # Integrates with the express model executor loop (/agent/run)
  │   ├── policies.ts       # Performs policy mutations (GET, POST, PATCH, DELETE)
  │   ├── approvals.ts      # Submits POST requests to approve or reject pending blocks
  │   └── logs.ts           # Interacts with the decision audit records database
  │
  └── store/                # Redux State Management Layer
      ├── index.ts          # Standard Redux store setup (TypeScript typed hooks)
      ├── StoreProvider.tsx # Client-side wrapper to bridge Next.js Server Components
      └── chatSlice.ts      # Active conversation, input buffer, and pending state reducer
```

---

## 🧠 State Management: Session Preserves & SSR Hydration

Initially, switching between tabs (e.g., leaving a running chat to edit a policy, then returning) would reset the chat history and inputs. To solve this, we moved the chat state into a centralized **Redux Toolkit** store.

### What is Persisted?
The store slice (`chatSlice.ts`) maintains:
1. **`conversationId`**: A unique session ID. If none is found, we automatically generate a random base-36 string.
2. **`messages`**: An array of chat bubbles (`ChatMessage[]`) representing the conversational trail.
3. **`inputValue`**: The draft text in the chat input.
4. **`loading`**: A flag indicating whether the agent is currently thinking or running tools.
5. **`pendingApprovalId`** / **`pendingToolName`** / **`pendingApprovalStatus`**: Intercepted action metadata.

### How Hydration is Handled Safely
Because Next.js pre-renders pages on the server (which doesn't have access to browser APIs like `window` or `localStorage`), initializing Redux state with local storage values immediately causes a hydration mismatch error. 

To prevent this:
1. The slice starts with a safe, default initial state.
2. The chat page mounts a hook that dispatches the `hydrateChatState` action on mount.
3. This syncs `localStorage` variables back into the Redux store on the client, ensuring server-to-client rendering transitions are completely smooth.

---

## ⏱️ Real-time Automated Execution Flow

The defining feature of the Gatekeeper Admin Console is its ability to resume execution automatically. If the agent hits a tool that requires human approval, you do not have to click "Resume" after approving it elsewhere.

Here is the exact lifecycle of an execution resume event:

```text
  Chat Workspace (page.tsx)                  Admin approvals page (or separate tab)
            │                                                      │
 1. Agent returns PENDING ────────┐                                │
    (yellow card renders)         │                                │
            │                     │                                │
 2. Starts Polling Loop ◄─────────┘                                │
    (every 2 seconds)                                              │
            │                                                      │
 3. Poll: getApprovals()                                           │
            │                                                      │
            ├───────────────── [Still PENDING] ────────────────────┤
            │                                                      │
            │                                        4. User clicks "Approve"
            │                                           (State becomes APPROVED)
            │                                                      │
 5. Poll: getApprovals()                                           │
    (Detects status is APPROVED)                                   │
            │                                                      │
 6. Stop polling interval                                          │
            │                                                      │
 7. Call runAgentMessage() ────────────────────────────────────────► API resumes execution
    (Passes approvalId to Express)
```

### 🔒 Preventing Double-Execution (Safe Refs Pattern)
Because React's `useEffect` and `setInterval` closures capture state at the time of creation, performing polling in React components can result in executing stale handlers (e.g. attempting to resume multiple times if the user clicks "Resume" at the exact millisecond the poller detects a state transition).

We bypassed this by maintaining **synchronized state refs**:
```typescript
const handleApproveRef = useRef(handleApprove);
const loadingRef = useRef(loading);

useEffect(() => {
  handleApproveRef.current = handleApprove;
  loadingRef.current = loading;
}, [handleApprove, loading]);
```
The polling interval always queries `handleApproveRef.current()` and checks `loadingRef.current`. If the page is already executing or has finished, the action is gracefully ignored, protecting the Express backend from redundant execution pipelines.

### 📦 Parallel Tool Batching in the UI
When the agent generates multiple tools in parallel (such as reading multiple configuration files simultaneously), the backend represents this as a single batched approval under the composite name `"multiple_tool_calls"`.
- The **Approval Page** and **Chat Workspace** catch this name and format the execution block as `"multiple parallel tools"`.
- The parameters are rendered in an clean, side-by-side array inspector so you can audit all requested parallel calls collectively.
- You can approve or reject the entire collection in a single click, triggering concurrent backend tool executions.

---

## 🚀 Local Development Setup

To run the Next.js developer environment:

1. **Verify Backend Status**: Make sure your local API is running (usually on port `3001` or as specified by the `.env` file at the root).
2. **Install Workspace Dependencies**:
   From the repository root directory:
   ```bash
   npm install
   ```
3. **Launch Web Dashboard**:
   ```bash
   npx turbo dev --filter=web
   ```
   *Alternatively, navigate directly to `apps/web` and run:*
   ```bash
   npm run dev
   ```
4. **Open in Browser**: Navigate to [http://localhost:3000](http://localhost:3000). The console automatically connects to the API and initializes your Redux session.
