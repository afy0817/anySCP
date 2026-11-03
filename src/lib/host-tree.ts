import type { HostGroup } from "../types";

// Groups form a tree (HostGroup.parent_id); hosts and S3 connections sit in a
// group via group_id. These helpers walk that tree and decide what a
// drag-and-drop on the hosts page does.

export type TreeItemKind = "group" | "host" | "s3";

/** A draggable entry on the hosts page. */
export interface TreeItemRef {
  kind: TreeItemKind;
  id: string;
}

export interface GroupTree {
  byId: Map<string, HostGroup>;
  /** Child groups by parent id (`null` = top level), in `sort_order`. */
  children: Map<string | null, HostGroup[]>;
}

/** `groups` must already be in `sort_order` (as the groups store keeps them). */
export function buildGroupTree(groups: HostGroup[]): GroupTree {
  const byId = new Map(groups.map((g) => [g.id, g]));
  const children = new Map<string | null, HostGroup[]>();
  for (const group of groups) {
    const parent = folderOf(group.parent_id, byId);
    const siblings = children.get(parent);
    if (siblings) siblings.push(group);
    else children.set(parent, [group]);
  }
  return { byId, children };
}

/**
 * The group an entry is shown in. `s3_connections.group_id` has no foreign key,
 * so it can still name a deleted group — such an entry shows at the top level.
 */
export function folderOf(groupId: string | null, byId: Map<string, HostGroup>): string | null {
  return groupId !== null && byId.has(groupId) ? groupId : null;
}

/** `id` and every group below it. */
export function subtreeIds(tree: GroupTree, id: string): Set<string> {
  const ids = new Set<string>();
  const stack = [id];
  for (let cur = stack.pop(); cur !== undefined; cur = stack.pop()) {
    ids.add(cur);
    for (const child of tree.children.get(cur) ?? []) stack.push(child.id);
  }
  return ids;
}

/** Groups from the top level down to `id`, inclusive. Empty for `null`. */
export function groupPath(tree: GroupTree, id: string | null): HostGroup[] {
  const path: HostGroup[] = [];
  for (
    let cur = id === null ? undefined : tree.byId.get(id);
    cur !== undefined;
    cur = cur.parent_id === null ? undefined : tree.byId.get(cur.parent_id)
  ) {
    path.unshift(cur);
  }
  return path;
}

/** Every group in tree order (each parent right before its children). */
export function flattenGroups(tree: GroupTree): { group: HostGroup; depth: number }[] {
  const out: { group: HostGroup; depth: number }[] = [];
  const walk = (parent: string | null, depth: number) => {
    for (const group of tree.children.get(parent) ?? []) {
      out.push({ group, depth });
      walk(group.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

/** Group picker options in tree order, labelled with the full path ("Prod / Web"). */
export function groupOptions(groups: HostGroup[]): { value: string; label: string }[] {
  const tree = buildGroupTree(groups);
  return flattenGroups(tree).map(({ group }) => ({
    value: group.id,
    label: groupPath(tree, group.id)
      .map((g) => g.name)
      .join(" / "),
  }));
}

// ─── Drag and drop ───────────────────────────────────────────────────────────

/** Where on a target the pointer is: next to it, or into it (groups only). */
export type DropZone = "before" | "inside" | "after";

export type DropTarget =
  /** A place that only takes entries in (breadcrumb, top-level strip). */
  | { type: "folder"; folderId: string | null }
  /** An entry; `folderId` is the group it sits in. `axis` is the list direction. */
  | { type: "item"; item: TreeItemRef; folderId: string | null; axis: "x" | "y" };

export interface DropMove {
  /** Group the dragged entry ends up in (`null` = top level). */
  folderId: string | null;
  /** Same-kind neighbour to sit next to, when dropped beside one. */
  anchor: { id: string; after: boolean } | null;
}

/**
 * Which part of `target` the pointer is over. Groups split into
 * before / inside / after (outer quarters reorder, middle moves in);
 * hosts and S3 connections into before / after halves.
 */
export function dropZone(
  point: { x: number; y: number },
  rect: { left: number; top: number; width: number; height: number },
  target: DropTarget,
): DropZone {
  if (target.type === "folder") return "inside";
  const pos =
    target.axis === "y" ? (point.y - rect.top) / rect.height : (point.x - rect.left) / rect.width;
  if (target.item.kind === "group") {
    if (pos < 0.25) return "before";
    if (pos > 0.75) return "after";
    return "inside";
  }
  return pos < 0.5 ? "before" : "after";
}

/** What dropping `drag` on `target` does, or `null` when that drop isn't allowed. */
export function resolveDrop(
  tree: GroupTree,
  drag: TreeItemRef,
  target: DropTarget,
  zone: DropZone,
): DropMove | null {
  let move: DropMove;
  if (target.type === "folder") {
    move = { folderId: target.folderId, anchor: null };
  } else if (target.item.kind === drag.kind && target.item.id === drag.id) {
    return null;
  } else if (zone === "inside") {
    move = { folderId: target.item.id, anchor: null };
  } else {
    move = {
      folderId: target.folderId,
      anchor:
        target.item.kind === drag.kind ? { id: target.item.id, after: zone === "after" } : null,
    };
  }
  // A group can't go into itself or anything below it.
  if (drag.kind === "group" && move.folderId !== null && subtreeIds(tree, drag.id).has(move.folderId)) {
    return null;
  }
  return move;
}

/** `list` with entry `id` moved right before / after `anchor`. */
export function placeNextTo<T extends { id: string }>(
  list: T[],
  id: string,
  anchor: { id: string; after: boolean },
): T[] {
  const item = list.find((x) => x.id === id);
  if (!item) throw new Error(`placeNextTo: no entry ${id}`);
  const rest = list.filter((x) => x.id !== id);
  const at = rest.findIndex((x) => x.id === anchor.id);
  if (at === -1) throw new Error(`placeNextTo: no anchor ${anchor.id}`);
  rest.splice(anchor.after ? at + 1 : at, 0, item);
  return rest;
}
