import { create } from "zustand";

// How the hosts page lays out groups: a collapsible tree, or one group at a
// time like a file browser. The mode is remembered across launches; the open
// group and collapsed branches only for this session.

const VIEW_MODE_KEY = "anyscp.hosts.viewMode";

export type HostViewMode = "tree" | "folder";

interface HostBrowserState {
  viewMode: HostViewMode;
  /** Group shown in folder view; `null` = top level. */
  folderId: string | null;
  /** Groups collapsed in tree view; `null` = the top-level "Hosts" row. */
  collapsed: Set<string | null>;

  setViewMode: (mode: HostViewMode) => void;
  setFolderId: (id: string | null) => void;
  toggleCollapsed: (id: string | null) => void;
}

export const useHostBrowserStore = create<HostBrowserState>((set) => ({
  viewMode: localStorage.getItem(VIEW_MODE_KEY) === "tree" ? "tree" : "folder",
  folderId: null,
  collapsed: new Set(),

  setViewMode: (viewMode) => {
    localStorage.setItem(VIEW_MODE_KEY, viewMode);
    set({ viewMode });
  },

  setFolderId: (folderId) => set({ folderId }),

  toggleCollapsed: (id) =>
    set((state) => {
      const collapsed = new Set(state.collapsed);
      if (collapsed.has(id)) collapsed.delete(id);
      else collapsed.add(id);
      return { collapsed };
    }),
}));
