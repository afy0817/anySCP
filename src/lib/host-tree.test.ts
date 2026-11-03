import { describe, it, expect } from "vitest";
import type { HostGroup } from "../types";
import {
  buildGroupTree,
  dropZone,
  flattenGroups,
  folderOf,
  groupOptions,
  groupPath,
  placeNextTo,
  resolveDrop,
  subtreeIds,
  type DropTarget,
} from "./host-tree";

function group(id: string, parent: string | null = null): HostGroup {
  return {
    id,
    name: id.toUpperCase(),
    color: "#6366f1",
    icon: null,
    sort_order: 0,
    default_username: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    parent_id: parent,
  };
}

// a ─ b ─ c, plus d at the top level.
const groups = [group("a"), group("b", "a"), group("d"), group("c", "b")];
const tree = buildGroupTree(groups);

describe("group tree", () => {
  it("lists children per parent in the given order", () => {
    expect(tree.children.get(null)?.map((g) => g.id)).toEqual(["a", "d"]);
    expect(tree.children.get("a")?.map((g) => g.id)).toEqual(["b"]);
    expect(tree.children.get("c")).toBeUndefined();
  });

  it("puts an entry whose group is gone at the top level", () => {
    expect(folderOf("b", tree.byId)).toBe("b");
    expect(folderOf("deleted", tree.byId)).toBeNull();
    expect(folderOf(null, tree.byId)).toBeNull();
  });

  it("collects a group's whole subtree", () => {
    expect([...subtreeIds(tree, "a")].sort()).toEqual(["a", "b", "c"]);
    expect([...subtreeIds(tree, "c")]).toEqual(["c"]);
  });

  it("walks the path from the top level down", () => {
    expect(groupPath(tree, "c").map((g) => g.id)).toEqual(["a", "b", "c"]);
    expect(groupPath(tree, null)).toEqual([]);
  });

  it("flattens parents before their children", () => {
    expect(flattenGroups(tree).map(({ group: g, depth }) => `${g.id}${depth}`)).toEqual([
      "a0", "b1", "c2", "d0",
    ]);
  });

  it("labels picker options with the full path", () => {
    expect(groupOptions(groups)).toEqual([
      { value: "a", label: "A" },
      { value: "b", label: "A / B" },
      { value: "c", label: "A / B / C" },
      { value: "d", label: "D" },
    ]);
  });
});

describe("dropZone", () => {
  const rect = { left: 0, top: 0, width: 100, height: 40 };
  const row = (kind: "group" | "host"): DropTarget => ({
    type: "item",
    item: { kind, id: "x" },
    folderId: null,
    axis: "y",
  });

  it("splits a group row into before / inside / after", () => {
    expect(dropZone({ x: 50, y: 5 }, rect, row("group"))).toBe("before");
    expect(dropZone({ x: 50, y: 20 }, rect, row("group"))).toBe("inside");
    expect(dropZone({ x: 50, y: 35 }, rect, row("group"))).toBe("after");
  });

  it("splits a host row into before / after halves", () => {
    expect(dropZone({ x: 50, y: 19 }, rect, row("host"))).toBe("before");
    expect(dropZone({ x: 50, y: 21 }, rect, row("host"))).toBe("after");
  });

  it("uses the horizontal position on a card grid", () => {
    const card: DropTarget = { type: "item", item: { kind: "host", id: "x" }, folderId: null, axis: "x" };
    expect(dropZone({ x: 20, y: 39 }, rect, card)).toBe("before");
    expect(dropZone({ x: 80, y: 1 }, rect, card)).toBe("after");
  });

  it("always drops into a folder target", () => {
    expect(dropZone({ x: 0, y: 0 }, rect, { type: "folder", folderId: "a" })).toBe("inside");
  });
});

describe("resolveDrop", () => {
  const hostIn = (folderId: string | null): DropTarget => ({
    type: "item",
    item: { kind: "host", id: "h2" },
    folderId,
    axis: "y",
  });
  const groupRow = (id: string, folderId: string | null): DropTarget => ({
    type: "item",
    item: { kind: "group", id },
    folderId,
    axis: "y",
  });

  it("moves into a folder target", () => {
    expect(resolveDrop(tree, { kind: "host", id: "h1" }, { type: "folder", folderId: "b" }, "inside")).toEqual({
      folderId: "b",
      anchor: null,
    });
  });

  it("moves into a group dropped on its middle", () => {
    expect(resolveDrop(tree, { kind: "host", id: "h1" }, groupRow("d", null), "inside")).toEqual({
      folderId: "d",
      anchor: null,
    });
  });

  it("sits next to a same-kind neighbour, in that neighbour's group", () => {
    expect(resolveDrop(tree, { kind: "host", id: "h1" }, hostIn("b"), "after")).toEqual({
      folderId: "b",
      anchor: { id: "h2", after: true },
    });
  });

  it("only changes group next to an entry of another kind", () => {
    expect(resolveDrop(tree, { kind: "s3", id: "s1" }, hostIn("b"), "before")).toEqual({
      folderId: "b",
      anchor: null,
    });
    expect(resolveDrop(tree, { kind: "host", id: "h1" }, groupRow("b", "a"), "before")).toEqual({
      folderId: "a",
      anchor: null,
    });
  });

  it("refuses a drop on the dragged entry itself", () => {
    expect(resolveDrop(tree, { kind: "group", id: "d" }, groupRow("d", null), "inside")).toBeNull();
  });

  it("refuses moving a group into itself or below it", () => {
    expect(resolveDrop(tree, { kind: "group", id: "a" }, groupRow("c", "b"), "inside")).toBeNull();
    expect(resolveDrop(tree, { kind: "group", id: "a" }, { type: "folder", folderId: "b" }, "inside")).toBeNull();
    // Next to its own descendant means into that descendant's parent — still below it.
    expect(resolveDrop(tree, { kind: "group", id: "a" }, groupRow("c", "b"), "before")).toBeNull();
  });

  it("lets a group move up or next to an unrelated group", () => {
    expect(resolveDrop(tree, { kind: "group", id: "c" }, { type: "folder", folderId: null }, "inside")).toEqual({
      folderId: null,
      anchor: null,
    });
    expect(resolveDrop(tree, { kind: "group", id: "c" }, groupRow("d", null), "before")).toEqual({
      folderId: null,
      anchor: { id: "d", after: false },
    });
  });
});

describe("placeNextTo", () => {
  const list = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];

  it("moves an entry before or after the anchor", () => {
    expect(placeNextTo(list, "d", { id: "b", after: false }).map((x) => x.id)).toEqual(["a", "d", "b", "c"]);
    expect(placeNextTo(list, "a", { id: "c", after: true }).map((x) => x.id)).toEqual(["b", "c", "a", "d"]);
  });

  it("throws on an unknown id instead of dropping the entry", () => {
    expect(() => placeNextTo(list, "x", { id: "a", after: false })).toThrow();
    expect(() => placeNextTo(list, "a", { id: "x", after: false })).toThrow();
  });
});
