"use client";

import React, { useState } from "react";
import { Check, X, ShieldAlert } from "lucide-react";
import { Approval } from "../services/approvals";

interface ApprovalTableProps {
  approvals: Approval[];
  onApprove: (id: string) => Promise<void>;
  onReject: (id: string) => Promise<void>;
  loading: boolean;
}

export default function ApprovalTable({
  approvals,
  onApprove,
  onReject,
  loading,
}: ApprovalTableProps) {
  const [actioningId, setActioningId] = useState<string | null>(null);

  const handleAction = async (id: string, actionFn: (id: string) => Promise<void>) => {
    setActioningId(id);
    try {
      await actionFn(id);
    } catch (err) {
      alert("Failed to complete action");
    } finally {
      setActioningId(null);
    }
  };

  const formatDateStr = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return date.toISOString().replace("T", " ").substring(0, 19);
    } catch (e) {
      return dateStr;
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-0.5">
        <h2 className="text-lg font-mono font-bold tracking-tight text-white">Approvals</h2>
        <p className="text-xs text-zinc-500">Track and respond to manual verification requests from your agent.</p>
      </div>

      <div className="border border-zinc-800 bg-zinc-950 rounded-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-900/50 font-mono text-2xs uppercase text-zinc-500">
                <th className="px-4 py-3">Approval ID</th>
                <th className="px-4 py-3">Tool Name</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Created At</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-900 font-mono text-xs">
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i} className="border-b border-zinc-900/50">
                    <td className="px-4 py-4">
                      <div className="h-4 w-32 shimmer rounded-sm" />
                    </td>
                    <td className="px-4 py-4">
                      <div className="h-4 w-24 shimmer rounded-sm" />
                    </td>
                    <td className="px-4 py-4">
                      <div className="h-5 w-16 shimmer rounded-sm" />
                    </td>
                    <td className="px-4 py-4">
                      <div className="h-4 w-28 shimmer rounded-sm" />
                    </td>
                    <td className="px-4 py-4 text-right">
                      <div className="flex items-center justify-end space-x-2">
                        <div className="h-6 w-16 shimmer rounded-sm" />
                        <div className="h-6 w-14 shimmer rounded-sm" />
                      </div>
                    </td>
                  </tr>
                ))
              ) : approvals.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-zinc-500">
                    No approval requests found.
                  </td>
                </tr>
              ) : (
                approvals.map((app) => {
                  const isPending = app.status === "PENDING";
                  return (
                    <tr key={app.id} className="hover:bg-zinc-900/30 transition-colors">
                      <td className="px-4 py-3 font-semibold text-zinc-400">{app.id}</td>
                      <td className="px-4 py-3 text-zinc-200">
                        {app.tool_name === "multiple_tool_calls" ? (
                          <span className="text-amber-400 font-bold">multiple parallel tools</span>
                        ) : (
                          app.tool_name
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-2xs font-bold ${
                            app.status === "APPROVED"
                              ? "bg-green-500/10 text-green-400 border border-green-500/20"
                              : app.status === "REJECTED"
                              ? "bg-red-500/10 text-red-400 border border-red-500/20"
                              : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                          }`}
                        >
                          {app.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-zinc-500">{formatDateStr(app.createdAt)}</td>
                      <td className="px-4 py-3 text-right">
                        {isPending ? (
                          <div className="flex items-center justify-end space-x-2">
                            <button
                              onClick={() => handleAction(app.id, onApprove)}
                              disabled={actioningId !== null}
                              className="inline-flex items-center space-x-1 px-2 py-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-mono text-2xs rounded-sm transition-colors duration-150"
                            >
                              <Check className="h-3 w-3" />
                              <span>Approve</span>
                            </button>
                            <button
                              onClick={() => handleAction(app.id, onReject)}
                              disabled={actioningId !== null}
                              className="inline-flex items-center space-x-1 px-2 py-1 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-50 border border-zinc-800 text-red-500 font-mono text-2xs rounded-sm transition-colors duration-150"
                            >
                              <X className="h-3 w-3" />
                              <span>Reject</span>
                            </button>
                          </div>
                        ) : (
                          <span className="text-zinc-600 text-2xs">Completed</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
