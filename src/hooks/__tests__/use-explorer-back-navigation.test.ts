import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook } from "@testing-library/react";
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
});
