import { describe, it, expect, beforeEach, vi } from "vitest";
import type { HostGroup } from "../types";
import { useGroupsStore } from "./groups-store";

// The store reaches the backend via a dynamic `import("@tauri-apps/api/core")`,
// so we mock that module's `invoke`. Each test swaps the implementation.
const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invoke(...args),
}));

function makeGroup(id: string, name: string, sortOrder: number): HostGroup {
  return {
    id,
    name,
    color: "#6366f1",
    icon: null,
    sort_order: sortOrder,
    default_username: null,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
    parent_id: null,
  };
}

const a = makeGroup("a", "alpha", 0);
const b = makeGroup("b", "bravo", 1);
const c = makeGroup("c", "charlie", 2);

describe("groups-store reorderGroups", () => {
  beforeEach(() => {
    invoke.mockReset();
    useGroupsStore.setState({ groups: [a, b, c], error: null });
  });

  it("optimistically applies the new order and persists the id list", async () => {
    invoke.mockResolvedValue(undefined);
    const newOrder = [c, a, b];

    await useGroupsStore.getState().reorderGroups(newOrder);

    // sort_order follows the new positions, as reorder_groups stores them.
    expect(useGroupsStore.getState().groups).toEqual([
      { ...c, sort_order: 0 },
      { ...a, sort_order: 1 },
      { ...b, sort_order: 2 },
    ]);
    expect(invoke).toHaveBeenCalledWith("reorder_groups", {
      orderedIds: ["c", "a", "b"],
    });
  });

  it("applies the new order immediately, before the backend resolves", async () => {
    let resolveInvoke: () => void = () => {};
    invoke.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveInvoke = resolve;
      }),
    );

    const promise = useGroupsStore.getState().reorderGroups([b, c, a]);

    // Optimistic update is visible synchronously, while invoke is still pending.
    expect(useGroupsStore.getState().groups.map((g) => g.id)).toEqual(["b", "c", "a"]);

    resolveInvoke();
    await promise;
  });

  it("reverts to the previous order and rethrows when persistence fails", async () => {
    invoke.mockRejectedValue(new Error("db locked"));

    await expect(
      useGroupsStore.getState().reorderGroups([c, b, a]),
    ).rejects.toThrow("db locked");

    // Order rolled back to the pre-drag state.
    expect(useGroupsStore.getState().groups).toEqual([a, b, c]);
  });
});

describe("groups-store moveGroup", () => {
  beforeEach(() => {
    invoke.mockReset();
    useGroupsStore.setState({ groups: [a, b, c], error: null });
  });

  it("re-parents the group and renumbers sort_order when a new order comes with it", async () => {
    invoke.mockResolvedValue(undefined);

    await useGroupsStore.getState().moveGroup("a", "c", [b, c, a]);

    expect(useGroupsStore.getState().groups).toEqual([
      { ...b, sort_order: 0 },
      { ...c, sort_order: 1 },
      { ...a, sort_order: 2, parent_id: "c" },
    ]);
    expect(invoke).toHaveBeenCalledWith("move_group", { id: "a", parentId: "c" });
    expect(invoke).toHaveBeenCalledWith("reorder_groups", { orderedIds: ["b", "c", "a"] });
  });

  it("keeps sort_order as is when only the parent changes", async () => {
    invoke.mockResolvedValue(undefined);

    await useGroupsStore.getState().moveGroup("b", "a");

    expect(useGroupsStore.getState().groups).toEqual([a, { ...b, parent_id: "a" }, c]);
    expect(invoke).not.toHaveBeenCalledWith("reorder_groups", expect.anything());
  });
});
