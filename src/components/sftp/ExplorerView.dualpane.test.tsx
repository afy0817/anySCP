import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { SftpEntry } from "../../types";

// ── Tauri module mocks (same set as ExplorerView.upload.test) ────────────────

const { invoke } = vi.hoisted(() => ({
  invoke: vi.fn(async (..._args: unknown[]) => [] as unknown),
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async () => () => {}),
}));
vi.mock("@tauri-apps/api/webviewWindow", () => ({
  getCurrentWebviewWindow: () => ({
    onDragDropEvent: vi.fn(async () => () => {}),
  }),
}));

import { ExplorerView } from "./ExplorerView";
import { useSftpStore } from "../../stores/sftp-store";
import { useLocalExplorerStore, resetLocalExplorerInit } from "../../stores/local-explorer-store";

const SESSION_ID = "sess-1";
const REMOTE_DIR = "/home/user";
const HOME = "/Users/me";

function entry(dir: string, name: string, type: "File" | "Directory"): SftpEntry {
  return {
    name,
    path: `${dir}/${name}`,
    entry_type: type,
    size: 10,
    permissions: 0o644,
    permissions_display: "rw-r--r--",
    modified: 1_700_000_000,
    is_symlink: false,
  };
}

const remoteEntries = [entry(REMOTE_DIR, "srv", "Directory"), entry(REMOTE_DIR, "r.txt", "File")];
let localEntries: SftpEntry[] = [];

function callsTo(cmd: string): unknown[][] {
  return invoke.mock.calls.filter((c) => c[0] === cmd);
}

/** Drag `source` and release it over `target` (hit-tested via elementFromPoint). */
function dragOnto(source: Element, target: Element) {
  const hit = vi.fn(() => target);
  document.elementFromPoint = hit as unknown as typeof document.elementFromPoint;
  fireEvent.pointerDown(source, { button: 0, clientX: 10, clientY: 10 });
  window.dispatchEvent(new MouseEvent("pointermove", { clientX: 200, clientY: 50 }));
  window.dispatchEvent(new MouseEvent("pointerup", { clientX: 200, clientY: 50 }));
}

describe("ExplorerView — This PC pane", () => {
  beforeEach(() => {
    localEntries = [entry(HOME, "Docs", "Directory"), entry(HOME, ".env", "File"), entry(HOME, "a.txt", "File")];
    invoke.mockReset();
    invoke.mockImplementation(async (...args: unknown[]) => {
      const [cmd, params] = args as [string, Record<string, unknown> | undefined];
      if (cmd === "local_home_dir") return HOME;
      if (cmd === "local_list_dir") return params?.path === HOME ? localEntries : [];
      if (cmd === "sftp_list_dir") return params?.path === REMOTE_DIR ? remoteEntries : [];
      return [];
    });

    localStorage.clear();
    resetLocalExplorerInit();
    useLocalExplorerStore.setState({ visible: true, homeDir: "", currentPath: "", entries: [], error: null });
    useSftpStore.setState({ sessions: new Map(), activeSftpSessionId: null, clipboard: null });
    const store = useSftpStore.getState();
    store.openSession(SESSION_ID, "ssh-1", "Test host", "user");
    store.setEntries(SESSION_ID, REMOTE_DIR, remoteEntries);
  });

  afterEach(() => {
    delete (document as { elementFromPoint?: unknown }).elementFromPoint;
  });

  it("lists the home folder on the left, hidden files included", async () => {
    render(<ExplorerView sessionId={SESSION_ID} />);
    expect(await screen.findByTestId("local-entry-.env")).toBeInTheDocument();
    expect(screen.getByTestId("local-entry-Docs")).toBeInTheDocument();
    expect(screen.getByTestId("explorer-entry-r.txt")).toBeInTheDocument();
  });

  it("uploads a local file dropped on the remote pane into its current folder", async () => {
    const { container } = render(<ExplorerView sessionId={SESSION_ID} />);
    const source = await screen.findByTestId("local-entry-a.txt");
    const remotePane = container.querySelector('[data-explorer-pane="remote"]')!;

    dragOnto(source, remotePane);

    await waitFor(() => expect(callsTo("sftp_enqueue_upload")).toHaveLength(1));
    expect(callsTo("sftp_enqueue_upload")[0][1]).toEqual({
      sftpSessionId: SESSION_ID,
      localPaths: [`${HOME}/a.txt`],
      remoteDir: REMOTE_DIR,
    });
  });

  it("uploads into the remote folder row it is dropped on", async () => {
    render(<ExplorerView sessionId={SESSION_ID} />);
    const source = await screen.findByTestId("local-entry-a.txt");

    dragOnto(source, screen.getByTestId("explorer-entry-srv"));

    await waitFor(() => expect(callsTo("sftp_enqueue_upload")).toHaveLength(1));
    expect(callsTo("sftp_enqueue_upload")[0][1]).toMatchObject({ remoteDir: `${REMOTE_DIR}/srv` });
  });

  it("downloads a remote file dropped on the local pane into its current folder", async () => {
    const { container } = render(<ExplorerView sessionId={SESSION_ID} />);
    await screen.findByTestId("local-entry-a.txt");
    const localPane = container.querySelector('[data-explorer-pane="local"]')!;

    dragOnto(screen.getByTestId("explorer-entry-r.txt"), localPane);

    await waitFor(() => expect(callsTo("sftp_enqueue_download")).toHaveLength(1));
    expect(callsTo("sftp_enqueue_download")[0][1]).toEqual({
      sftpSessionId: SESSION_ID,
      remotePaths: [`${REMOTE_DIR}/r.txt`],
      localDir: HOME,
    });
    // Not treated as an in-app move.
    expect(callsTo("sftp_move_entries")).toHaveLength(0);
  });

  it("asks before a download overwrites a local file", async () => {
    localEntries.push(entry(HOME, "r.txt", "File"));
    const { container } = render(<ExplorerView sessionId={SESSION_ID} />);
    await screen.findByTestId("local-entry-r.txt");
    const localPane = container.querySelector('[data-explorer-pane="local"]')!;

    dragOnto(screen.getByTestId("explorer-entry-r.txt"), localPane);

    fireEvent.click(await screen.findByTestId("explorer-overwrite-confirm-button"));
    await waitFor(() => expect(callsTo("sftp_enqueue_download")).toHaveLength(1));
  });

  it("offers Upload in the local context menu", async () => {
    render(<ExplorerView sessionId={SESSION_ID} />);
    fireEvent.contextMenu(await screen.findByTestId("local-entry-a.txt"));
    fireEvent.click(await screen.findByText("Upload"));

    await waitFor(() => expect(callsTo("sftp_enqueue_upload")).toHaveLength(1));
    expect(callsTo("sftp_enqueue_upload")[0][1]).toMatchObject({ localPaths: [`${HOME}/a.txt`], remoteDir: REMOTE_DIR });
  });

  it("hides the pane and its download action when turned off", async () => {
    useLocalExplorerStore.setState({ visible: false });
    const { container } = render(<ExplorerView sessionId={SESSION_ID} />);
    fireEvent.contextMenu(await screen.findByTestId("explorer-entry-r.txt"));

    expect(container.querySelector('[data-explorer-pane="local"]')).toBeNull();
    expect(screen.queryByText("Download to This PC")).toBeNull();
  });
});
