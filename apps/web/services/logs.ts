import axios from "axios";

const API_PORT = process.env.API_PORT || "3001";
const API_URL = `http://localhost:${API_PORT}`;

export type LogDecision = "ALLOW" | "DENY" | "PENDING" | "FAILED";

export interface Log {
  id: string;
  tool_name: string;
  decision: LogDecision;
  reason?: string;
  createdAt: string;
}

export async function getLogs(): Promise<Log[]> {
  const response = await axios.get<Log[]>(`${API_URL}/logs`);
  return response.data;
}

export async function resetLogs(): Promise<void> {
  await axios.delete(`${API_URL}/logs`);
}
