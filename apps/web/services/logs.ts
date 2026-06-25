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
