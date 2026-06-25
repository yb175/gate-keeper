import axios from "axios";

const API_PORT = process.env.API_PORT || "3001";
const API_URL = `http://localhost:${API_PORT}`;

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
  const response = await axios.patch<Policy>(`${API_URL}/policies/${toolName}`, {
    action,
  });
  return response.data;
}

export async function deletePolicy(toolName: string): Promise<void> {
  await axios.delete(`${API_URL}/policies/${toolName}`);
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
