"use client";

import React, { useState, useEffect } from "react";
import ApprovalTable from "../../components/ApprovalTable";
import { getApprovals, approveRequest, rejectRequest, Approval } from "../../services/approvals";

export default function ApprovalsPage() {
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [loading, setLoading] = useState(true);

  let cancelledRef = React.useRef(false);

  useEffect(() => {
    cancelledRef.current = false;
    return () => {
      cancelledRef.current = true;
    };
  }, []);

  const fetchApprovalsData = async () => {
    try {
      const data = await getApprovals();
      if (!cancelledRef.current) {
        setApprovals(data);
      }
    } catch (err) {
      console.error("Failed to fetch approvals", err);
    } finally {
      if (!cancelledRef.current) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    let timeoutId: NodeJS.Timeout;

    const poll = async () => {
      if (cancelledRef.current) return;
      await fetchApprovalsData();
      if (!cancelledRef.current) {
        timeoutId = setTimeout(poll, 5000);
      }
    };

    poll();
    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
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
