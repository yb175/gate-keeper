## React Hooks Research

Hooks are JavaScript functions that let you use different React features from your components. They enable you to use state and other React features without writing a class. You can use built-in Hooks or combine them to build your own custom Hooks.

### Rules of Hooks
There are two main rules when using Hooks:
1.  **Only call Hooks at the Top Level**: Do not call Hooks inside loops, conditions, or nested functions. Always use Hooks at the top level of your React function, before any early returns.
2.  **Only call Hooks from React Functions**: Do not call Hooks from regular JavaScript functions. Call them from React function components or from custom Hooks.

### Categories of Built-in React Hooks (React 19)

#### 1. State Hooks
These hooks allow a component to "remember" information and manage its internal state.
*   `useState`: Declares a state variable that can be updated directly.
*   `useReducer`: Declares a state variable with update logic managed by a reducer function.

#### 2. Context Hooks
Context allows components to receive information from distant parents without prop drilling.
*   `useContext`: Reads and subscribes to a context, making data available throughout the component tree.

#### 3. Ref Hooks
Refs allow a component to hold information that isn't used for rendering, typically for interacting with DOM nodes or non-React systems.
*   `useRef`: Declares a ref. Commonly used to hold a DOM node or any mutable value that doesn't trigger re-renders upon change.
*   `useImperativeHandle`: Customizes the ref exposed by your component. (Rarely used).

#### 4. Effect Hooks
Effects allow components to connect to and synchronize with external systems (e.g., network requests, DOM manipulations, subscriptions).
*   `useEffect`: Connects a component to an external system. It runs after every render (by default) and can be cleaned up.
    *   **Example:**
        ```javascript
        function ChatRoom({ roomId }) {
          useEffect(() => {
            const connection = createConnection(roomId);
            connection.connect();
            return () => connection.disconnect(); // Cleanup function
          }, [roomId]); // Dependency array
          // ...
        }
        ```
*   `useLayoutEffect`: Fires before the browser repaints the screen. Useful for measuring layout.
*   `useInsertionEffect`: Fires before React makes changes to the DOM. Primarily for libraries to insert dynamic CSS.
*   `useEffectEvent`: Creates a non-reactive event to fire from any Effect hook.

#### 5. Performance Hooks
These hooks help optimize re-rendering performance by skipping unnecessary work.
*   `useMemo`: Caches the result of an expensive calculation to avoid re-running it on every render if dependencies haven't changed.
*   `useCallback`: Caches a function definition to prevent unnecessary re-creation of functions, especially when passing them down to optimized child components.
*   `useTransition`: Marks a state transition as non-blocking, allowing other updates to interrupt it.
*   `useDeferredValue`: Defers updating a non-critical part of the UI, letting other parts update first.

#### 6. Other Hooks
These hooks are typically more useful for library authors or specific advanced use cases.
*   `useDebugValue`: Customizes the label React DevTools displays for custom Hooks.
*   `useId`: Generates a unique ID for a component, often used with accessibility APIs.
*   `useSyncExternalStore`: Allows a component to subscribe to an external store.
*   `useActionState`: Manages the state of actions.