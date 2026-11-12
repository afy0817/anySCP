import { create } from "zustand";
import i18n from "../i18n";
import type { HostGroup } from "../types";

interface GroupsState {
  groups: HostGroup[];
  loading: boolean;
  error: string | null;

  loadGroups: () => Promise<void>;
  createGroup: (group: HostGroup) => Promise<void>;
  updateGroup: (group: HostGroup) => Promise<void>;
  deleteGroup: (id: string) => Promise<void>;
  reorderGroups: (newOrder: HostGroup[]) => Promise<void>;
  /** Move a group under `parentId` (`null` = top level), optionally applying
   *  `newOrder` in the same step. */
  moveGroup: (id: string, parentId: string | null, newOrder?: HostGroup[]) => Promise<void>;
}

// reorder_groups stores each group's position as its sort_order. Mirror that
// locally so a later update_group doesn't write back the pre-drag sort_order.
function withSortOrder(order: HostGroup[]): HostGroup[] {
  return order.map((g, idx) => ({ ...g, sort_order: idx }));
}

export const useGroupsStore = create<GroupsState>((set, get) => ({
  groups: [],
  loading: false,
  error: null,

  loadGroups: async () => {
    set({ loading: true, error: null });
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const groups = await invoke<HostGroup[]>("list_groups");
      set({ groups });
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: string }).message)
          : i18n.t("core:groups.loadFailed");
      set({ error: msg });
    } finally {
      set({ loading: false });
    }
  },

  createGroup: async (group) => {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("create_group", { group });
    const groups = await invoke<HostGroup[]>("list_groups");
    set({ groups });
  },

  updateGroup: async (group) => {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("update_group", { group });
    const groups = await invoke<HostGroup[]>("list_groups");
    set({ groups });
  },

  deleteGroup: async (id) => {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("delete_group", { id });
    const groups = await invoke<HostGroup[]>("list_groups");
    set({ groups });
  },

  // Optimistically apply a drag-and-drop group reordering, then persist it. The
  // UI updates instantly and the new order is sent to the backend in the
  // background; on failure we roll back so the displayed state never diverges
  // from what's stored.
  reorderGroups: async (newOrder) => {
    const previous = get().groups;
    set({ groups: withSortOrder(newOrder) });
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("reorder_groups", { orderedIds: newOrder.map((g) => g.id) });
    } catch (err) {
      set({ groups: previous });
      throw err;
    }
  },

  // Optimistic like reorderGroups, but the move and the reorder are two
  // backend writes, so on failure reload what actually got stored.
  moveGroup: async (id, parentId, newOrder) => {
    const base = newOrder ? withSortOrder(newOrder) : get().groups;
    set({ groups: base.map((g) => (g.id === id ? { ...g, parent_id: parentId } : g)) });
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("move_group", { id, parentId });
      if (newOrder) await invoke("reorder_groups", { orderedIds: newOrder.map((g) => g.id) });
    } catch (err) {
      await get().loadGroups();
      throw err;
    }
  },
}));

// E2E test hooks. Defined in bundled source so the dynamic Tauri-API import
// resolves (a bare module specifier can't be resolved in injected code).
if (typeof window !== "undefined") {
  const w = window as unknown as {
    __e2eDeleteGroup?: (id: string) => Promise<void>;
    __e2eGroupOrder?: () => Promise<string[]>;
  };
  // Drives group delete (UI flow uses right-click context menu).
  w.__e2eDeleteGroup = (id) => useGroupsStore.getState().deleteGroup(id);
  // Persisted group order (names) — lets the reorder E2E spec confirm the async
  // backend write landed before relaunching to verify it survives a restart.
  w.__e2eGroupOrder = async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    const groups = await invoke<HostGroup[]>("list_groups");
    return groups.map((g) => g.name);
  };
}
