import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(async () => null) }));

import { SettingsPage } from "./SettingsPage";
import { useLocalExplorerStore } from "../../stores/local-explorer-store";

function openExplorerSection() {
  render(<SettingsPage />);
  fireEvent.click(screen.getByTestId("settings-nav-explorer"));
}

describe("SettingsPage — explorer layout", () => {
  beforeEach(() => {
    // The default Appearance section measures fonts on a canvas jsdom lacks.
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    localStorage.clear();
    useLocalExplorerStore.setState({ visible: true });
  });

  it("switches the explorer to remote-only and remembers it", () => {
    openExplorerSection();
    expect(screen.getByTestId("s-explorerlayout-split")).toHaveAttribute("aria-checked", "true");

    fireEvent.click(screen.getByTestId("s-explorerlayout-remote"));

    expect(useLocalExplorerStore.getState().visible).toBe(false);
    expect(localStorage.getItem("anyscp.explorer.localPane.visible")).toBe("false");
    expect(screen.getByTestId("s-explorerlayout-remote")).toHaveAttribute("aria-checked", "true");
  });

  it("switches back to split", () => {
    useLocalExplorerStore.setState({ visible: false });
    openExplorerSection();
    expect(screen.getByTestId("s-explorerlayout-remote")).toHaveAttribute("aria-checked", "true");

    fireEvent.click(screen.getByTestId("s-explorerlayout-split"));

    expect(useLocalExplorerStore.getState().visible).toBe(true);
  });
});
