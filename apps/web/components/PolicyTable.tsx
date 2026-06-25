"use client";

import React, { useState } from "react";
import { Plus, Edit2, Trash2, ShieldAlert, Check, AlertCircle } from "lucide-react";
import { Policy, PolicyAction, McpTool } from "../services/policies";

interface PolicyTableProps {
  policies: Policy[];
  mcpTools: McpTool[];
  onAddPolicy: (toolName: string, action: PolicyAction) => Promise<void>;
  onUpdatePolicy: (toolName: string, action: PolicyAction) => Promise<void>;
  onDeletePolicy: (toolName: string) => Promise<void>;
  loading: boolean;
}

export default function PolicyTable({
  policies,
  mcpTools,
  onAddPolicy,
  onUpdatePolicy,
  onDeletePolicy,
  loading,
}: PolicyTableProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<Policy | null>(null);
  const [toolName, setToolName] = useState("");
  const [action, setAction] = useState<PolicyAction>("APPROVAL");
  const [actionLoading, setActionLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const handleOpenAdd = () => {
    setEditingPolicy(null);
    setToolName(mcpTools.length > 0 ? (mcpTools[0]?.name ?? "") : "");
    setAction("APPROVAL");
    setErrorMsg("");
    setIsOpen(true);
  };

  const handleOpenEdit = (policy: Policy) => {
    setEditingPolicy(policy);
    setToolName(policy.tool_name);
    setAction(policy.action);
    setErrorMsg("");
    setIsOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!toolName.trim()) {
      setErrorMsg("Tool name is required");
      return;
    }
    setErrorMsg("");
    setActionLoading(true);
    try {
      if (editingPolicy) {
        await onUpdatePolicy(toolName, action);
      } else {
        // Check if policy already exists
        const exists = policies.some((p) => p.tool_name.toLowerCase() === toolName.trim().toLowerCase());
        if (exists) {
          setErrorMsg("A policy already exists for this tool name.");
          setActionLoading(false);
          return;
        }
        await onAddPolicy(toolName.trim(), action);
      }
      setIsOpen(false);
    } catch (err: any) {
      setErrorMsg(err.response?.data?.error || "Failed to save policy.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async (toolName: string) => {
    if (confirm(`Are you sure you want to delete the policy for ${toolName}?`)) {
      try {
        await onDeletePolicy(toolName);
      } catch (err) {
        alert("Failed to delete policy");
      }
    }
  };

  return (
    <div className="space-y-4">
      {/* Header and Add button */}
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <h2 className="text-lg font-mono font-bold tracking-tight text-white">Policies</h2>
          <p className="text-xs text-zinc-500">Define authorization rules for incoming agent tool calls.</p>
        </div>
        <button
          onClick={handleOpenAdd}
          className="flex items-center space-x-1.5 px-3 py-1.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-900 font-mono text-xs font-bold rounded-sm transition-colors duration-150"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>Add Policy</span>
        </button>
      </div>

      {/* Table */}
      <div className="border border-zinc-800 bg-zinc-950 rounded-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-900/50 font-mono text-2xs uppercase text-zinc-500">
                <th className="px-4 py-3">Tool Name</th>
                <th className="px-4 py-3">Action</th>
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
                      <div className="h-5 w-16 shimmer rounded-sm" />
                    </td>
                    <td className="px-4 py-4 text-right">
                      <div className="flex items-center justify-end space-x-3">
                        <div className="h-3 w-10 shimmer rounded-sm" />
                        <div className="h-3 w-12 shimmer rounded-sm" />
                      </div>
                    </td>
                  </tr>
                ))
              ) : policies.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-zinc-500">
                    No policies defined. All tools default to APPROVAL.
                  </td>
                </tr>
              ) : (
                policies.map((policy) => (
                  <tr key={policy.tool_name} className="hover:bg-zinc-900/30 transition-colors">
                    <td className="px-4 py-3 font-semibold text-zinc-200">{policy.tool_name}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-2xs font-bold ${
                          policy.action === "ALLOW"
                            ? "bg-green-500/10 text-green-400 border border-green-500/20"
                            : policy.action === "DENY"
                            ? "bg-red-500/10 text-red-400 border border-red-500/20"
                            : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                        }`}
                      >
                        {policy.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end space-x-3">
                        <button
                          onClick={() => handleOpenEdit(policy)}
                          className="text-zinc-400 hover:text-zinc-100 flex items-center space-x-1"
                        >
                          <Edit2 className="h-3 w-3" />
                          <span>Edit</span>
                        </button>
                        <button
                          onClick={() => handleDelete(policy.tool_name)}
                          className="text-zinc-600 hover:text-red-400 flex items-center space-x-1"
                        >
                          <Trash2 className="h-3 w-3" />
                          <span>Delete</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Dialog */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="w-full max-w-md border border-zinc-800 bg-zinc-950 rounded-sm overflow-hidden flex flex-col">
            {/* Header */}
            <div className="border-b border-zinc-800 bg-zinc-900/50 px-4 py-3 flex items-center justify-between">
              <span className="font-mono font-bold text-xs text-white">
                {editingPolicy ? "EDIT POLICY" : "CREATE NEW POLICY"}
              </span>
              <button
                onClick={() => setIsOpen(false)}
                className="text-zinc-500 hover:text-zinc-300 font-mono text-xs"
              >
                ✕
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSave} className="p-4 space-y-4">
              {errorMsg && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-sm text-red-400 font-mono text-2xs flex items-start space-x-2">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="font-mono text-3xs text-zinc-500 uppercase block">Tool Name</label>
                {editingPolicy ? (
                  <input
                    type="text"
                    disabled
                    value={toolName}
                    className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 text-zinc-400 font-mono rounded-sm text-sm focus:outline-none opacity-60"
                  />
                ) : (
                  <select
                    value={toolName}
                    onChange={(e) => setToolName(e.target.value)}
                    className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 text-zinc-200 font-mono rounded-sm text-sm focus:outline-none focus:border-zinc-500"
                  >
                    {mcpTools.length === 0 ? (
                      <option value="">No tools discovered</option>
                    ) : (
                      mcpTools.map((tool) => (
                        <option key={tool.name} value={tool.name}>
                          {tool.name} ({tool.server})
                        </option>
                      ))
                    )}
                  </select>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="font-mono text-3xs text-zinc-500 uppercase block">Action</label>
                <select
                  value={action}
                  onChange={(e) => setAction(e.target.value as PolicyAction)}
                  className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 text-zinc-200 font-mono rounded-sm text-sm focus:outline-none focus:border-zinc-500"
                >
                  <option value="ALLOW">ALLOW (Auto execute)</option>
                  <option value="APPROVAL">APPROVAL (Require manual review)</option>
                  <option value="DENY">DENY (Block completely)</option>
                </select>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end space-x-2 pt-2 border-t border-zinc-900">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 font-mono text-xs rounded-sm transition-colors duration-150"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading || (!editingPolicy && !toolName)}
                  className="flex items-center space-x-1.5 px-3 py-1.5 bg-zinc-100 hover:bg-zinc-200 disabled:opacity-50 text-zinc-900 font-mono text-xs font-bold rounded-sm transition-colors duration-150"
                >
                  <Check className="h-3.5 w-3.5" />
                  <span>{actionLoading ? "Saving..." : "Save Policy"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
