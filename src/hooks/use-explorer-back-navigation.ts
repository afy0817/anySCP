import { useEffect, useRef, type RefObject } from "react";
import type { FileSystemProvider } from "../types/explorer";

interface ExplorerBackNavigationOptions {
  /** Explorer root element; mouse back presses only count inside it. */
  rootRef: RefObject<HTMLElement | null>;
  /** Explorer tabs stay mounted (issue #17), so only the visible one listens. */
  isActive: boolean;
  provider: FileSystemProvider;
  currentPath: string;
  loading: boolean;
  onNavigate: (path: string) => void;
}

/** A dialog or context menu open over the listing owns the input. */
const BLOCKING_SELECTOR = '[role="dialog"], [role="menu"]';

/**
 * Maps the platform "back" actions to "go to parent folder" in the explorer:
 * the mouse back button, the BrowserBack key, and Cmd+↑ / Cmd+← (macOS) or
 * Alt+↑ / Alt+← (Windows/Linux). Cmd+[ is left alone — it's the global
 * previous-tab shortcut.
 */
export function useExplorerBackNavigation({
  rootRef,
  isActive,
  provider,
  currentPath,
  loading,
  onNavigate,
}: ExplorerBackNavigationOptions) {
  // Read at event time so the listeners don't re-subscribe on every navigation.
  const goUpRef = useRef<() => void>(() => {});
  goUpRef.current = () => {
    // currentPath only updates once the listing lands, so a second press while
    // loading would just re-request the same parent.
    if (loading) return;
    const parent = provider.parentPath(currentPath);
    if (parent !== currentPath) onNavigate(parent);
  };

  useEffect(() => {
    if (!isActive) return;

    const isMac = navigator.platform.includes("Mac") || navigator.platform === "MacIntel";

    const isBlocked = (target: EventTarget | null): boolean => {
      if (target instanceof Element && target.closest(BLOCKING_SELECTOR)) return true;
      return !!rootRef.current?.querySelector(BLOCKING_SELECTOR);
    };

    function handleKeyDown(e: KeyboardEvent) {
      const isArrowBack =
        (e.key === "ArrowUp" || e.key === "ArrowLeft") &&
        !e.shiftKey &&
        !e.ctrlKey &&
        (isMac ? e.metaKey && !e.altKey : e.altKey && !e.metaKey);
      if (e.key !== "BrowserBack" && !isArrowBack) return;

      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;
      if (isBlocked(target)) return;

      // Capture phase + stopPropagation so a focused row doesn't also treat
      // the arrow as a selection move.
      e.preventDefault();
      e.stopPropagation();
      goUpRef.current();
    }

    // Button 3 is the mouse "back" button (WKWebView reports it too). Cancel
    // both halves of the press so the webview doesn't attempt its own history
    // navigation; act on release, like browsers do.
    function handleMouse(e: MouseEvent) {
      if (e.button !== 3) return;
      const root = rootRef.current;
      if (!root || !(e.target instanceof Node) || !root.contains(e.target)) return;
      if (isBlocked(e.target)) return;

      e.preventDefault();
      if (e.type === "mouseup") goUpRef.current();
    }

    document.addEventListener("keydown", handleKeyDown, true);
    document.addEventListener("mousedown", handleMouse);
    document.addEventListener("mouseup", handleMouse);
    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      document.removeEventListener("mousedown", handleMouse);
      document.removeEventListener("mouseup", handleMouse);
    };
  }, [isActive, rootRef]);
}
