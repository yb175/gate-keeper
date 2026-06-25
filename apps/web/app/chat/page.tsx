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
      dispatch(hydrateChatState());
    }
  }, [dispatch, isHydrated]);



  const handleNewChat = () => {
    if (confirm("Are you sure you want to clear the chat history and start a new session?")) {
      dispatch(clearChatState());
    }
  };

  const handleSend = async () => {
    if (!inputValue.trim() || loading) return;

    const userPrompt = inputValue;
    dispatch(setInputValue(""));
    dispatch(setLoading(true));

    // If we were waiting for approval but user chose to type message instead, clear approval state
    const currentApprovalId = pendingApprovalId;
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
        currentApprovalId,
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

  const handleApprove = async (approvalId: string) => {
    dispatch(setLoading(true));
    try {
      await approveRequest(approvalId);
      // Resume conversation by calling agent/run with the approved ID
      const res = await runAgentMessage(
        null, // message is null when resuming
        conversationId,
        approvalId,
        messages
      );

      if (res.history) {
        dispatch(setMessages(res.history));
      } else if (res.answer) {
        dispatch(setMessages([...messages, { role: "assistant", content: res.answer! }]));
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
      const errMsg = err.response?.data?.error || "Failed to approve tool execution.";
      dispatch(setMessages([
        ...messages,
        { role: "assistant", content: `Error: ${errMsg}` } as ChatMessage,
      ]));
      dispatch(setPendingApproval({ id: null, toolName: null }));
    } finally {
      dispatch(setLoading(false));
    }
  };

  const handleReject = async (approvalId: string) => {
    dispatch(setLoading(true));
    try {
      await rejectRequest(approvalId);
      // Call agent/run to report rejection outcome to agent loop
      const res = await runAgentMessage(
        null,
        conversationId,
        approvalId,
        messages
      );

      if (res.history) {
        dispatch(setMessages(res.history));
      } else if (res.reason) {
        dispatch(setMessages([
          ...messages,
          { role: "assistant", content: `Execution Rejected: ${res.reason}` },
        ]));
      }

      dispatch(setPendingApproval({ id: null, toolName: null }));
    } catch (err: any) {
      const errMsg = err.response?.data?.error || "Failed to reject execution.";
      dispatch(setMessages([
        ...messages,
        { role: "assistant", content: `Error: ${errMsg}` } as ChatMessage,
      ]));
      dispatch(setPendingApproval({ id: null, toolName: null }));
    } finally {
      dispatch(setLoading(false));
    }
  };

  // Sync refs to avoid re-triggering the polling interval on state mutations
  const handleApproveRef = useRef(handleApprove);
  const handleRejectRef = useRef(handleReject);
  const loadingRef = useRef(loading);

  useEffect(() => {
    handleApproveRef.current = handleApprove;
    handleRejectRef.current = handleReject;
    loadingRef.current = loading;
  }, [handleApprove, handleReject, loading]);

  // Polling approval status for real-time automatic execution resume/abort
  useEffect(() => {
    let intervalId: any;

    const checkStatus = async () => {
      if (!pendingApprovalId || loadingRef.current) return;
      try {
        const list = await getApprovals();
        const match = list.find((item) => item.id === pendingApprovalId);
        if (match) {
          if (match.status === "APPROVED") {
            clearInterval(intervalId);
            handleApproveRef.current(pendingApprovalId);
          } else if (match.status === "REJECTED") {
            clearInterval(intervalId);
            handleRejectRef.current(pendingApprovalId);
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
