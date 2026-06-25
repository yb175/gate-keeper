import axios from "axios";

const API_PORT = process.env.API_PORT || "3001";
const API_URL = `http://localhost:${API_PORT}`;

export type ApprovalStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface Approval {
  id: string;
  tool_name: string;
  arguments: any;
  status: ApprovalStatus;
  createdAt: string;
  updatedAt: string;
}

export async function getApprovals(): Promise<Approval[]> {
  const response = await axios.get<Approval[]>(`${API_URL}/approvals`);
  return response.data;
}

export async function approveRequest(id: string): Promise<void> {
  await axios.post(`${API_URL}/policies/approvals/${id}/approve`);
}

export async function rejectRequest(id: string): Promise<void> {
  await axios.post(`${API_URL}/policies/approvals/${id}/reject`);
}
