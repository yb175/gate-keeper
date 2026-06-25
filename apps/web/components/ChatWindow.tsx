"use client";

import React, { useRef, useEffect } from "react";
import { Send, AlertTriangle, Play, XOctagon, CheckCircle } from "lucide-react";
import { ChatMessage } from "../services/agent";

interface ChatWindowProps {
  messages: ChatMessage[];
  inputValue: string;
  setInputValue: (val: string) => void;
  onSend: () => void;
  onApprove: (approvalId: string) => void;
  onReject: (approvalId: string) => void;
  loading: boolean;
  pendingApprovalId?: string | null;
  pendingToolName?: string | null;
  pendingApprovalStatus?: "PENDING" | "APPROVED" | "REJECTED" | null;
  conversationId: string;
}

export default function ChatWindow({
  messages,
  inputValue,
  setInputValue,
  onSend,
  onApprove,
  onReject,
  loading,
  pendingApprovalId,
  pendingToolName,
  pendingApprovalStatus,
  conversationId,
}: ChatWindowProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, pendingApprovalId]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!loading && inputValue.trim()) {
        onSend();
      }
    }
  };

  // Helper to determine if a message is a tool trace
  const parseToolTrace = (content: string) => {
    if (content.startsWith("Call tool ") || content.startsWith("Result: ") || content.startsWith("Call parallel tools:")) {
      return true;
    }
    try {
      // Check if it's a JSON response from a tool execution
      const parsed = JSON.parse(content);
      if (parsed && typeof parsed === "object" && ("result" in parsed || "isError" in parsed)) {
        return true;
      }
    } catch (e) {}
    return false;
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-[500px]">
      {/* Left side: Conversation history */}
      <div className="lg:col-span-8 flex flex-col border border-zinc-800 bg-zinc-950 rounded-sm overflow-hidden h-[600px]">
        {/* Header */}
        <div className="border-b border-zinc-800 bg-zinc-900/50 px-4 py-3 flex items-center justify-between">
          <span className="font-mono text-xs text-zinc-400">CONVERSATION: {conversationId}</span>
          {pendingApprovalId && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-2xs font-mono font-medium bg-amber-500/10 text-amber-500 border border-amber-500/20">
              PAUSED / AWAITING APPROVAL
            </span>
          )}
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 ? (
            <div className="h-full flex items-center justify-center text-zinc-500 font-mono text-xs">
              No messages yet. Send a prompt to start the agent.
            </div>
          ) : (
            messages.map((msg, index) => {
              const isUser = msg.role === "user";
              const isTool = msg.role === "tool" || (!isUser && parseToolTrace(msg.content));

              if (isTool) {
                return (
                  <div key={index} className="flex flex-col space-y-1.5 p-3 rounded-sm bg-zinc-900/50 border border-zinc-800 font-mono text-xs max-w-full overflow-x-auto">
                    <div className="flex items-center justify-between text-zinc-500 border-b border-zinc-800 pb-1 mb-1">
                      <span>TOOL TRACE</span>
                      <span>{msg.role.toUpperCase()}</span>
                    </div>
                    <pre className="text-zinc-300 font-mono whitespace-pre-wrap">{msg.content}</pre>
                  </div>
                );
              }

              return (
                <div
                  key={index}
                  className={`flex flex-col space-y-1 max-w-[85%] ${
                    isUser ? "ml-auto items-end" : "mr-auto items-start"
                  }`}
                >
                  <span className="font-mono text-3xs text-zinc-500 uppercase">
                    {isUser ? "User" : "Assistant"}
                  </span>
                  <div
                    className={`px-3 py-2 rounded-sm text-sm whitespace-pre-wrap ${
                      isUser
                        ? "bg-zinc-100 text-zinc-900 border border-zinc-200"
                        : "bg-zinc-900 text-zinc-100 border border-zinc-800"
                    }`}
                  >
                    {msg.content}
                  </div>
                </div>
              );
            })
          )}

          {/* Pending Approval Card */}
          {pendingApprovalId && (
            <div className={`border rounded-sm p-4 space-y-4 max-w-md ${
              pendingApprovalStatus === "APPROVED"
                ? "border-green-500/20 bg-green-500/5"
                : pendingApprovalStatus === "REJECTED"
                ? "border-red-500/20 bg-red-500/5"
                : "border-amber-500/20 bg-amber-500/5 animate-pulse"
            }`}>
              <div className="flex items-start space-x-3">
                {pendingApprovalStatus === "APPROVED" ? (
                  <CheckCircle className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
                ) : pendingApprovalStatus === "REJECTED" ? (
                  <XOctagon className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                )}
                
                <div className="space-y-1">
                  <h4 className={`text-sm font-bold ${
                    pendingApprovalStatus === "APPROVED"
                      ? "text-green-500"
                      : pendingApprovalStatus === "REJECTED"
                      ? "text-red-500"
                      : "text-amber-500"
                  }`}>
                    {pendingApprovalStatus === "APPROVED"
                      ? "Action Approved"
                      : pendingApprovalStatus === "REJECTED"
                      ? "Action Rejected"
                      : "Approval Required"}
                  </h4>
                  <p className="text-xs text-zinc-400">
                    {pendingApprovalStatus === "APPROVED"
                      ? "The tool call for "
                      : pendingApprovalStatus === "REJECTED"
                      ? "The tool call for "
                      : "The agent requested to run tool "}
                    <code className={`bg-zinc-900 px-1 py-0.5 rounded font-mono text-xs ${
                      pendingApprovalStatus === "APPROVED"
                        ? "text-green-400"
                        : pendingApprovalStatus === "REJECTED"
                        ? "text-red-400"
                        : "text-amber-400"
                    }`}>
                      {pendingToolName === "multiple_tool_calls" ? "multiple parallel tools" : (pendingToolName || "unknown_tool")}
                    </code>
                    {pendingApprovalStatus === "APPROVED"
                      ? " has been approved. Execution can be resumed."
                      : pendingApprovalStatus === "REJECTED"
                      ? " has been rejected. Resuming will abort the execution."
                      : ". Execution is paused."}
                  </p>
                  <p className="text-3xs font-mono text-zinc-500">APPROVAL ID: {pendingApprovalId}</p>
                </div>
              </div>

              <div className="flex items-center space-x-2 pt-2">
                {pendingApprovalStatus === "APPROVED" ? (
                  <button
                    onClick={() => onApprove(pendingApprovalId)}
                    disabled={loading}
                    className="flex items-center justify-center space-x-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-mono text-xs rounded-sm transition-colors duration-150"
                  >
                    <Play className="h-3.5 w-3.5" />
                    <span>Resume Execution</span>
                  </button>
                ) : pendingApprovalStatus === "REJECTED" ? (
                  <button
                    onClick={() => onReject(pendingApprovalId)}
                    disabled={loading}
                    className="flex items-center justify-center space-x-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-mono text-xs rounded-sm transition-colors duration-150"
                  >
                    <XOctagon className="h-3.5 w-3.5" />
                    <span>Report Rejection</span>
                  </button>
                ) : (
                  <>
                    <button
                      onClick={() => onApprove(pendingApprovalId)}
                      disabled={loading}
                      className="flex items-center justify-center space-x-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-mono text-xs rounded-sm transition-colors duration-150"
                    >
                      <Play className="h-3.5 w-3.5" />
                      <span>Approve & Execute</span>
                    </button>
                    <button
                      onClick={() => onReject(pendingApprovalId)}
                      disabled={loading}
                      className="flex items-center justify-center space-x-1.5 px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-50 border border-zinc-800 text-red-500 font-mono text-xs rounded-sm transition-colors duration-150"
                    >
                      <XOctagon className="h-3.5 w-3.5" />
                      <span>Reject Action</span>
                    </button>
                  </>
                )}
              </div>
            </div>
          )}

          {loading && !pendingApprovalId && (
            <div className="flex flex-col space-y-1.5 max-w-[80%] mr-auto items-start w-full">
              <span className="font-mono text-3xs text-zinc-500 uppercase">Assistant</span>
              <div className="w-full p-4 rounded-sm bg-zinc-900 border border-zinc-800 space-y-3">
                <div className="h-3 w-1/3 shimmer rounded-sm" />
                <div className="space-y-2">
                  <div className="h-2 w-full shimmer rounded-sm" />
                  <div className="h-2 w-11/12 shimmer rounded-sm" />
                  <div className="h-2 w-4/5 shimmer rounded-sm" />
                </div>
                <div className="flex items-center space-x-2 text-3xs text-zinc-500 font-mono pt-1">
                  <span className="w-1 h-1 bg-zinc-500 rounded-full animate-ping"></span>
                  <span>Agent is executing...</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right side: Input and settings */}
      <div className="lg:col-span-4 flex flex-col space-y-4">
        <div className="border border-zinc-800 bg-zinc-950 rounded-sm p-4 space-y-4">
          <h3 className="font-mono font-bold text-xs text-zinc-300 uppercase tracking-wider">Command Panel</h3>
          
          <div className="space-y-1.5">
            <label className="font-mono text-3xs text-zinc-500 uppercase block">Input Command</label>
            <textarea
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={loading && !pendingApprovalId}
              placeholder="e.g. Delete sandbox/test.txt"
              className="w-full h-32 px-3 py-2 bg-zinc-900 border border-zinc-800 text-zinc-100 placeholder-zinc-600 rounded-sm text-sm focus:outline-none focus:border-zinc-500 disabled:opacity-50 resize-none"
            />
          </div>

          <button
            onClick={onSend}
            disabled={loading || !inputValue.trim()}
            className="w-full flex items-center justify-center space-x-2 py-2 bg-zinc-100 hover:bg-zinc-200 disabled:opacity-50 text-zinc-900 font-mono text-xs font-bold rounded-sm transition-colors duration-150"
          >
            <Send className="h-3.5 w-3.5" />
            <span>{pendingApprovalId ? "Continue Conversation" : "Execute Prompt"}</span>
          </button>
        </div>

        <div className="border border-zinc-800 bg-zinc-950/50 rounded-sm p-4 space-y-2">
          <h4 className="font-mono text-3xs text-zinc-400 uppercase">Dashboard Tips</h4>
          <ul className="text-2xs text-zinc-500 space-y-1.5 list-disc pl-3">
            <li>Type any operation you want the agent to execute.</li>
            <li>If the tool requires review, the execution will pause and request your verification.</li>
            <li>You can review security rules in the <strong>Policies</strong> tab.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
