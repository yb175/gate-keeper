import axios from "axios";

const getApiUrl = () => {
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL;
  }
  const port = process.env.NEXT_PUBLIC_API_PORT || "3001";
  if (typeof window !== "undefined") {
    return `${window.location.protocol}//${window.location.hostname}:${port}`;
  }
  return `http://localhost:${port}`;
};
const API_URL = getApiUrl();

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
