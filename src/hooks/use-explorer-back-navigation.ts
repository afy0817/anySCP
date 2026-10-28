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
  /** With several panes on screen (this PC | remote), the one that takes
   *  keyboard back presses until another pane is clicked. */
  primary?: boolean;
}

/** A dialog or context menu open over the listing owns the input. */
const BLOCKING_SELECTOR = '[role="dialog"], [role="menu"]';

interface Pane {
  rootRef: RefObject<HTMLElement | null>;
  primary: boolean;
}

// Panes currently listening, and the one the user last clicked or navigated
// with the keyboard. A keyboard back press with focus outside every pane (e.g.
// on <body> after the listing re-rendered) goes to that pane, else the primary.
const listening = new Set<Pane>();
let lastUsed: Pane | null = null;

function keyboardOwner(): Pane | undefined {
  if (lastUsed && listening.has(lastUsed)) return lastUsed;
  const panes = [...listening];
  return panes.find((p) => p.primary) ?? panes[0];
}

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
  primary = false,
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

    const pane: Pane = { rootRef, primary };
    listening.add(pane);

    const isMac = navigator.platform.includes("Mac") || navigator.platform === "MacIntel";

    const isBlocked = (target: EventTarget | null): boolean => {
      if (target instanceof Element && target.closest(BLOCKING_SELECTOR)) return true;
      return !!rootRef.current?.querySelector(BLOCKING_SELECTOR);
    };

    const inPane = (p: Pane, target: EventTarget | null): boolean =>
      target instanceof Node && !!p.rootRef.current?.contains(target);

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

      // Focus inside a pane decides; otherwise the last-used (or primary) pane.
      if (!inPane(pane, target)) {
        const focusedPane = [...listening].find((p) => inPane(p, target));
        if (focusedPane || keyboardOwner() !== pane) return;
      }

      // Capture phase + stopPropagation so a focused row doesn't also treat
      // the arrow as a selection move.
      e.preventDefault();
      e.stopPropagation();
      lastUsed = pane;
      goUpRef.current();
    }

    function handlePointerDown(e: PointerEvent) {
      if (inPane(pane, e.target)) lastUsed = pane;
    }

    // Button 3 is the mouse "back" button (WKWebView reports it too). Cancel
    // both halves of the press so the webview doesn't attempt its own history
    // navigation; act on release, like browsers do.
    function handleMouse(e: MouseEvent) {
      if (e.button !== 3) return;
      if (!inPane(pane, e.target)) return;
      if (isBlocked(e.target)) return;

      e.preventDefault();
      if (e.type === "mouseup") {
        lastUsed = pane;
        goUpRef.current();
      }
    }

    document.addEventListener("keydown", handleKeyDown, true);
    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("mousedown", handleMouse);
    document.addEventListener("mouseup", handleMouse);
    return () => {
      listening.delete(pane);
      if (lastUsed === pane) lastUsed = null;
      document.removeEventListener("keydown", handleKeyDown, true);
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("mousedown", handleMouse);
      document.removeEventListener("mouseup", handleMouse);
    };
  }, [isActive, rootRef, primary]);
}
