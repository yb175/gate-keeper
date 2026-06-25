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
    },
    setMessages(state, action: PayloadAction<ChatMessage[]>) {
      state.messages = action.payload;
    },
    addMessage(state, action: PayloadAction<ChatMessage>) {
      state.messages.push(action.payload);
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
    },
    hydrateChatState(
      state,
      action: PayloadAction<{
        conversationId: string;
        messages: ChatMessage[];
        pendingApprovalId: string | null;
        pendingToolName: string | null;
        pendingApprovalStatus: "PENDING" | "APPROVED" | "REJECTED" | null;
      }>
    ) {
      state.conversationId = action.payload.conversationId;
      state.messages = action.payload.messages;
      state.pendingApprovalId = action.payload.pendingApprovalId;
      state.pendingToolName = action.payload.pendingToolName;
      state.pendingApprovalStatus = action.payload.pendingApprovalStatus;
      state.isHydrated = true;
    },
    clearChatState(state, action: PayloadAction<string>) {
      state.conversationId = action.payload;
      state.messages = [];
      state.pendingApprovalId = null;
      state.pendingToolName = null;
      state.pendingApprovalStatus = null;
      state.inputValue = "";
      state.loading = false;
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
