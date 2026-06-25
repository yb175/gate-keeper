import axios from "axios";
import { API_URL } from "./api";

export interface ChatMessage {
  role: "user" | "assistant" | "tool";
  content: string;
}

export interface AgentRunResponse {
  status: "SUCCESS" | "PENDING" | "DENY";
  answer?: string;
  approvalId?: string;
  reason?: string;
  history: ChatMessage[];
}

export async function runAgentMessage(
  message: string | null,
  conversationId: string,
  approvalId?: string | null,
  history?: ChatMessage[],
): Promise<AgentRunResponse> {
  const response = await axios.post<AgentRunResponse>(`${API_URL}/agent/run`, {
    message,
    conversationId,
    approvalId,
    history,
  });
  return response.data;
}
