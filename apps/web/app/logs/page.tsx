"use client";

import React, { useState, useEffect } from "react";
import LogsTable from "../../components/LogsTable";
import { getLogs, resetLogs, Log } from "../../services/logs";

export default function LogsPage() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLogsData = async () => {
    try {
      const data = await getLogs();
      setLogs(data);
    } catch (err) {
      console.error("Failed to fetch logs", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      await fetchLogsData();
      if (!cancelled) {
        // Only schedule the next fetch after the previous one completes
        setTimeout(poll, 5000);
      }
    };

    poll();
    return () => { cancelled = true; };
  }, []);

  const handleResetLogs = async () => {
    if (confirm("Are you sure you want to clear all decision logs from the database?")) {
      try {
        await resetLogs();
        await fetchLogsData();
      } catch (err) {
        alert("Failed to reset logs");
      }
    }
  };

  return (
    <div className="space-y-6">
      <LogsTable logs={logs} loading={loading} onResetLogs={handleResetLogs} />
    </div>
  );
}
