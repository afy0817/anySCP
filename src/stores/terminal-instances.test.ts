import { describe, it, expect, vi, beforeEach } from "vitest";

// xterm needs real layout; a fake term captures the custom key handler and input.
const mocks = vi.hoisted(() => ({
  keyHandler: null as ((e: KeyboardEvent) => boolean) | null,
  input: vi.fn(),
}));

vi.mock("@xterm/xterm", () => ({
  Terminal: class {
    loadAddon() {}
    open() {}
    onData() {}
    onResize() {}
    dispose() {}
    input = mocks.input;
    attachCustomKeyEventHandler(handler: (e: KeyboardEvent) => boolean) {
      mocks.keyHandler = handler;
    }
  },
}));
vi.mock("@xterm/addon-fit", () => ({ FitAddon: class {} }));

import { ensureTerminal, disposeTerminal } from "./terminal-instances";

const press = (type: string, init: KeyboardEventInit) => mocks.keyHandler!(new KeyboardEvent(type, init));

describe("terminal key handler — Cmd+←/→", () => {
  beforeEach(() => {
    // jsdom has no canvas; the theme falls back to {} either way, this just silences the warning.
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    disposeTerminal("s1");
    mocks.input.mockReset();
    mocks.keyHandler = null;
    ensureTerminal("s1");
  });

  it("sends line start for Cmd+← and line end for Cmd+→", () => {
    expect(press("keydown", { key: "ArrowLeft", metaKey: true })).toBe(false);
    expect(press("keydown", { key: "ArrowRight", metaKey: true })).toBe(false);
    expect(mocks.input.mock.calls).toEqual([["\x01"], ["\x05"]]);
  });

  it("sends once per press, not on keyup", () => {
    expect(press("keyup", { key: "ArrowLeft", metaKey: true })).toBe(false);
    expect(mocks.input).not.toHaveBeenCalled();
  });

  it("leaves other arrow combos to xterm", () => {
    expect(press("keydown", { key: "ArrowLeft" })).toBe(true);
    expect(press("keydown", { key: "ArrowLeft", metaKey: true, shiftKey: true })).toBe(true);
    expect(press("keydown", { key: "ArrowUp", metaKey: true })).toBe(true);
    expect(mocks.input).not.toHaveBeenCalled();
  });
});
