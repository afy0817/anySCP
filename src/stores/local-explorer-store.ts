import { create } from "zustand";
import i18n from "../i18n";
import type { SftpEntry } from "../types";

// State for the explorer's local "This PC" pane. One pane state is shared by
// every explorer tab, so switching hosts keeps you in the same local folder.

const VISIBLE_KEY = "anyscp.explorer.localPane.visible";
const WIDTH_KEY = "anyscp.explorer.localPane.width";

/** Local pane width as a fraction of the explorer, kept within these bounds. */
export const LOCAL_PANE_MIN = 0.2;
export const LOCAL_PANE_MAX = 0.8;

interface LocalExplorerState {
  /** Whether the local pane is shown next to the remote one. */
  visible: boolean;
  /** Local pane width as a fraction of the explorer width. */
  width: number;
  /** User's home directory, "" until resolved. */
  homeDir: string;
  /** Folder being shown, "" until the first listing lands. */
  currentPath: string;
  entries: SftpEntry[];
  loading: boolean;
  error: string | null;
  sortBy: "name" | "size" | "modified";
  sortAsc: boolean;

  setVisible: (visible: boolean) => void;
  setWidth: (width: number) => void;
  setSort: (sortBy: "name" | "size" | "modified", sortAsc: boolean) => void;
  /** Resolve the home dir and list it, once. Later calls are no-ops. */
  init: () => Promise<void>;
  /** List `path` and make it the current folder. A leading `~` is the home dir. */
  load: (path: string) => Promise<void>;
  /** Re-list the current folder (e.g. after a download lands in it). */
  refresh: () => Promise<void>;
}

function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage unavailable — the preference just won't persist.
  }
}

function clampWidth(width: number): number {
  return Math.min(LOCAL_PANE_MAX, Math.max(LOCAL_PANE_MIN, width));
}

function errorMessage(err: unknown): string {
  if (err && typeof err === "object" && "message" in err) {
    return String((err as { message: string }).message);
  }
  if (typeof err === "string") return err;
  return i18n.t("explorer:view.listFailed");
}

// Guards against out-of-order listings: only the latest load may commit.
let loadSeq = 0;
let initStarted = false;

export const useLocalExplorerStore = create<LocalExplorerState>((set, get) => ({
  visible: readStored(VISIBLE_KEY) !== "false",
  width: clampWidth(Number(readStored(WIDTH_KEY)) || 0.5),
  homeDir: "",
  currentPath: "",
  entries: [],
  loading: false,
  error: null,
  sortBy: "name",
  sortAsc: true,

  setVisible: (visible) => {
    writeStored(VISIBLE_KEY, String(visible));
    set({ visible });
  },

  setWidth: (width) => {
    const clamped = clampWidth(width);
    writeStored(WIDTH_KEY, String(clamped));
    set({ width: clamped });
  },

  setSort: (sortBy, sortAsc) => set({ sortBy, sortAsc }),

  init: async () => {
    if (initStarted) return;
    initStarted = true;
    let home = "";
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const resolved = await invoke<unknown>("local_home_dir");
      if (typeof resolved === "string") home = resolved;
    } catch {
      // Fall back to the filesystem root below.
    }
    set({ homeDir: home });
    await get().load(home || "/");
  },

  load: async (path) => {
    const { homeDir } = get();
    const target =
      homeDir && (path === "~" || path.startsWith("~/"))
        ? homeDir + path.slice(1)
        : path;
    const seq = ++loadSeq;
    set({ loading: true });
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const entries = await invoke<SftpEntry[]>("local_list_dir", { path: target });
      if (seq !== loadSeq) return;
      set({
        currentPath: target,
        entries: Array.isArray(entries) ? entries : [],
        loading: false,
        error: null,
      });
    } catch (err) {
      if (seq !== loadSeq) return;
      set({ loading: false, error: errorMessage(err) });
    }
  },

  refresh: async () => {
    const { currentPath, load } = get();
    if (currentPath) await load(currentPath);
  },
}));

/** Test hook: forget that the pane was initialised. */
export function resetLocalExplorerInit(): void {
  initStarted = false;
  loadSeq = 0;
}
