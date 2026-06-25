"use client";

import React, { useState, useEffect } from "react";
import PolicyTable from "../../components/PolicyTable";
import {
  getPolicies,
  createPolicy,
  updatePolicy,
  deletePolicy,
  Policy,
  PolicyAction,
  getMcpTools,
  McpTool,
} from "../../services/policies";

export default function PoliciesPage() {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [mcpTools, setMcpTools] = useState<McpTool[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [policiesData, mcpToolsData] = await Promise.all([
        getPolicies(),
        getMcpTools(),
      ]);
      setPolicies(policiesData);
      setMcpTools(mcpToolsData);
    } catch (err) {
      console.error("Failed to fetch policies or mcp tools", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleAddPolicy = async (toolName: string, action: PolicyAction) => {
    await createPolicy(toolName, action);
    await fetchData(); // refresh list
  };

  const handleUpdatePolicy = async (toolName: string, action: PolicyAction) => {
    await updatePolicy(toolName, action);
    await fetchData();
  };

  const handleDeletePolicy = async (toolName: string) => {
    await deletePolicy(toolName);
    await fetchData();
  };

  return (
    <div className="space-y-6">
      <PolicyTable
        policies={policies}
        mcpTools={mcpTools}
        onAddPolicy={handleAddPolicy}
        onUpdatePolicy={handleUpdatePolicy}
        onDeletePolicy={handleDeletePolicy}
        loading={loading}
      />
    </div>
  );
}
