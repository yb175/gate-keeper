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
