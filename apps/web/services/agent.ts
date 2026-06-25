import axios from "axios";

const API_PORT = process.env.API_PORT || "3001";
const API_URL = `http://localhost:${API_PORT}`;

export interface ChatMessage {
  role: "user" | "assistant" | "tool";
  content: string;
}

export interface AgentRunResponse {
  status: "SUCCESS" | "PENDING" | "DENIED" | "ERROR";
  answer?: string;
  approvalId?: string;
  reason?: string;
  history: ChatMessage[];
}

export async function runAgentMessage(
  message: string | null,
  conversationId: string,
  approvalId?: string | null,
  history?: ChatMessage[]
): Promise<AgentRunResponse> {
  const response = await axios.post<AgentRunResponse>(`${API_URL}/agent/run`, {
    message,
    conversationId,
    approvalId,
    history,
  });
  return response.data;
}
