"use client";

import React, { useEffect, useRef } from "react";
import { useSelector, useDispatch } from "react-redux";
import ChatWindow from "../../components/ChatWindow";
import { runAgentMessage, ChatMessage } from "../../services/agent";
import { approveRequest, rejectRequest, getApprovals } from "../../services/approvals";
import { RootState } from "../../store";
import {
  setMessages,
  setInputValue,
  setLoading,
  setPendingApproval,
  hydrateChatState,
  clearChatState,
} from "../../store/chatSlice";

function isValidChatMessage(msg: any): msg is ChatMessage {
  return (
    msg &&
    typeof msg === "object" &&
    (msg.role === "user" || msg.role === "assistant" || msg.role === "tool") &&
    typeof msg.content === "string"
  );
}

function validateChatMessages(messages: any): ChatMessage[] {
  if (!Array.isArray(messages)) return [];
  return messages.filter(isValidChatMessage);
}

export default function ChatPage() {
  const dispatch = useDispatch();

  const conversationId = useSelector((state: RootState) => state.chat.conversationId);
  const messages = useSelector((state: RootState) => state.chat.messages);
  const inputValue = useSelector((state: RootState) => state.chat.inputValue);
  const loading = useSelector((state: RootState) => state.chat.loading);
  const pendingApprovalId = useSelector((state: RootState) => state.chat.pendingApprovalId);
  const pendingToolName = useSelector((state: RootState) => state.chat.pendingToolName);
  const pendingApprovalStatus = useSelector((state: RootState) => state.chat.pendingApprovalStatus);
  const isHydrated = useSelector((state: RootState) => state.chat.isHydrated);

  // Load state on mount if not hydrated
  useEffect(() => {
    if (!isHydrated) {
      const savedConvId = localStorage.getItem("gatekeeper_conversationId");
      const savedMessages = localStorage.getItem("gatekeeper_messages");
      const savedPendingApprovalId = localStorage.getItem("gatekeeper_pendingApprovalId");
      const savedPendingToolName = localStorage.getItem("gatekeeper_pendingToolName");
      const rawStatus = localStorage.getItem("gatekeeper_pendingApprovalStatus");
      
      const savedPendingApprovalStatus = (rawStatus === "PENDING" || rawStatus === "APPROVED" || rawStatus === "REJECTED")
        ? (rawStatus as "PENDING" | "APPROVED" | "REJECTED")
        : null;

      let parsedMessages: ChatMessage[] = [];
      if (savedMessages) {
        try {
          const parsed = JSON.parse(savedMessages);
          parsedMessages = validateChatMessages(parsed);
        } catch (e) {
          console.error("Error parsing saved messages", e);
        }
      }

      const conversationId = savedConvId || `conv_${Math.random().toString(36).substring(2, 9)}`;

      dispatch(hydrateChatState({
        conversationId,
        messages: parsedMessages,
        pendingApprovalId: savedPendingApprovalId,
        pendingToolName: savedPendingToolName,
        pendingApprovalStatus: savedPendingApprovalStatus,
      }));
    }
  }, [dispatch, isHydrated]);
 
  const handleNewChat = () => {
    if (confirm("Are you sure you want to clear the chat history and start a new session?")) {
      const newId = `conv_${Math.random().toString(36).substring(2, 9)}`;
      dispatch(clearChatState(newId));
    }
  };

  const handleSend = async () => {
    if (!inputValue.trim() || loading) return;

    const userPrompt = inputValue;
    dispatch(setInputValue(""));
    dispatch(setLoading(true));

    // If we were waiting for approval but user chose to type message instead, clear approval state
    if (pendingApprovalId) {
      dispatch(setPendingApproval({ id: null, toolName: null }));
    }

    // Optimistically add user message to list
    const updatedMessages = [...messages, { role: "user", content: userPrompt } as ChatMessage];
    dispatch(setMessages(updatedMessages));

    try {
      // Call agent endpoint
      const res = await runAgentMessage(
        userPrompt,
        conversationId,
        null,
        messages // pass existing history
      );

      // Update messages list based on backend return
      if (res.history) {
        dispatch(setMessages(res.history));
      } else if (res.answer) {
        dispatch(setMessages([...updatedMessages, { role: "assistant", content: res.answer! }]));
      }

      if (res.status === "PENDING" && res.approvalId) {
        let toolName = "requested_tool";
        const lastMsg = res.history[res.history.length - 1];
        if (lastMsg && lastMsg.content.includes("Call tool ")) {
          const match = lastMsg.content.match(/Call tool (\w+)/);
          toolName = (match && match[1]) || "requested_tool";
        }
        dispatch(setPendingApproval({ id: res.approvalId, toolName }));
      } else {
        dispatch(setPendingApproval({ id: null, toolName: null }));
      }
    } catch (err: any) {
      const errMsg = err.response?.data?.error || "An error occurred during execution.";
      dispatch(setMessages([
        ...updatedMessages,
        { role: "assistant", content: `Error: ${errMsg}` } as ChatMessage,
      ]));
      dispatch(setPendingApproval({ id: null, toolName: null }));
    } finally {
      dispatch(setLoading(false));
    }
  };

  const resumeAgentRun = async (approvalId: string, isApproval: boolean) => {
    dispatch(setLoading(true));
    try {
      const res = await runAgentMessage(
        null,
        conversationId,
        approvalId,
        messages
      );

      if (res.history) {
        dispatch(setMessages(res.history));
      } else if (isApproval && res.answer) {
        dispatch(setMessages([...messages, { role: "assistant", content: res.answer! }]));
      } else if (!isApproval && res.reason) {
        dispatch(setMessages([
          ...messages,
          { role: "assistant", content: `Execution Rejected: ${res.reason}` },
        ]));
      }

      if (isApproval && res.status === "PENDING" && res.approvalId) {
        let toolName = "requested_tool";
        const lastMsg = res.history[res.history.length - 1];
        if (lastMsg && lastMsg.content.includes("Call tool ")) {
          const match = lastMsg.content.match(/Call tool (\w+)/);
          toolName = (match && match[1]) || "requested_tool";
        }
        dispatch(setPendingApproval({ id: res.approvalId, toolName }));
      } else {
        dispatch(setPendingApproval({ id: null, toolName: null }));
      }
    } catch (err: any) {
      const actionStr = isApproval ? "approve" : "reject";
      const errMsg = err.response?.data?.error || `An error occurred during execution resume after ${actionStr}.`;
      dispatch(setMessages([
        ...messages,
        { role: "assistant", content: `Error: ${errMsg}` } as ChatMessage,
      ]));
      dispatch(setPendingApproval({ id: null, toolName: null }));
    } finally {
      dispatch(setLoading(false));
    }
  };

  const handleApprove = async (approvalId: string) => {
    dispatch(setLoading(true));
    try {
      await approveRequest(approvalId);
      await resumeAgentRun(approvalId, true);
    } catch (err: any) {
      const errMsg = err.response?.data?.error || "Failed to approve tool execution.";
      dispatch(setMessages([
        ...messages,
        { role: "assistant", content: `Error: ${errMsg}` } as ChatMessage,
      ]));
      dispatch(setPendingApproval({ id: null, toolName: null }));
      dispatch(setLoading(false));
    }
  };

  const handleReject = async (approvalId: string) => {
    dispatch(setLoading(true));
    try {
      await rejectRequest(approvalId);
      await resumeAgentRun(approvalId, false);
    } catch (err: any) {
      const errMsg = err.response?.data?.error || "Failed to reject execution.";
      dispatch(setMessages([
        ...messages,
        { role: "assistant", content: `Error: ${errMsg}` } as ChatMessage,
      ]));
      dispatch(setPendingApproval({ id: null, toolName: null }));
      dispatch(setLoading(false));
    }
  };

  const handleResumeAfterApproval = async (approvalId: string) => {
    await resumeAgentRun(approvalId, true);
  };

  const handleResumeAfterRejection = async (approvalId: string) => {
    await resumeAgentRun(approvalId, false);
  };
 
  const handleApproveRef = useRef(handleApprove);
  const handleRejectRef = useRef(handleReject);
  const handleResumeAfterApprovalRef = useRef(handleResumeAfterApproval);
  const handleResumeAfterRejectionRef = useRef(handleResumeAfterRejection);
  const loadingRef = useRef(loading);
 
  useEffect(() => {
    handleApproveRef.current = handleApprove;
    handleRejectRef.current = handleReject;
    handleResumeAfterApprovalRef.current = handleResumeAfterApproval;
    handleResumeAfterRejectionRef.current = handleResumeAfterRejection;
    loadingRef.current = loading;
  }, [handleApprove, handleReject, handleResumeAfterApproval, handleResumeAfterRejection, loading]);
 
  // Polling approval status for real-time automatic execution resume/abort.
  // isRunningRef is a synchronous guard that prevents concurrent checkStatus
  // calls when the interval fires before loadingRef has been updated by React's
  // render cycle (loadingRef syncs inside a useEffect, not synchronously).
  const isRunningRef = useRef(false);
 
  useEffect(() => {
    let intervalId: any;
 
    const checkStatus = async () => {
      // P1 fix: check isRunningRef synchronously before the first await so the
      // interval cannot fire a second overlapping call while the first is still
      // awaiting getApprovals(), even if loadingRef hasn't updated yet.
      if (!pendingApprovalId || loadingRef.current || isRunningRef.current) return;
      isRunningRef.current = true;
      try {
        const list = await getApprovals();
        const match = list.find((item) => item.id === pendingApprovalId);
        if (match) {
          if (match.status === "APPROVED") {
            clearInterval(intervalId);
            handleResumeAfterApprovalRef.current(pendingApprovalId);
          } else if (match.status === "REJECTED") {
            clearInterval(intervalId);
            handleResumeAfterRejectionRef.current(pendingApprovalId);
          } else {
            dispatch(setPendingApproval({
              id: pendingApprovalId,
              toolName: pendingToolName,
              status: match.status
            }));
          }
        } else {
          clearInterval(intervalId);
          dispatch(setPendingApproval({ id: null, toolName: null, status: null }));
        }
      } catch (err) {
        console.error("Failed to poll approval status", err);
      } finally {
        isRunningRef.current = false;
      }
    };

    if (isHydrated && pendingApprovalId) {
      checkStatus();
      intervalId = setInterval(checkStatus, 2000);
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [dispatch, isHydrated, pendingApprovalId, pendingToolName]);

  if (!isHydrated) {
    return (
      <div className="space-y-6">
        <div className="border-b border-zinc-900 pb-4 flex items-center justify-between">
          <div className="space-y-0.5">
            <div className="h-6 w-48 bg-zinc-800 rounded animate-pulse" />
            <div className="h-4 w-72 bg-zinc-900 rounded animate-pulse mt-2" />
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-[500px]">
          <div className="lg:col-span-8 flex flex-col border border-zinc-800 bg-zinc-950 rounded-sm h-[600px] p-4">
            <div className="h-8 bg-zinc-900 rounded animate-pulse mb-4" />
            <div className="space-y-4 flex-1">
              <div className="h-16 bg-zinc-900/50 rounded animate-pulse w-3/4" />
              <div className="h-12 bg-zinc-900/50 rounded animate-pulse w-1/2 ml-auto" />
              <div className="h-20 bg-zinc-900/50 rounded animate-pulse w-2/3" />
            </div>
          </div>
          <div className="lg:col-span-4 space-y-4">
            <div className="border border-zinc-800 bg-zinc-950 rounded-sm p-4 h-48 animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="border-b border-zinc-900 pb-4 flex items-center justify-between">
        <div className="space-y-0.5">
          <h1 className="text-xl font-mono font-bold tracking-tight text-white">Agent Chat Workspace</h1>
          <p className="text-xs text-zinc-500">Run the AI agent and review tool execution requests in real-time.</p>
        </div>
        <button
          onClick={handleNewChat}
          className="flex items-center space-x-1.5 px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 font-mono text-xs rounded-sm transition-colors duration-150"
        >
          <span>New Chat</span>
        </button>
      </div>

      <ChatWindow
        messages={messages}
        inputValue={inputValue}
        setInputValue={(val) => dispatch(setInputValue(val))}
        onSend={handleSend}
        onApprove={handleApprove}
        onReject={handleReject}
        loading={loading}
        pendingApprovalId={pendingApprovalId}
        pendingToolName={pendingToolName}
        pendingApprovalStatus={pendingApprovalStatus}
        conversationId={conversationId}
      />
    </div>
  );
}
