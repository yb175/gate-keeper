"use client";

import React, { useState, useEffect } from "react";
import LogsTable from "../../components/LogsTable";
import { getLogs, resetLogs, Log } from "../../services/logs";

export default function LogsPage() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);

  let cancelledRef = React.useRef(false);

  useEffect(() => {
    cancelledRef.current = false;
    return () => {
      cancelledRef.current = true;
    };
  }, []);

  const fetchLogsData = async () => {
    try {
      const data = await getLogs();
      if (!cancelledRef.current) {
        setLogs(data);
      }
    } catch (err) {
      console.error("Failed to fetch logs", err);
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
      await fetchLogsData();
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
