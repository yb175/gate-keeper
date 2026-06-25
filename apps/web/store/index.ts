import { configureStore, Middleware } from "@reduxjs/toolkit";
import chatReducer from "./chatSlice";

/**
 * Persistence middleware — the single place that writes chat state to localStorage.
 *
 * P2a: serializableCheck is re-enabled (default). All state fields are plain
 *      serializable values (strings, booleans, arrays of plain objects) so no
 *      override is needed.
 *
 * P2b: localStorage side effects are moved out of reducers (which must be pure
 *      functions) and centralised here. The middleware runs after the reducer
 *      so it always reads the final committed state via getState(), not an Immer
 *      draft — making reducer tests straightforward and time-travel debugging safe.
 */
const safeLocalStorage = {
  setItem(key: string, value: string) {
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      console.error(`Failed to write to localStorage for key: ${key}`, e);
    }
  },
  removeItem(key: string) {
    try {
      localStorage.removeItem(key);
    } catch (e) {
      console.error(`Failed to remove from localStorage for key: ${key}`, e);
    }
  },
};

const chatPersistenceMiddleware: Middleware =
  (storeAPI) => (next) => (action: any) => {
    const result = next(action); // reducer runs first

    if (typeof window === "undefined") return result; // SSR guard

    const chat = storeAPI.getState().chat;

    switch (action.type) {
      case "chat/setMessages":
      case "chat/addMessage":
        safeLocalStorage.setItem(
          "gatekeeper_messages",
          JSON.stringify(chat.messages),
        );
        break;

      case "chat/setPendingApproval":
        if (chat.pendingApprovalId) {
          safeLocalStorage.setItem(
            "gatekeeper_pendingApprovalId",
            chat.pendingApprovalId,
          );
        } else {
          safeLocalStorage.removeItem("gatekeeper_pendingApprovalId");
        }
        if (chat.pendingToolName) {
          safeLocalStorage.setItem(
            "gatekeeper_pendingToolName",
            chat.pendingToolName,
          );
        } else {
          safeLocalStorage.removeItem("gatekeeper_pendingToolName");
        }
        if (chat.pendingApprovalStatus) {
          safeLocalStorage.setItem(
            "gatekeeper_pendingApprovalStatus",
            chat.pendingApprovalStatus,
          );
        } else {
          safeLocalStorage.removeItem("gatekeeper_pendingApprovalStatus");
        }
        break;

      case "chat/hydrateChatState":
        // Persist the generated conversationId if one was created fresh
        if (chat.conversationId) {
          safeLocalStorage.setItem(
            "gatekeeper_conversationId",
            chat.conversationId,
          );
        }
        break;

      case "chat/clearChatState":
        safeLocalStorage.setItem(
          "gatekeeper_conversationId",
          chat.conversationId,
        );
        safeLocalStorage.removeItem("gatekeeper_messages");
        safeLocalStorage.removeItem("gatekeeper_pendingApprovalId");
        safeLocalStorage.removeItem("gatekeeper_pendingToolName");
        safeLocalStorage.removeItem("gatekeeper_pendingApprovalStatus");
        break;
    }

    return result;
  };

export const store = configureStore({
  reducer: {
    chat: chatReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(chatPersistenceMiddleware),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
