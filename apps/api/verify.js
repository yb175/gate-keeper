import fs from "fs";
import path from "path";

const API_URL = "http://localhost:3001";
const sandboxDir = "/home/yb175/projects/gate-keeper/apps/file-manager-mcp/sandbox";

async function runVerification() {
  console.log("=== STARTING GATEKEEPER END-TO-END VERIFICATION (FETCH) ===");

  const conversationId = `verify_conv_${Math.random().toString(36).substring(2, 9)}`;
  console.log(`Using Conversation ID: ${conversationId}`);

  try {
    // 1. Check existing policies
    console.log("\n[1] Fetching active policies...");
    const policiesRes = await fetch(`${API_URL}/policies`);
    const policiesData = await policiesRes.json();
    console.log("Active policies count:", policiesData.length);

    // 2. Run agent prompt that triggers a write_file tool call (which should require approval since no policy exists)
    console.log("\n[2] Submitting prompt to write file (should be paused for approval)...");
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

    // 3. Verify the approval exists in the approvals list
    console.log("\n[3] Fetching approvals list...");
    const approvalsRes = await fetch(`${API_URL}/approvals`);
    const approvalsData = await approvalsRes.json();
    const foundApproval = approvalsData.find(app => app.id === approvalId);
    if (!foundApproval) {
      throw new Error(`Approval ${approvalId} not found in GET /approvals`);
    }
    console.log("Found approval details in GET /approvals:", JSON.stringify(foundApproval));

    // 4. Approve the request
    console.log(`\n[4] Approving request ${approvalId}...`);
    const approveRes = await fetch(`${API_URL}/policies/approvals/${approvalId}/approve`, {
      method: "POST"
    });
    const approveData = await approveRes.json();
    console.log("Approve response:", JSON.stringify(approveData));

    // 5. Resume the agent run with the approvalId
    console.log("\n[5] Resuming agent execution with approval...");
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
    if (!fs.existsSync(testTxtPath)) {
      throw new Error(`File was not created at ${testTxtPath}`);
    }
    const fileContent = fs.readFileSync(testTxtPath, "utf-8");
    console.log(`File content at ${testTxtPath}: "${fileContent}"`);
    if (fileContent !== "Hello GateKeeper") {
      throw new Error(`Unexpected file content: ${fileContent}`);
    }
    console.log("File verification: SUCCESS");

    // 6. Check decision logs
    console.log("\n[6] Fetching decision logs...");
    const logsRes = await fetch(`${API_URL}/logs`);
    const logsData = await logsRes.json();
    const runLogs = logsData.filter(log => log.reason && log.reason.includes(conversationId));
    console.log(`Logs generated for conversation ${conversationId}:`);
    console.log(JSON.stringify(runLogs, null, 2));

    // 7. Create an ALLOW policy for write_file
    console.log("\n[7] Creating ALLOW policy for write_file tool...");
    const createPolicyRes = await fetch(`${API_URL}/policies`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tool_name: "write_file",
        action: "ALLOW"
      })
    });
    
    if (createPolicyRes.status === 409) {
      console.log("Policy already exists, updating to ALLOW...");
      const updatePolicyRes = await fetch(`${API_URL}/policies/write_file`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "ALLOW"
        })
      });
      const updatePolicyData = await updatePolicyRes.json();
      console.log("Updated policy:", JSON.stringify(updatePolicyData));
    } else {
      const createPolicyData = await createPolicyRes.json();
      console.log("Created policy:", JSON.stringify(createPolicyData));
    }

    // 8. Submit another write prompt (should complete automatically without approval)
    const conversationId2 = `verify_conv_auto_${Math.random().toString(36).substring(2, 9)}`;
    console.log(`\n[8] Submitting prompt to write file with ALLOW policy (Conversation: ${conversationId2})...`);
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
    if (!fs.existsSync(allowedTxtPath)) {
      throw new Error(`File was not created at ${allowedTxtPath}`);
    }
    const allowedContent = fs.readFileSync(allowedTxtPath, "utf-8");
    console.log(`File content at ${allowedTxtPath}: "${allowedContent}"`);

    // Clean up created files
    fs.unlinkSync(testTxtPath);
    fs.unlinkSync(allowedTxtPath);
    console.log("Cleaned up sandbox files.");

    // Clean up created policy so DB remains clean
    console.log("\n[9] Deleting test policy to restore original DB state...");
    const deleteRes = await fetch(`${API_URL}/policies/write_file`, {
      method: "DELETE"
    });
    console.log("Deleted test policy status:", deleteRes.status);

    console.log("\n=== ALL E2E API VERIFICATIONS PASSED SUCCESSFULLY ===");
  } catch (error) {
    console.error("\n!!! VERIFICATION FAILED !!!");
    console.error(error.message);
    process.exit(1);
  }
}

runVerification();
