"use client";

import React, { useState } from "react";
import {
  Plus,
  Edit2,
  Trash2,
  ShieldAlert,
  Check,
  AlertCircle,
} from "lucide-react";
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
  const [editingToolName, setEditingToolName] = useState<string | null>(null);
  const [editingAction, setEditingAction] = useState<PolicyAction>("APPROVAL");
  const [isAddingInline, setIsAddingInline] = useState(false);
  const [newToolName, setNewToolName] = useState("");
  const [newAction, setNewAction] = useState<PolicyAction>("APPROVAL");
  const [actionLoading, setActionLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const availableTools = mcpTools.filter(
    (t) =>
      !policies.some(
        (p) => p.tool_name.trim().toLowerCase() === t.name.trim().toLowerCase(),
      ),
  );

  const handleOpenAdd = () => {
    setNewToolName(availableTools[0]?.name || "");
    setNewAction("APPROVAL");
    setErrorMsg("");
    setIsAddingInline(true);
    setEditingToolName(null);
  };

  const handleStartEdit = (policy: Policy) => {
    setEditingToolName(policy.tool_name);
    setEditingAction(policy.action);
    setErrorMsg("");
    setIsAddingInline(false);
  };

  const handleSaveEdit = async (toolName: string) => {
    setErrorMsg("");
    setActionLoading(true);
    try {
      await onUpdatePolicy(toolName, editingAction);
      setEditingToolName(null);
    } catch (err: any) {
      setErrorMsg(err.response?.data?.error || "Failed to update policy.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleSaveNew = async () => {
    if (!newToolName) {
      setErrorMsg("Tool name is required");
      return;
    }
    setErrorMsg("");
    setActionLoading(true);
    try {
      const exists = policies.some(
        (p) => p.tool_name.toLowerCase() === newToolName.trim().toLowerCase(),
      );
      if (exists) {
        setErrorMsg("A policy already exists for this tool name.");
        setActionLoading(false);
        return;
      }
      await onAddPolicy(newToolName, newAction);
      setIsAddingInline(false);
    } catch (err: any) {
      setErrorMsg(err.response?.data?.error || "Failed to add policy.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async (toolName: string) => {
    if (
      confirm(`Are you sure you want to delete the policy for ${toolName}?`)
    ) {
      try {
        await onDeletePolicy(toolName);
      } catch (err) {
        setErrorMsg("Failed to delete policy");
      }
    }
  };

  return (
    <div className="space-y-4">
      {/* Header and Add button */}
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <h2 className="text-lg font-mono font-bold tracking-tight text-white">
            Policies
          </h2>
          <p className="text-xs text-zinc-500">
            Define authorization rules for incoming agent tool calls.
          </p>
        </div>
        <button
          onClick={handleOpenAdd}
          className="flex items-center space-x-1.5 px-3 py-1.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-900 font-mono text-xs font-bold rounded-sm transition-colors duration-150"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>Add Policy</span>
        </button>
      </div>

      {errorMsg && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-sm text-red-400 font-mono text-xs flex items-center justify-between animate-fadeIn">
          <div className="flex items-center space-x-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button
            onClick={() => setErrorMsg("")}
            className="text-red-500 hover:text-red-400 font-bold font-mono"
          >
            ✕
          </button>
        </div>
      )}

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
              {/* Inline Add Row */}
              {isAddingInline && (
                <tr className="bg-zinc-900/50 border-b border-zinc-900">
                  <td className="px-4 py-2">
                    {availableTools.length === 0 ? (
                      <span className="text-zinc-500 font-mono text-xs italic">
                        All tools configured
                      </span>
                    ) : (
                      <select
                        value={newToolName}
                        onChange={(e) => setNewToolName(e.target.value)}
                        className="px-2 py-1 bg-zinc-900 border border-zinc-800 text-zinc-200 font-mono rounded-sm text-xs focus:outline-none focus:border-zinc-500"
                      >
                        {availableTools.map((t) => (
                          <option key={t.name} value={t.name}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <select
                      value={newAction}
                      onChange={(e) =>
                        setNewAction(e.target.value as PolicyAction)
                      }
                      className="px-2 py-1 bg-zinc-900 border border-zinc-800 text-zinc-200 font-mono rounded-sm text-xs focus:outline-none focus:border-zinc-500"
                    >
                      <option value="ALLOW">ALLOW</option>
                      <option value="APPROVAL">APPROVAL</option>
                      <option value="DENY">DENY</option>
                    </select>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <div className="flex items-center justify-end space-x-2">
                      <button
                        onClick={handleSaveNew}
                        disabled={actionLoading || availableTools.length === 0}
                        className="px-2.5 py-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-mono text-2xs rounded-sm transition-colors duration-150"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setIsAddingInline(false)}
                        className="px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 font-mono text-2xs rounded-sm transition-colors duration-150"
                      >
                        Cancel
                      </button>
                    </div>
                  </td>
                </tr>
              )}

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
              ) : policies.length === 0 && !isAddingInline ? (
                <tr>
                  <td
                    colSpan={3}
                    className="px-4 py-8 text-center text-zinc-500"
                  >
                    No policies defined. All tools default to APPROVAL.
                  </td>
                </tr>
              ) : (
                policies.map((policy) => {
                  const isEditing = editingToolName === policy.tool_name;
                  return (
                    <tr
                      key={policy.tool_name}
                      className="hover:bg-zinc-900/30 transition-colors"
                    >
                      <td className="px-4 py-3 font-semibold text-zinc-200">
                        {policy.tool_name}
                      </td>
                      <td className="px-4 py-3">
                        {isEditing ? (
                          <select
                            value={editingAction}
                            onChange={(e) =>
                              setEditingAction(e.target.value as PolicyAction)
                            }
                            className="px-2 py-1 bg-zinc-900 border border-zinc-800 text-zinc-200 font-mono rounded-sm text-xs focus:outline-none focus:border-zinc-500"
                          >
                            <option value="ALLOW">ALLOW</option>
                            <option value="APPROVAL">APPROVAL</option>
                            <option value="DENY">DENY</option>
                          </select>
                        ) : (
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
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {isEditing ? (
                          <div className="flex items-center justify-end space-x-2">
                            <button
                              onClick={() => handleSaveEdit(policy.tool_name)}
                              disabled={actionLoading}
                              className="px-2.5 py-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-mono text-2xs rounded-sm transition-colors duration-150"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => setEditingToolName(null)}
                              className="px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 font-mono text-2xs rounded-sm transition-colors duration-150"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end space-x-3">
                            <button
                              onClick={() => handleStartEdit(policy)}
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
