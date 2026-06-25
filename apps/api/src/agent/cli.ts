import readline from "readline";
import crypto from "crypto";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const API_URL = "http://localhost:3001";
let history: any[] = [];
const conversationId = crypto.randomUUID();

function askQuestion(query: string): Promise<string> {
  return new Promise((resolve) => rl.question(query, resolve));
}

async function sendRequest(payload: any) {
  try {
    const response = await fetch(`${API_URL}/agent/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`\n❌ API Error (${response.status}):`, errorText);
      return;
    }

    const data: any = await response.json();
    history = data.history || [];

    if (data.status === "PENDING") {
      if (!data.approvalId) {
        console.error(
          "\n❌ Error: PENDING status response is missing approvalId",
        );
        return;
      }
      // Find the last assistant message containing the tool call details
      const lastMsg = history[history.length - 1];
      console.log(
        `\n⚠️  [PENDING APPROVAL] ${lastMsg ? lastMsg.content : "A tool execution requires human approval."}`,
      );

      const answer = await askQuestion(`👉 Approve this action? (y/n): `);
      const approved =
        answer.trim().toLowerCase() === "y" ||
        answer.trim().toLowerCase() === "yes";

      const action = approved ? "approve" : "reject";
      const approvalResponse = await fetch(
        `${API_URL}/policies/approvals/${data.approvalId}/${action}`,
        {
          method: "POST",
        },
      );

      if (!approvalResponse.ok) {
        console.error(
          `\n❌ Failed to ${action} approval:`,
          await approvalResponse.text(),
        );
        return;
      }

      console.log(
        `\n✅ Action ${approved ? "approved" : "rejected"}. Resuming agent loop...`,
      );

      // Resume agent execution
      await sendRequest({
        message: null,
        conversationId,
        approvalId: data.approvalId,
        history,
      });
    } else if (data.status === "DENY") {
      console.log(
        `\n🚫 [DENIED] Execution blocked: ${data.reason || "Blocked by policy"}`,
      );
    } else if (data.status === "SUCCESS") {
      // Print execution log of tools used during the run
      const toolCalls = history.filter(
        (msg) => msg.role === "assistant" && msg.content.includes("Call tool"),
      );
      if (toolCalls.length > 0) {
        console.log("\n🛠️  [TOOL EXECUTION TRACE]");
        for (let i = 0; i < history.length; i++) {
          const msg = history[i];
          if (msg.role === "assistant" && msg.content.includes("Call tool")) {
            console.log(`  • ${msg.content}`);
            const nextMsg = history[i + 1];
            if (nextMsg && nextMsg.role === "tool") {
              console.log(`    ↳ Output: ${nextMsg.content}`);
            }
          }
        }
      }
      console.log(`\n🤖 [AGENT] ${data.answer}`);
    }
  } catch (error: any) {
    console.error(
      "\n❌ Error communicating with agent:",
      error.message || error,
    );
  }
}

async function main() {
  console.clear();
  console.log("==================================================");
  console.log("🤖 Interactive Gate-Keeper Agent CLI Client");
  console.log(`📡 Backend URL: ${API_URL}`);
  console.log(`💬 Session ID: ${conversationId}`);
  console.log("==================================================\n");

  while (true) {
    const input = await askQuestion("\n👤 User: ");
    if (!input || !input.trim()) continue;

    const trimmed = input.trim();
    if (trimmed === "exit" || trimmed === "quit") {
      console.log("Goodbye!");
      rl.close();
      process.exit(0);
    }

    await sendRequest({
      message: trimmed,
      conversationId,
      history,
    });
  }
}

main();
