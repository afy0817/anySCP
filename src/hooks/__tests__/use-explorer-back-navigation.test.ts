import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook } from "@testing-library/react";

// Capture the native `mouse-navigate` listeners each hook registers.
const { nativeListeners } = vi.hoisted(() => ({
  nativeListeners: new Set<(e: { payload: string }) => void>(),
}));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async (_event: string, cb: (e: { payload: string }) => void) => {
    nativeListeners.add(cb);
    return () => nativeListeners.delete(cb);
  }),
}));

import { useExplorerBackNavigation } from "../use-explorer-back-navigation";
import { createSftpProvider } from "../../providers/sftp-provider";

const provider = createSftpProvider("sftp-1");

let root: HTMLDivElement;
let row: HTMLDivElement;
const onNavigate = vi.fn();

function setup(overrides: { currentPath?: string; loading?: boolean; isActive?: boolean } = {}) {
  return renderHook(() =>
    useExplorerBackNavigation({
      rootRef: { current: root },
      isActive: overrides.isActive ?? true,
      provider,
      currentPath: overrides.currentPath ?? "/home/user",
      loading: overrides.loading ?? false,
      onNavigate,
    }),
  );
}

function pressMouseBack(target: Element) {
  target.dispatchEvent(new MouseEvent("mousedown", { button: 3, bubbles: true, cancelable: true }));
  target.dispatchEvent(new MouseEvent("mouseup", { button: 3, bubbles: true, cancelable: true }));
}

/** Native swipe-gesture back/forward (Logitech side buttons) with the pointer over `target`. */
async function nativeNavigate(target: Element, direction: "back" | "forward", listeners = 1) {
  await vi.waitFor(() => expect(nativeListeners.size).toBe(listeners));
  document.elementFromPoint = (() => target) as typeof document.elementFromPoint;
  document.dispatchEvent(new MouseEvent("pointermove", { clientX: 5, clientY: 5 }));
  for (const cb of [...nativeListeners]) cb({ payload: direction });
}

function pressKey(target: Element, init: KeyboardEventInit) {
  const e = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(e);
  return e;
}

describe("useExplorerBackNavigation", () => {
  beforeEach(() => {
    root = document.createElement("div");
    row = document.createElement("div");
    root.appendChild(row);
    document.body.appendChild(root);
    onNavigate.mockReset();
  });

  afterEach(() => {
    root.remove();
    delete (document as { elementFromPoint?: unknown }).elementFromPoint;
  });

  it("goes to the parent folder on the mouse back button inside the explorer", () => {
    setup();
    pressMouseBack(row);
    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(onNavigate).toHaveBeenCalledWith("/home");
  });

  it("ignores the mouse back button outside the explorer", () => {
    setup();
    pressMouseBack(document.body);
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("goes to the parent folder on Alt+↑ / Alt+← and BrowserBack", () => {
    setup();
    const e = pressKey(row, { key: "ArrowUp", altKey: true });
    pressKey(row, { key: "ArrowLeft", altKey: true });
    pressKey(document.body, { key: "BrowserBack" });
    expect(onNavigate).toHaveBeenCalledTimes(3);
    expect(onNavigate).toHaveBeenCalledWith("/home");
    expect(e.defaultPrevented).toBe(true);
  });

  it("leaves plain and shifted arrows to the file list", () => {
    setup();
    pressKey(row, { key: "ArrowUp" });
    pressKey(row, { key: "ArrowUp", altKey: true, shiftKey: true });
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("does nothing at the root", () => {
    setup({ currentPath: "/" });
    pressMouseBack(row);
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("does nothing while the listing is loading", () => {
    setup({ loading: true });
    pressMouseBack(row);
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("does nothing when the tab is not active", () => {
    setup({ isActive: false });
    pressMouseBack(row);
    pressKey(row, { key: "BrowserBack" });
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("ignores back keys typed into an input", () => {
    const input = document.createElement("input");
    root.appendChild(input);
    setup();
    pressKey(input, { key: "ArrowLeft", altKey: true });
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("ignores back actions while a dialog is open in the explorer", () => {
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    root.appendChild(dialog);
    setup();
    pressMouseBack(row);
    pressKey(row, { key: "BrowserBack" });
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("stops listening on unmount", () => {
    const { unmount } = setup();
    unmount();
    pressMouseBack(row);
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("goes up on a native swipe-gesture back over the pane", async () => {
    setup();
    await nativeNavigate(row, "back");
    expect(onNavigate).toHaveBeenCalledWith("/home");
  });

  it("ignores native forward, and native back outside the pane", async () => {
    setup();
    await nativeNavigate(row, "forward");
    await nativeNavigate(document.body, "back");
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("stops listening for native back on unmount", async () => {
    const { unmount } = setup();
    await vi.waitFor(() => expect(nativeListeners.size).toBe(1));
    unmount();
    expect(nativeListeners.size).toBe(0);
  });

  describe("with two panes on screen", () => {
    let otherRoot: HTMLDivElement;
    let otherRow: HTMLDivElement;
    const otherNavigate = vi.fn();

    function setupBoth() {
      setup(); // `root` — not primary
      return setupOther();
    }

    function setupOther() {
      return renderHook(() =>
        useExplorerBackNavigation({
          rootRef: { current: otherRoot },
          isActive: true,
          provider,
          currentPath: "/srv/app",
          loading: false,
          onNavigate: otherNavigate,
          primary: true,
        }),
      );
    }

    beforeEach(() => {
      otherRoot = document.createElement("div");
      otherRow = document.createElement("div");
      otherRoot.appendChild(otherRow);
      document.body.appendChild(otherRoot);
      otherNavigate.mockReset();
    });

    afterEach(() => {
      otherRoot.remove();
    });

    it("sends the mouse back button to the pane under the cursor", () => {
      setupBoth();
      pressMouseBack(row);
      expect(onNavigate).toHaveBeenCalledWith("/home");
      expect(otherNavigate).not.toHaveBeenCalled();
    });

    it("sends native swipe-gesture back to the pane under the pointer", async () => {
      // Mount one at a time: vitest can hand two simultaneous dynamic imports
      // of a mocked module the real one.
      setup();
      await vi.waitFor(() => expect(nativeListeners.size).toBe(1));
      setupOther();
      await nativeNavigate(otherRow, "back", 2);
      expect(otherNavigate).toHaveBeenCalledWith("/srv");
      expect(onNavigate).not.toHaveBeenCalled();
    });

    it("sends keyboard back to the focused pane", () => {
      setupBoth();
      pressKey(row, { key: "ArrowUp", altKey: true });
      expect(onNavigate).toHaveBeenCalledTimes(1);
      expect(otherNavigate).not.toHaveBeenCalled();
    });

    it("sends unfocused keyboard back to the primary pane until another is clicked", () => {
      setupBoth();
      pressKey(document.body, { key: "BrowserBack" });
      expect(otherNavigate).toHaveBeenCalledWith("/srv");
      expect(onNavigate).not.toHaveBeenCalled();

      row.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
      pressKey(document.body, { key: "BrowserBack" });
      expect(onNavigate).toHaveBeenCalledWith("/home");
      expect(otherNavigate).toHaveBeenCalledTimes(1);
    });
  });
});
