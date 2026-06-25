import { Message, Memory } from "../../types.js";

export function createMemory(): Memory {
  const messages: Message[] = [];
  const toolResults: unknown[] = [];
  let approvalId: string | undefined = undefined;

  return {
    get messages() {
      return messages;
    },
    get toolResults() {
      return toolResults;
    },
    get approvalId() {
      return approvalId;
    },
    addMessage(role: "user" | "assistant" | "tool" | "system", content: string) {
      messages.push({ role, content });
    },
    addToolResult(result: unknown) {
      toolResults.push(result);
    },
    clearApproval() {
      approvalId = undefined;
    },
    setApproval(id: string | undefined) {
      approvalId = id;
    },
  };
}
