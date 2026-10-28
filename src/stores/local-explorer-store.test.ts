import { describe, it, expect, vi, beforeEach } from "vitest";

const { invoke } = vi.hoisted(() => ({
  invoke: vi.fn(async (..._args: unknown[]) => [] as unknown),
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

import { useLocalExplorerStore, resetLocalExplorerInit } from "./local-explorer-store";

const HOME = "/Users/me";
const PATH_KEY = "anyscp.explorer.localPane.path";

describe("local explorer store — last-used folder", () => {
  beforeEach(() => {
    localStorage.clear();
    resetLocalExplorerInit();
    useLocalExplorerStore.setState({ homeDir: "", currentPath: "", entries: [], error: null });
    invoke.mockReset();
    invoke.mockImplementation(async (...args: unknown[]) => {
      const [cmd, params] = args as [string, { path?: string } | undefined];
      if (cmd === "local_home_dir") return HOME;
      if (cmd === "local_list_dir") {
        if (params?.path === "/gone") throw { kind: "LocalIoError", message: "/gone: No such file or directory" };
        return [];
      }
      return [];
    });
  });

  it("starts in the home folder the first time", async () => {
    await useLocalExplorerStore.getState().init();
    expect(useLocalExplorerStore.getState().currentPath).toBe(HOME);
  });

  it("reopens the last folder it showed", async () => {
    localStorage.setItem(PATH_KEY, "/Users/me/Downloads");
    await useLocalExplorerStore.getState().init();
    expect(useLocalExplorerStore.getState().currentPath).toBe("/Users/me/Downloads");
    expect(invoke).not.toHaveBeenCalledWith("local_list_dir", { path: HOME });
  });

  it("falls back to home when the last folder is gone", async () => {
    localStorage.setItem(PATH_KEY, "/gone");
    await useLocalExplorerStore.getState().init();
    const state = useLocalExplorerStore.getState();
    expect(state.currentPath).toBe(HOME);
    expect(state.error).toBeNull();
  });

  it("remembers each folder it navigates to", async () => {
    await useLocalExplorerStore.getState().init();
    await useLocalExplorerStore.getState().load("/Users/me/Documents");
    expect(localStorage.getItem(PATH_KEY)).toBe("/Users/me/Documents");

    // A failed navigation keeps the last good folder.
    await useLocalExplorerStore.getState().load("/gone");
    expect(localStorage.getItem(PATH_KEY)).toBe("/Users/me/Documents");
  });
});
