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
  const [error, setError] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleAction = async (
    id: string,
    actionFn: (id: string) => Promise<void>,
  ) => {
    setActioningId(id);
    setError(null);
    try {
      await actionFn(id);
    } catch (err: any) {
      setError(
        err.response?.data?.error || err.message || "Failed to complete action",
      );
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
        <h2 className="text-lg font-mono font-bold tracking-tight text-white">
          Approvals
        </h2>
        <p className="text-xs text-zinc-500">
          Track and respond to manual verification requests from your agent.
          Click a tool name to inspect parameters.
        </p>
      </div>

      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-sm text-red-400 font-mono text-xs flex items-center justify-between animate-fadeIn">
          <div className="flex items-center space-x-2">
            <ShieldAlert className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={() => setError(null)}
            className="text-red-500 hover:text-red-400 font-bold font-mono"
          >
            ✕
          </button>
        </div>
      )}

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
                  <td
                    colSpan={5}
                    className="px-4 py-8 text-center text-zinc-500"
                  >
                    No approval requests found.
                  </td>
                </tr>
              ) : (
                approvals.map((app) => {
                  const isPending = app.status === "PENDING";
                  const isExpanded = !!expandedIds[app.id];
                  return (
                    <React.Fragment key={app.id}>
                      <tr className="hover:bg-zinc-900/30 transition-colors border-b border-zinc-900">
                        <td className="px-4 py-3 font-semibold text-zinc-400">
                          {app.id}
                        </td>
                        <td className="px-4 py-3 text-zinc-200">
                          <button
                            onClick={() => toggleExpand(app.id)}
                            className="flex items-center space-x-1.5 text-zinc-300 hover:text-white transition-colors duration-150 text-left font-mono focus:outline-none"
                          >
                            <span className="text-zinc-500 font-normal text-3xs">
                              {isExpanded ? "▼" : "▶"}
                            </span>
                            {app.tool_name === "multiple_tool_calls" ? (
                              <span className="text-amber-400 font-bold">
                                multiple parallel tools
                              </span>
                            ) : (
                              <span>{app.tool_name}</span>
                            )}
                          </button>
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
                        <td className="px-4 py-3 text-zinc-500">
                          {formatDateStr(app.createdAt)}
                        </td>
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
                            <span className="text-zinc-600 text-2xs">
                              Completed
                            </span>
                          )}
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="bg-zinc-900/10 border-b border-zinc-900">
                          <td colSpan={5} className="px-4 py-3">
                            <div className="bg-zinc-950 p-3 rounded-sm border border-zinc-800 space-y-2">
                              <div className="font-bold text-zinc-500 text-2xs uppercase tracking-wider">
                                Arguments Inspector
                              </div>
                              {app.tool_name === "multiple_tool_calls" ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                  {(
                                    (app.arguments as any)?.tool_calls || []
                                  ).map((tc: any, idx: number) => (
                                    <div
                                      key={idx}
                                      className="bg-zinc-900 p-2.5 rounded-sm border border-zinc-800 space-y-1"
                                    >
                                      <div className="text-amber-400 text-2xs font-bold font-mono">
                                        Tool: {tc.tool_name}
                                      </div>
                                      <pre className="text-zinc-300 font-mono text-2xs overflow-x-auto p-1.5 bg-zinc-950 rounded-sm">
                                        {JSON.stringify(tc.arguments, null, 2)}
                                      </pre>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <pre className="text-zinc-300 font-mono text-2xs overflow-x-auto p-2 bg-zinc-900 rounded-sm border border-zinc-800">
                                  {JSON.stringify(app.arguments, null, 2)}
                                </pre>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
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
