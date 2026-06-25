import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const API_URL = "http://localhost:3001";
// Resolved relative to this script — portable across any checkout location
const sandboxDir = path.resolve(__dirname, "../file-manager-mcp/sandbox");

async function runVerification() {
  console.log("=== STARTING GATEKEEPER END-TO-END VERIFICATION (FETCH) ===");

  const conversationId = `verify_conv_${Math.random().toString(36).substring(2, 9)}`;
  console.log(`Using Conversation ID: ${conversationId}`);

  // Track pre-existing write_file policy so we can restore it exactly.
  // null  = no policy existed before this run (delete it on cleanup)
  // obj   = policy existed (restore its original action on cleanup)
  let originalWriteFilePolicy = null;
  let policyWasCreatedByVerify = false;
  let hasFailed = false;

  // Track created sandbox files so we can delete them in finally
  const createdFiles = [];

  try {
    // 1. Check existing policies
    console.log("\n[1] Fetching active policies...");
    const policiesRes = await fetch(`${API_URL}/policies`);
    const policiesData = await policiesRes.json();
    console.log("Active policies count:", policiesData.length);

    // Remember any pre-existing write_file policy so cleanup can restore it
    originalWriteFilePolicy = policiesData.find(p => p.tool_name === "write_file") || null;
    if (originalWriteFilePolicy) {
      console.log(`Pre-existing write_file policy found: action=${originalWriteFilePolicy.action}`);
    }

    // 2. Set policy to APPROVAL so step 2 reliably produces PENDING regardless
    //    of what was in DB before the run.
    console.log("\n[2] Ensuring write_file policy is APPROVAL for verification...");
    if (originalWriteFilePolicy) {
      if (originalWriteFilePolicy.action !== "APPROVAL") {
        const patchRes = await fetch(`${API_URL}/policies/write_file`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "APPROVAL" }),
        });
        if (!patchRes.ok) {
          throw new Error(`Failed to ensure write_file policy is APPROVAL (PATCH status: ${patchRes.status})`);
        }
      }
    } else {
      const postRes = await fetch(`${API_URL}/policies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tool_name: "write_file", action: "APPROVAL" }),
      });
      if (postRes.ok) {
        policyWasCreatedByVerify = true;
      } else {
        throw new Error(`Failed to create write_file policy (POST status: ${postRes.status})`);
      }
    }

    // 3. Run agent prompt that triggers write_file (should be paused for approval)
    console.log("\n[3] Submitting prompt to write file (should be paused for approval)...");
    const run1Res = await fetch(`${API_URL}/agent/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "Write a file named sandbox/test.txt with content 'Hello GateKeeper'",
        conversationId,
      }),
    });
    const run1Data = await run1Res.json();

    console.log("Agent Run 1 Status:", run1Data.status);
    console.log("Agent Run 1 Approval ID:", run1Data.approvalId);

    if (run1Data.status !== "PENDING" || !run1Data.approvalId) {
      throw new Error(`Expected PENDING status and approval ID, got: ${JSON.stringify(run1Data)}`);
    }

    const approvalId = run1Data.approvalId;

    // 4. Verify the approval exists in the approvals list
    console.log("\n[4] Fetching approvals list...");
    const approvalsRes = await fetch(`${API_URL}/approvals`);
    const approvalsData = await approvalsRes.json();
    const foundApproval = approvalsData.find(app => app.id === approvalId);
    if (!foundApproval) {
      throw new Error(`Approval ${approvalId} not found in GET /approvals`);
    }
    console.log("Found approval details in GET /approvals:", JSON.stringify(foundApproval));

    // 5. Approve the request
    console.log(`\n[5] Approving request ${approvalId}...`);
    const approveRes = await fetch(`${API_URL}/policies/approvals/${approvalId}/approve`, {
      method: "POST"
    });
    const approveData = await approveRes.json();
    console.log("Approve response:", JSON.stringify(approveData));

    // 6. Resume the agent run with the approvalId
    console.log("\n[6] Resuming agent execution with approval...");
    const resumeRes = await fetch(`${API_URL}/agent/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: null,
        conversationId,
        approvalId,
        history: run1Data.history
      }),
    });
    const resumeData = await resumeRes.json();
    console.log("Resume status:", resumeData.status);
    console.log("Resume final answer:", resumeData.answer);

    // Verify sandbox/test.txt exists and has the correct content
    const testTxtPath = path.join(sandboxDir, "test.txt");
    createdFiles.push(testTxtPath);
    if (!fs.existsSync(testTxtPath)) {
      throw new Error(`File was not created at ${testTxtPath}`);
    }
    const fileContent = fs.readFileSync(testTxtPath, "utf-8");
    console.log(`File content at ${testTxtPath}: "${fileContent}"`);
    if (fileContent !== "Hello GateKeeper") {
      throw new Error(`Unexpected file content: ${fileContent}`);
    }
    console.log("File verification: SUCCESS");

    // 7. Check decision logs
    console.log("\n[7] Fetching decision logs...");
    const logsRes = await fetch(`${API_URL}/logs`);
    const logsData = await logsRes.json();
    const runLogs = logsData.filter(log => log.reason && log.reason.includes(conversationId));
    console.log(`Logs generated for conversation ${conversationId}:`);
    console.log(JSON.stringify(runLogs, null, 2));

    // 8. Update policy to ALLOW and run again without approval
    console.log("\n[8] Updating write_file policy to ALLOW...");
    await fetch(`${API_URL}/policies/write_file`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "ALLOW" }),
    });

    const conversationId2 = `verify_conv_auto_${Math.random().toString(36).substring(2, 9)}`;
    console.log(`\n[9] Submitting prompt to write file with ALLOW policy (Conversation: ${conversationId2})...`);
    const run2Res = await fetch(`${API_URL}/agent/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "Write a file named sandbox/allowed.txt with content 'Auto approved content'",
        conversationId: conversationId2,
      }),
    });
    const run2Data = await run2Res.json();

    console.log("Agent Run 2 Status:", run2Data.status);
    console.log("Agent Run 2 Final Answer:", run2Data.answer);

    const allowedTxtPath = path.join(sandboxDir, "allowed.txt");
    createdFiles.push(allowedTxtPath);
    if (!fs.existsSync(allowedTxtPath)) {
      throw new Error(`File was not created at ${allowedTxtPath}`);
    }
    const allowedContent = fs.readFileSync(allowedTxtPath, "utf-8");
    console.log(`File content at ${allowedTxtPath}: "${allowedContent}"`);

    console.log("\n=== ALL E2E API VERIFICATIONS PASSED SUCCESSFULLY ===");
  } catch (error) {
    console.error("\n!!! VERIFICATION FAILED !!!");
    console.error(error.message);
    hasFailed = true;
  } finally {
    // Always clean up sandbox files and restore policy state, even on failure.
    console.log("\n[cleanup] Removing created sandbox files...");
    for (const filePath of createdFiles) {
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          console.log(`  Deleted: ${filePath}`);
        }
      } catch (err) {
        console.error(`  Failed to delete ${filePath}:`, err.message);
      }
    }

    console.log("[cleanup] Restoring write_file policy state...");
    try {
      if (policyWasCreatedByVerify) {
        // We created it from scratch — delete it entirely to leave no trace
        const res = await fetch(`${API_URL}/policies/write_file`, { method: "DELETE" });
        if (!res.ok) {
          throw new Error(`DELETE /policies/write_file failed with status ${res.status}`);
        }
        console.log("  Deleted write_file policy (was created by verify).");
      } else if (originalWriteFilePolicy) {
        // Restore the original action the policy had before the run
        const res = await fetch(`${API_URL}/policies/write_file`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: originalWriteFilePolicy.action }),
        });
        if (!res.ok) {
          throw new Error(`PATCH /policies/write_file failed with status ${res.status}`);
        }
        console.log(`  Restored write_file policy to: ${originalWriteFilePolicy.action}`);
      }
    } catch (cleanupErr) {
      console.error("  Policy cleanup failed:", cleanupErr.message);
    }

    if (hasFailed) {
      process.exit(1);
    }
  }
}

runVerification();
