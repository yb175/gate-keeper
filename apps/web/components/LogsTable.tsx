"use client";

import React from "react";
import { Log } from "../services/logs";

interface LogsTableProps {
  logs: Log[];
  loading: boolean;
  onResetLogs: () => Promise<void>;
}

export default function LogsTable({
  logs,
  loading,
  onResetLogs,
}: LogsTableProps) {
  const formatDateStr = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return date.toISOString().replace("T", " ").substring(0, 19);
    } catch (e) {
      return dateStr;
    }
  };

  const parseLogReason = (logReason?: string) => {
    if (!logReason) return { conversationId: "-", reasonText: "-" };
    if (logReason.startsWith("Conversation: ")) {
      const parts = logReason.substring("Conversation: ".length).split(" | ");
      const conversationId = parts[0] || "-";
      const reasonText = parts.slice(1).join(" | ") || "-";
      return { conversationId, reasonText };
    }
    return { conversationId: "-", reasonText: logReason };
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <h2 className="text-lg font-mono font-bold tracking-tight text-white">
            Decision Logs
          </h2>
          <p className="text-xs text-zinc-500">
            Audit trail of security decisions made by the GateKeeper engine.
          </p>
        </div>
        <button
          onClick={onResetLogs}
          className="flex items-center space-x-1.5 px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-red-500 font-mono text-xs rounded-sm transition-colors duration-150"
        >
          <span>Reset Logs</span>
        </button>
      </div>

      <div className="border border-zinc-800 bg-zinc-950 rounded-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-900/50 font-mono text-2xs uppercase text-zinc-500">
                <th className="px-4 py-3">Timestamp</th>
                <th className="px-4 py-3">Conversation</th>
                <th className="px-4 py-3">Tool</th>
                <th className="px-4 py-3">Decision</th>
                <th className="px-4 py-3">Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-900 font-mono text-xs text-zinc-300">
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i} className="border-b border-zinc-900/50">
                    <td className="px-4 py-4">
                      <div className="h-4 w-28 shimmer rounded-sm" />
                    </td>
                    <td className="px-4 py-4">
                      <div className="h-4 w-24 shimmer rounded-sm" />
                    </td>
                    <td className="px-4 py-4">
                      <div className="h-4 w-20 shimmer rounded-sm" />
                    </td>
                    <td className="px-4 py-4">
                      <div className="h-5 w-16 shimmer rounded-sm" />
                    </td>
                    <td className="px-4 py-4">
                      <div className="h-4 w-48 shimmer rounded-sm" />
                    </td>
                  </tr>
                ))
              ) : logs.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-8 text-center text-zinc-500 font-mono"
                  >
                    No logs found.
                  </td>
                </tr>
              ) : (
                logs.map((log) => {
                  const { conversationId, reasonText } = parseLogReason(
                    log.reason,
                  );
                  return (
                    <tr
                      key={log.id}
                      className="hover:bg-zinc-900/30 transition-colors"
                    >
                      <td className="px-4 py-3 text-zinc-500">
                        {formatDateStr(log.createdAt)}
                      </td>
                      <td className="px-4 py-3 text-zinc-400 font-medium">
                        {conversationId}
                      </td>
                      <td className="px-4 py-3 text-zinc-200">
                        {log.tool_name}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-2xs font-bold ${
                            log.decision === "ALLOW"
                              ? "bg-green-500/10 text-green-400 border border-green-500/20"
                              : log.decision === "DENY"
                                ? "bg-red-500/10 text-red-400 border border-red-500/20"
                                : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                          }`}
                        >
                          {log.decision}
                        </span>
                      </td>
                      <td
                        className="px-4 py-3 text-zinc-400 max-w-xs truncate"
                        title={reasonText}
                      >
                        {reasonText}
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
