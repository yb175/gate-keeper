"use client";

import React, { useState, useEffect } from "react";
import ApprovalTable from "../../components/ApprovalTable";
import { getApprovals, approveRequest, rejectRequest, Approval } from "../../services/approvals";

export default function ApprovalsPage() {
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchApprovalsData = async () => {
    try {
      const data = await getApprovals();
      setApprovals(data);
    } catch (err) {
      console.error("Failed to fetch approvals", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      await fetchApprovalsData();
      if (!cancelled) {
        // Only schedule the next fetch after the previous one completes
        setTimeout(poll, 5000);
      }
    };

    poll();
    return () => { cancelled = true; };
  }, []);

  const handleApprove = async (id: string) => {
    await approveRequest(id);
    await fetchApprovalsData(); // refresh list
  };

  const handleReject = async (id: string) => {
    await rejectRequest(id);
    await fetchApprovalsData();
  };

  return (
    <div className="space-y-6">
      <ApprovalTable
        approvals={approvals}
        onApprove={handleApprove}
        onReject={handleReject}
        loading={loading}
      />
    </div>
  );
}
