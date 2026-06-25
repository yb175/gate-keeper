import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { ChatMessage } from "../services/agent";

export interface ChatState {
  conversationId: string;
  messages: ChatMessage[];
  inputValue: string;
  loading: boolean;
  pendingApprovalId: string | null;
  pendingToolName: string | null;
  pendingApprovalStatus: "PENDING" | "APPROVED" | "REJECTED" | null;
  isHydrated: boolean;
}

const initialState: ChatState = {
  conversationId: "",
  messages: [],
  inputValue: "",
  loading: false,
  pendingApprovalId: null,
  pendingToolName: null,
  pendingApprovalStatus: null,
  isHydrated: false,
};

const chatSlice = createSlice({
  name: "chat",
  initialState,
  reducers: {
    setConversationId(state, action: PayloadAction<string>) {
      state.conversationId = action.payload;
      if (typeof window !== "undefined") {
        localStorage.setItem("gatekeeper_conversationId", action.payload);
      }
    },
    setMessages(state, action: PayloadAction<ChatMessage[]>) {
      state.messages = action.payload;
      if (typeof window !== "undefined") {
        localStorage.setItem("gatekeeper_messages", JSON.stringify(action.payload));
      }
    },
    addMessage(state, action: PayloadAction<ChatMessage>) {
      state.messages.push(action.payload);
      if (typeof window !== "undefined") {
        localStorage.setItem("gatekeeper_messages", JSON.stringify(state.messages));
      }
    },
    setInputValue(state, action: PayloadAction<string>) {
      state.inputValue = action.payload;
    },
    setLoading(state, action: PayloadAction<boolean>) {
      state.loading = action.payload;
    },
    setPendingApproval(
      state,
      action: PayloadAction<{ id: string | null; toolName: string | null; status?: "PENDING" | "APPROVED" | "REJECTED" | null }>
    ) {
      state.pendingApprovalId = action.payload.id;
      state.pendingToolName = action.payload.toolName;
      state.pendingApprovalStatus = action.payload.status || (action.payload.id ? "PENDING" : null);
      if (typeof window !== "undefined") {
        if (action.payload.id) {
          localStorage.setItem("gatekeeper_pendingApprovalId", action.payload.id);
        } else {
          localStorage.removeItem("gatekeeper_pendingApprovalId");
        }
        if (action.payload.toolName) {
          localStorage.setItem("gatekeeper_pendingToolName", action.payload.toolName);
        } else {
          localStorage.removeItem("gatekeeper_pendingToolName");
        }
        if (action.payload.status) {
          localStorage.setItem("gatekeeper_pendingApprovalStatus", action.payload.status);
        } else if (action.payload.id) {
          localStorage.setItem("gatekeeper_pendingApprovalStatus", "PENDING");
        } else {
          localStorage.removeItem("gatekeeper_pendingApprovalStatus");
        }
      }
    },
    hydrateChatState(state) {
      if (typeof window !== "undefined") {
        const savedConvId = localStorage.getItem("gatekeeper_conversationId");
        const savedMessages = localStorage.getItem("gatekeeper_messages");
        const savedPendingApprovalId = localStorage.getItem("gatekeeper_pendingApprovalId");
        const savedPendingToolName = localStorage.getItem("gatekeeper_pendingToolName");
        const savedPendingApprovalStatus = localStorage.getItem("gatekeeper_pendingApprovalStatus") as any;
 
        if (savedConvId) {
          state.conversationId = savedConvId;
        } else {
          state.conversationId = `conv_${Math.random().toString(36).substring(2, 9)}`;
          localStorage.setItem("gatekeeper_conversationId", state.conversationId);
        }
 
        if (savedMessages) {
          try {
            state.messages = JSON.parse(savedMessages);
          } catch (e) {
            console.error("Error parsing saved messages", e);
          }
        }
 
        state.pendingApprovalId = savedPendingApprovalId;
        state.pendingToolName = savedPendingToolName;
        state.pendingApprovalStatus = savedPendingApprovalStatus || (savedPendingApprovalId ? "PENDING" : null);
        state.isHydrated = true;
      }
    },
    clearChatState(state) {
      const randomId = `conv_${Math.random().toString(36).substring(2, 9)}`;
      state.conversationId = randomId;
      state.messages = [];
      state.pendingApprovalId = null;
      state.pendingToolName = null;
      state.pendingApprovalStatus = null;
      state.inputValue = "";
      state.loading = false;
      if (typeof window !== "undefined") {
        localStorage.setItem("gatekeeper_conversationId", randomId);
        localStorage.removeItem("gatekeeper_messages");
        localStorage.removeItem("gatekeeper_pendingApprovalId");
        localStorage.removeItem("gatekeeper_pendingToolName");
        localStorage.removeItem("gatekeeper_pendingApprovalStatus");
      }
    },
  },
});

export const {
  setConversationId,
  setMessages,
  addMessage,
  setInputValue,
  setLoading,
  setPendingApproval,
  hydrateChatState,
  clearChatState,
} = chatSlice.actions;

export default chatSlice.reducer;
