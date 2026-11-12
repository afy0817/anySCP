import { Fragment, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ChevronRight, Cloud, Folder, ListTree, Server } from "lucide-react";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  pointerWithin,
  closestCenter,
  type CollisionDetection,
  type DragEndEvent,
  type DragMoveEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import type { HostGroup, S3Connection, SavedHost } from "../../types";
import {
  buildGroupTree,
  dropZone,
  folderOf,
  groupPath,
  placeNextTo,
  resolveDrop,
  type DropMove,
  type DropTarget,
  type GroupTree,
  type TreeItemKind,
  type TreeItemRef,
} from "../../lib/host-tree";
import { useHostsStore } from "../../stores/hosts-store";
import { useGroupsStore } from "../../stores/groups-store";
import { useS3Store } from "../../stores/s3-store";
import { useHostBrowserStore, type HostViewMode } from "../../stores/host-browser-store";
import { toast } from "../../stores/toast-store";
import { DropHoverContext, useFolderDrop, type DragData, type DropHover } from "./HostDnd";
import { HostTreeView } from "./HostTreeView";
import { HostFolderView } from "./HostFolderView";

export interface HostActions {
  onConnect: (host: SavedHost) => void;
  onExplore: (host: SavedHost) => void;
  onEdit: (hostId: string) => void;
  onDelete: (hostId: string) => void;
  onDuplicate: (host: SavedHost) => void;
  onS3Connect: (conn: S3Connection) => void;
  onS3Edit: (conn: S3Connection) => void;
  onS3Duplicate: (conn: S3Connection) => void;
  onS3Delete: (conn: S3Connection) => void;
  onGroupDelete: (groupId: string) => void;
  /** Open the edit dialog for a group's name, icon and color. */
  onGroupEdit: (group: HostGroup) => void;
  /** Open the new-group dialog for a group under `parentId` (`null` = top level). */
  onGroupCreate: (parentId: string | null) => void;
}

/** Hosts and S3 connections directly in each group (`null` = top level). */
export type FolderEntries = Map<string | null, { hosts: SavedHost[]; s3: S3Connection[] }>;

interface HostBrowserProps {
  hosts: SavedHost[];
  groups: HostGroup[];
  s3Connections: S3Connection[];
  query: string;
  actions: HostActions;
  /** Shown when the view has nothing in it; `inGroup` = an open group in folder view. */
  renderEmpty: (inGroup: boolean) => ReactNode;
}

const ORDER_FAILED_KEYS = {
  group: "hostsPage.toasts.groupOrderFailed",
  host: "hostsPage.toasts.hostOrderFailed",
  s3: "hostsPage.toasts.s3OrderFailed",
} as const satisfies Record<TreeItemKind, string>;

/** A drop's effect: a reorder in place, or a move to another group. */
interface DropPlan {
  kind: "reorder" | "move";
  run: () => Promise<void>;
}

/** What dropping entry `id` per `move` changes in `list`, or `null` if nothing. */
function planDrop<T extends { id: string }>(
  list: T[],
  id: string,
  move: DropMove,
  tree: GroupTree,
  folderIdOf: (entry: T) => string | null,
  reorder: (order: T[]) => Promise<void>,
  moveTo: (id: string, folderId: string | null, order?: T[]) => Promise<void>,
): DropPlan | null {
  const entry = list.find((x) => x.id === id);
  if (!entry) throw new Error(`planDrop: no entry ${id}`);
  const order = move.anchor ? placeNextTo(list, id, move.anchor) : null;
  const reordered = order !== null && order.some((x, idx) => x.id !== list[idx].id);
  if (folderOf(folderIdOf(entry), tree.byId) !== move.folderId) {
    return { kind: "move", run: () => moveTo(id, move.folderId, reordered ? order : undefined) };
  }
  if (reordered) return { kind: "reorder", run: () => reorder(order) };
  return null;
}

/** Pointer position during a drag; the dragged element's centre for touch / keyboard. */
function dragPoint(e: DragMoveEvent | DragEndEvent): { x: number; y: number } | null {
  const start = e.activatorEvent;
  if (start instanceof MouseEvent) {
    return { x: start.clientX + e.delta.x, y: start.clientY + e.delta.y };
  }
  const rect = e.active.rect.current.translated;
  return rect === null ? null : { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

// The pointer picks the target (rows are thin, so an overlap test would land
// on a neighbour); a keyboard drag has no pointer and takes the nearest one.
const collision: CollisionDetection = (args) =>
  args.pointerCoordinates ? pointerWithin(args) : closestCenter(args);

function hostMatches(host: SavedHost, q: string): boolean {
  return (
    host.host.toLowerCase().includes(q) ||
    host.label.toLowerCase().includes(q) ||
    host.username.toLowerCase().includes(q)
  );
}

function s3Matches(conn: S3Connection, q: string): boolean {
  return (
    conn.label.toLowerCase().includes(q) ||
    conn.provider.toLowerCase().includes(q) ||
    (conn.bucket?.toLowerCase().includes(q) ?? false)
  );
}

/** Saved hosts, S3 connections and their groups as a tree or a folder browser. */
export function HostBrowser({
  hosts,
  groups,
  s3Connections,
  query,
  actions,
  renderEmpty,
}: HostBrowserProps) {
  const { t } = useTranslation("dashboard");
  const viewMode = useHostBrowserStore((s) => s.viewMode);
  const setViewMode = useHostBrowserStore((s) => s.setViewMode);
  const storedFolderId = useHostBrowserStore((s) => s.folderId);
  const setFolderId = useHostBrowserStore((s) => s.setFolderId);
  const collapsed = useHostBrowserStore((s) => s.collapsed);
  const toggleCollapsed = useHostBrowserStore((s) => s.toggleCollapsed);
  const reorderHosts = useHostsStore((s) => s.reorderHosts);
  const moveHost = useHostsStore((s) => s.moveHost);
  const reorderGroups = useGroupsStore((s) => s.reorderGroups);
  const moveGroup = useGroupsStore((s) => s.moveGroup);
  const reorderS3 = useS3Store((s) => s.reorderConnections);
  const moveS3 = useS3Store((s) => s.moveConnection);

  const tree = useMemo(() => buildGroupTree(groups), [groups]);
  // The remembered group may have been deleted since.
  const folderId = folderOf(storedFolderId, tree.byId);
  const q = query.trim().toLowerCase();
  const searching = q !== "";

  const entries = useMemo<FolderEntries>(() => {
    const map: FolderEntries = new Map();
    const slot = (id: string | null) => {
      let entry = map.get(id);
      if (!entry) {
        entry = { hosts: [], s3: [] };
        map.set(id, entry);
      }
      return entry;
    };
    for (const host of hosts) {
      if (!searching || hostMatches(host, q)) slot(folderOf(host.group_id, tree.byId)).hosts.push(host);
    }
    for (const conn of s3Connections) {
      if (!searching || s3Matches(conn, q)) slot(folderOf(conn.group_id, tree.byId)).s3.push(conn);
    }
    return map;
  }, [hosts, s3Connections, tree, searching, q]);

  // Subtree totals for each group's badge — unaffected by the search.
  const counts = useMemo(() => {
    const direct = new Map<string, number>();
    for (const groupId of [...hosts.map((h) => h.group_id), ...s3Connections.map((c) => c.group_id)]) {
      const folder = folderOf(groupId, tree.byId);
      if (folder !== null) direct.set(folder, (direct.get(folder) ?? 0) + 1);
    }
    const totals = new Map<string, number>();
    const total = (id: string): number => {
      const sum = (tree.children.get(id) ?? []).reduce(
        (acc, cur) => acc + total(cur.id),
        direct.get(id) ?? 0,
      );
      totals.set(id, sum);
      return sum;
    };
    for (const group of tree.children.get(null) ?? []) total(group.id);
    return totals;
  }, [hosts, s3Connections, tree]);

  // While searching, the tree shows only the branches leading to a match.
  const visibleGroups = useMemo(() => {
    if (!searching) return null;
    const visible = new Set<string>();
    for (const folder of entries.keys()) {
      for (const group of groupPath(tree, folder)) visible.add(group.id);
    }
    return visible;
  }, [searching, entries, tree]);

  // ─── Drag and drop ─────────────────────────────────────────────────────────

  // Same gestures as the old sortable grids: a 5px mouse move, a 250ms touch
  // press, or Space on a focused entry — so a plain click still connects.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(KeyboardSensor),
  );
  const [activeItem, setActiveItem] = useState<TreeItemRef | null>(null);
  const [hover, setHover] = useState<DropHover | null>(null);

  const labelOf = (item: TreeItemRef): string => {
    if (item.kind === "group") return tree.byId.get(item.id)?.name ?? "";
    if (item.kind === "host") {
      const host = hosts.find((h) => h.id === item.id);
      return host ? host.label || host.host : "";
    }
    return s3Connections.find((c) => c.id === item.id)?.label ?? "";
  };

  const planFor = (drag: TreeItemRef, move: DropMove): DropPlan | null => {
    if (drag.kind === "group") {
      return planDrop(groups, drag.id, move, tree, (g) => g.parent_id, reorderGroups, moveGroup);
    }
    if (drag.kind === "host") {
      return planDrop(hosts, drag.id, move, tree, (h) => h.group_id, reorderHosts, moveHost);
    }
    return planDrop(s3Connections, drag.id, move, tree, (c) => c.group_id, reorderS3, moveS3);
  };

  const evaluate = (e: DragMoveEvent | DragOverEvent | DragEndEvent) => {
    const drag = (e.active.data.current as DragData | undefined)?.item;
    const target = e.over?.data.current as DropTarget | undefined;
    const point = dragPoint(e);
    if (drag === undefined || e.over === null || target === undefined || point === null) return null;
    const zone = dropZone(point, e.over.rect, target);
    const move = resolveDrop(tree, drag, target, zone);
    const plan = move === null ? null : planFor(drag, move);
    return plan === null ? null : { hover: { key: String(e.over.id), zone }, drag, plan };
  };

  // onDragMove carries the previous target until onDragOver reports the new
  // one, so both feed the indicator.
  const handleDragMove = (e: DragMoveEvent | DragOverEvent) => {
    const next = evaluate(e)?.hover ?? null;
    setHover((prev) =>
      prev !== null && next !== null && prev.key === next.key && prev.zone === next.zone ? prev : next,
    );
  };

  const handleDragEnd = (e: DragEndEvent) => {
    const result = evaluate(e);
    setActiveItem(null);
    setHover(null);
    if (result === null) return;
    const name = labelOf(result.drag);
    const { kind } = result.drag;
    result.plan.run().catch(() => {
      toast.error(
        result.plan.kind === "move"
          ? t("hostsPage.toasts.moveFailed", { name })
          : t(ORDER_FAILED_KEYS[kind]),
      );
    });
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  const folderGroups = tree.children.get(folderId) ?? [];
  const folderEntries = entries.get(folderId) ?? { hosts: [], s3: [] };

  let body: ReactNode;
  if (viewMode === "folder" && searching) {
    const allHosts = [...entries.values()].flatMap((e) => e.hosts);
    const allS3 = [...entries.values()].flatMap((e) => e.s3);
    body =
      allHosts.length + allS3.length === 0 ? (
        renderEmpty(false)
      ) : (
        <HostFolderView
          tree={tree}
          groups={[]}
          hosts={allHosts}
          s3={allS3}
          counts={counts}
          onOpen={setFolderId}
          dndDisabled
          actions={actions}
        />
      );
  } else if (viewMode === "folder") {
    body =
      folderGroups.length + folderEntries.hosts.length + folderEntries.s3.length === 0 ? (
        renderEmpty(folderId !== null)
      ) : (
        <HostFolderView
          tree={tree}
          groups={folderGroups}
          hosts={folderEntries.hosts}
          s3={folderEntries.s3}
          counts={counts}
          onOpen={setFolderId}
          dndDisabled={false}
          actions={actions}
        />
      );
  } else {
    const nothing = searching ? entries.size === 0 : groups.length + hosts.length + s3Connections.length === 0;
    body = nothing ? (
      renderEmpty(false)
    ) : (
      <HostTreeView
        tree={tree}
        entries={entries}
        counts={counts}
        totalCount={hosts.length + s3Connections.length}
        visibleGroups={visibleGroups}
        collapsed={collapsed}
        onToggle={toggleCollapsed}
        dndDisabled={searching}
        actions={actions}
      />
    );
  }

  return (
    <section aria-labelledby="hosts-heading">
      <DndContext
        sensors={sensors}
        collisionDetection={collision}
        onDragStart={(e) => setActiveItem((e.active.data.current as DragData).item)}
        onDragMove={handleDragMove}
        onDragOver={handleDragMove}
        onDragEnd={handleDragEnd}
        onDragCancel={() => {
          setActiveItem(null);
          setHover(null);
        }}
      >
        <DropHoverContext.Provider value={hover}>
          <div className="flex items-center justify-between gap-3 mb-3">
            <h2
              id="hosts-heading"
              className="min-w-0 text-[length:var(--text-xs)] font-semibold uppercase tracking-widest text-text-muted"
            >
              {viewMode === "folder" && !searching ? (
                <Breadcrumb tree={tree} folderId={folderId} onOpen={setFolderId} />
              ) : (
                // The tree's own top row already reads "Hosts".
                <span className={viewMode === "tree" ? "sr-only" : undefined}>{t("hostsPage.hostsHeading")}</span>
              )}
            </h2>
            <ViewToggle value={viewMode} onChange={setViewMode} />
          </div>
          {body}
        </DropHoverContext.Provider>

        <DragOverlay dropAnimation={null}>
          {activeItem && <DragChip kind={activeItem.kind} label={labelOf(activeItem)} />}
        </DragOverlay>
      </DndContext>
    </section>
  );
}

// ─── Header pieces ───────────────────────────────────────────────────────────

function Breadcrumb({
  tree,
  folderId,
  onOpen,
}: {
  tree: GroupTree;
  folderId: string | null;
  onOpen: (id: string | null) => void;
}) {
  const { t } = useTranslation("dashboard");
  return (
    <nav aria-label={t("hostsPage.groupPath")} className="flex flex-wrap items-center gap-0.5">
      <Crumb folderId={null} label={t("hostsPage.hostsHeading")} current={folderId === null} onOpen={onOpen} />
      {groupPath(tree, folderId).map((group) => (
        <Fragment key={group.id}>
          <ChevronRight size={12} strokeWidth={2.2} aria-hidden="true" className="shrink-0" />
          <Crumb folderId={group.id} label={group.name} current={group.id === folderId} onOpen={onOpen} />
        </Fragment>
      ))}
    </nav>
  );
}

/** A breadcrumb step: opens that group, and takes dropped entries in. */
function Crumb({
  folderId,
  label,
  current,
  onOpen,
}: {
  folderId: string | null;
  label: string;
  current: boolean;
  onOpen: (id: string | null) => void;
}) {
  const drop = useFolderDrop(folderId, false);
  return (
    <button
      ref={drop.setRef}
      type="button"
      data-testid={`host-crumb-${folderId ?? "top"}`}
      aria-current={current ? "location" : undefined}
      onClick={() => onOpen(folderId)}
      className={[
        "max-w-48 truncate px-1 py-0.5 rounded uppercase tracking-widest",
        "transition-colors duration-[var(--duration-fast)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        current ? "text-text-secondary" : "hover:text-text-secondary",
        drop.active ? "ring-2 ring-accent bg-accent-muted" : "",
      ].join(" ")}
    >
      {label}
    </button>
  );
}

const VIEW_OPTIONS = [
  { mode: "tree", icon: ListTree, labelKey: "hostsPage.view.tree" },
  { mode: "folder", icon: Folder, labelKey: "hostsPage.view.folder" },
] as const satisfies readonly { mode: HostViewMode; icon: React.ElementType; labelKey: string }[];

function ViewToggle({ value, onChange }: { value: HostViewMode; onChange: (mode: HostViewMode) => void }) {
  const { t } = useTranslation("dashboard");
  return (
    <div
      role="group"
      aria-label={t("hostsPage.view.label")}
      className="flex items-center shrink-0 p-0.5 rounded-lg bg-bg-surface border border-border"
    >
      {VIEW_OPTIONS.map(({ mode, icon: Icon, labelKey }) => (
        <button
          key={mode}
          type="button"
          data-testid={`host-view-${mode}`}
          aria-pressed={value === mode}
          onClick={() => onChange(mode)}
          className={[
            "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[length:var(--text-xs)] font-medium",
            "transition-colors duration-[var(--duration-fast)]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            value === mode ? "bg-bg-overlay text-text-primary" : "text-text-muted hover:text-text-secondary",
          ].join(" ")}
        >
          <Icon size={13} strokeWidth={2} aria-hidden="true" />
          {t(labelKey)}
        </button>
      ))}
    </div>
  );
}

const CHIP_ICONS = { group: Folder, host: Server, s3: Cloud } as const satisfies Record<TreeItemKind, React.ElementType>;

/** What follows the pointer while dragging. */
function DragChip({ kind, label }: { kind: TreeItemKind; label: string }) {
  const Icon = CHIP_ICONS[kind];
  return (
    <div
      className={[
        "inline-flex items-center gap-2 max-w-64 px-3 py-1.5 rounded-lg pointer-events-none",
        "bg-bg-overlay border border-border-focus shadow-[var(--shadow-md)]",
        "text-[length:var(--text-sm)] font-medium text-text-primary",
      ].join(" ")}
    >
      <Icon size={14} strokeWidth={2} aria-hidden="true" className="shrink-0 text-text-muted" />
      <span className="truncate">{label}</span>
    </div>
  );
}
