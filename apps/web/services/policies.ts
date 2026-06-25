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

export type PolicyAction = "ALLOW" | "APPROVAL" | "DENY";

export interface Policy {
  tool_name: string;
  action: PolicyAction;
}

export async function getPolicies(): Promise<Policy[]> {
  const response = await axios.get<Policy[]>(`${API_URL}/policies`);
  return response.data;
}

export async function createPolicy(tool_name: string, action: PolicyAction): Promise<Policy> {
  const response = await axios.post<Policy>(`${API_URL}/policies`, {
    tool_name,
    action,
  });
  return response.data;
}

export async function updatePolicy(toolName: string, action: PolicyAction): Promise<Policy> {
  const response = await axios.patch<Policy>(`${API_URL}/policies/${encodeURIComponent(toolName)}`, {
    action,
  });
  return response.data;
}

export async function deletePolicy(toolName: string): Promise<void> {
  await axios.delete(`${API_URL}/policies/${encodeURIComponent(toolName)}`);
}

export interface McpTool {
  name: string;
  description?: string;
  inputSchema?: any;
  server: string;
}

export async function getMcpTools(): Promise<McpTool[]> {
  const response = await axios.get<{ tools: McpTool[] }>(`${API_URL}/mcp/tools`);
  return response.data.tools;
}
