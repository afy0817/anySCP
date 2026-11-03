import { useState, type KeyboardEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  ChevronRight, Cloud, Copy, FolderOpen, FolderPlus, FolderRoot, Pencil, TerminalSquare, Trash2,
} from "lucide-react";
import type { HostGroup, S3Connection, SavedHost } from "../../types";
import type { DropZone, GroupTree, TreeItemRef } from "../../lib/host-tree";
import { ContextMenu } from "../shared/ContextMenu";
import { ConfirmDangerDialog } from "../shared/ConfirmDangerDialog";
import { CardActionButton } from "./CardActionButton";
import { getHostColor } from "./HostCard";
import { resolveGroupIcon } from "./GroupModal";
import { useDndEntry, useFolderDrop } from "./HostDnd";
import type { FolderEntries, HostActions } from "./HostBrowser";

interface HostTreeViewProps {
  tree: GroupTree;
  entries: FolderEntries;
  /** Hosts + S3 connections in each group's whole subtree. */
  counts: Map<string, number>;
  /** All hosts + S3 connections, for the top "Hosts" row. */
  totalCount: number;
  /** Groups to show; `null` = all. Set while searching. */
  visibleGroups: Set<string> | null;
  /** Collapsed groups; `null` = the top "Hosts" row. */
  collapsed: Set<string | null>;
  onToggle: (groupId: string | null) => void;
  dndDisabled: boolean;
  actions: HostActions;
}

const INDENT_PX = 22;
/** Every row starts with an icon in a box this wide; tree lines hang from its centre. */
const ICON_BOX_PX = 20;

export function HostTreeView({
  tree,
  entries,
  counts,
  totalCount,
  visibleGroups,
  collapsed,
  onToggle,
  dndDisabled,
  actions,
}: HostTreeViewProps) {
  // Searching shows every branch with a match, whatever was collapsed.
  const isExpanded = (id: string | null) => visibleGroups !== null || !collapsed.has(id);

  const childrenOf = (folderId: string | null) => {
    const groups = (tree.children.get(folderId) ?? []).filter(
      (g) => visibleGroups === null || visibleGroups.has(g.id),
    );
    const { hosts, s3 } = entries.get(folderId) ?? { hosts: [], s3: [] };
    return { groups, hosts, s3, count: groups.length + hosts.length + s3.length };
  };

  // Rows are created top to bottom, so counting them gives each its visible
  // position — every other one gets the faint stripe. The top row is 0.
  let rowCount = 1;
  const nextStriped = () => rowCount++ % 2 === 1;

  // `guides[i]` says whether column i carries a "│" through to a later sibling.
  const renderFolder = (folderId: string | null, depth: number, guides: boolean[]): ReactNode[] => {
    const { groups, hosts, s3, count } = childrenOf(folderId);
    const lastIdx = count - 1;
    const rows: ReactNode[] = [];
    groups.forEach((group, idx) => {
      const expanded = isExpanded(group.id);
      const last = idx === lastIdx;
      rows.push(
        <GroupRow
          key={`group:${group.id}`}
          group={group}
          folderId={folderId}
          depth={depth}
          guides={guides}
          last={last}
          striped={nextStriped()}
          count={counts.get(group.id) ?? 0}
          expanded={expanded}
          hasChildren={childrenOf(group.id).count > 0}
          onToggle={() => onToggle(group.id)}
          dndDisabled={dndDisabled}
          actions={actions}
        />,
      );
      if (expanded) rows.push(...renderFolder(group.id, depth + 1, [...guides, !last]));
    });
    hosts.forEach((host, idx) => {
      rows.push(
        <HostRow
          key={`host:${host.id}`}
          host={host}
          folderId={folderId}
          depth={depth}
          guides={guides}
          last={groups.length + idx === lastIdx}
          striped={nextStriped()}
          dndDisabled={dndDisabled}
          actions={actions}
        />,
      );
    });
    s3.forEach((conn, idx) => {
      rows.push(
        <S3Row
          key={`s3:${conn.id}`}
          conn={conn}
          folderId={folderId}
          depth={depth}
          guides={guides}
          last={groups.length + hosts.length + idx === lastIdx}
          striped={nextStriped()}
          dndDisabled={dndDisabled}
          actions={actions}
        />,
      );
    });
    return rows;
  };

  // Everything hangs under one "Hosts" row: the top level shown as a folder.
  const rootExpanded = isExpanded(null);
  return (
    <div role="tree" className="flex flex-col gap-0.5">
      <RootRow
        count={totalCount}
        expanded={rootExpanded}
        hasChildren={childrenOf(null).count > 0}
        onToggle={() => onToggle(null)}
        dndDisabled={dndDisabled}
        actions={actions}
      />
      {rootExpanded && renderFolder(null, 1, [])}
    </div>
  );
}

// ─── Top-level row ───────────────────────────────────────────────────────────

/** The top level as a folder: collapses everything, and takes drops to move entries to the top. */
function RootRow({
  count,
  expanded,
  hasChildren,
  onToggle,
  dndDisabled,
  actions,
}: {
  count: number;
  expanded: boolean;
  hasChildren: boolean;
  onToggle: () => void;
  dndDisabled: boolean;
  actions: HostActions;
}) {
  const { t } = useTranslation("dashboard");
  const drop = useFolderDrop(null, dndDisabled);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);

  return (
    <>
      <div
        ref={drop.setRef}
        role="treeitem"
        tabIndex={0}
        aria-level={1}
        aria-expanded={expanded}
        data-testid="host-tree-root"
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle();
          }
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setMenu({ x: e.clientX, y: e.clientY });
        }}
        className={rowClass(drop.active ? "inside" : null, false, false)}
        style={{ paddingLeft: 8 }}
      >
        <IconBox>
          <FolderRoot size={15} strokeWidth={1.8} aria-hidden="true" className="text-text-secondary" />
        </IconBox>
        <span className="text-[length:var(--text-sm)] font-medium text-text-primary truncate">
          {t("hostsPage.hostsHeading")}
        </span>
        <span className="text-[length:var(--text-xs)] text-text-muted shrink-0">
          {t("groupCard.hostCount", { count })}
        </span>
        <ToggleChevron expanded={expanded} />
        {expanded && hasChildren && <Stem depth={0} />}
      </div>

      {menu && (
        <ContextMenu
          position={menu}
          onClose={() => setMenu(null)}
          items={[
            {
              label: t("hostsPage.newGroup"),
              icon: FolderPlus,
              onClick: () => actions.onGroupCreate(null),
            },
          ]}
        />
      )}
    </>
  );
}

// ─── Rows ────────────────────────────────────────────────────────────────────

function rowClass(zone: DropZone | null, isDragging: boolean, striped: boolean): string {
  let background = "";
  if (zone === "inside") background = "ring-2 ring-accent bg-accent-muted";
  else if (striped) background = "bg-bg-surface/50";
  return [
    "group relative flex items-center gap-2 h-9 pr-1 rounded-lg text-left touch-none select-none cursor-pointer",
    "hover:bg-bg-overlay",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    isDragging ? "opacity-40" : "",
    background,
  ].join(" ");
}

/** Insertion line above / below a row while it is a before / after drop target. */
function ZoneLine({ zone, depth }: { zone: DropZone | null; depth: number }) {
  if (zone !== "before" && zone !== "after") return null;
  return (
    <div
      aria-hidden="true"
      className={[
        "absolute right-0 h-0.5 rounded-full bg-accent pointer-events-none",
        zone === "before" ? "-top-px" : "-bottom-px",
      ].join(" ")}
      style={{ left: 8 + depth * INDENT_PX }}
    />
  );
}

/** Horizontal centre of tree column `col` — right under the icon of the row at that depth. */
function columnX(col: number): number {
  return 8 + col * INDENT_PX + ICON_BOX_PX / 2;
}

// Vertical tree line, centred on its column.
const LINE_CLASS = "absolute w-px -translate-x-1/2 bg-border pointer-events-none";

/**
 * Connectors to the parent group: "├" / "└" in the row's own column, and "│"
 * in each ancestor column that still has a later sibling below.
 */
function TreeLines({ depth, guides, last }: { depth: number; guides: boolean[]; last: boolean }) {
  if (depth === 0) return null;
  const branchX = columnX(depth - 1);
  const iconX = 8 + depth * INDENT_PX;
  return (
    <>
      {guides.map(
        (on, col) =>
          on && (
            // -top-0.5 bridges the gap-0.5 between rows so the line is unbroken.
            <span key={col} aria-hidden="true" className={`${LINE_CLASS} -top-0.5 bottom-0`} style={{ left: columnX(col) }} />
          ),
      )}
      <span
        aria-hidden="true"
        className={`${LINE_CLASS} -top-0.5 ${last ? "h-[calc(50%+2px)]" : "bottom-0"}`}
        style={{ left: branchX }}
      />
      <span
        aria-hidden="true"
        className="absolute top-1/2 h-px bg-border pointer-events-none"
        style={{ left: branchX, width: iconX - branchX - 2 }}
      />
    </>
  );
}

/** Line from under an open folder's icon down to its first child's connector. */
function Stem({ depth }: { depth: number }) {
  return (
    <span
      aria-hidden="true"
      className={`${LINE_CLASS} bottom-0`}
      style={{ left: columnX(depth), top: `calc(50% + ${ICON_BOX_PX / 2 + 2}px)` }}
    />
  );
}

/** Fixed-width icon slot, so every depth's lines hang from the same spot. */
function IconBox({ children }: { children: ReactNode }) {
  return <span className="flex items-center justify-center w-5 h-5 shrink-0">{children}</span>;
}

/** Expand / collapse marker, pushed to the row's right end. */
function ToggleChevron({ expanded }: { expanded: boolean }) {
  return (
    <ChevronRight
      size={14}
      strokeWidth={2}
      aria-hidden="true"
      className={[
        "ml-auto mr-1.5 shrink-0 text-text-muted transition-transform duration-[var(--duration-fast)]",
        expanded ? "rotate-90" : "",
      ].join(" ")}
    />
  );
}

/** Row keyboard: Enter runs the row action; anything else goes to the drag sensor (Space picks up). */
function rowKeyDown(onEnter: () => void, listeners: ReturnType<typeof useDndEntry>["listeners"]) {
  return (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      onEnter();
      return;
    }
    listeners?.onKeyDown?.(e);
  };
}

interface RowProps {
  folderId: string | null;
  depth: number;
  /** Tree connector state, see TreeLines. */
  guides: boolean[];
  last: boolean;
  /** Every other row gets a faint background so rows are easy to follow. */
  striped: boolean;
  dndDisabled: boolean;
  actions: HostActions;
}

function GroupRow({
  group,
  folderId,
  depth,
  guides,
  last,
  striped,
  count,
  expanded,
  hasChildren,
  onToggle,
  dndDisabled,
  actions,
}: RowProps & {
  group: HostGroup;
  count: number;
  expanded: boolean;
  hasChildren: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation("dashboard");
  const item: TreeItemRef = { kind: "group", id: group.id };
  const dnd = useDndEntry(item, { type: "item", item, folderId, axis: "y" }, dndDisabled);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const Icon = resolveGroupIcon(group.icon);

  return (
    <>
      <div
        ref={dnd.setRef}
        {...dnd.attributes}
        {...dnd.listeners}
        role="treeitem"
        aria-level={depth + 1}
        aria-expanded={expanded}
        data-testid={`group-card-${group.id}`}
        data-group-id={group.id}
        data-group-name={group.name}
        title={group.name}
        onClick={onToggle}
        onKeyDown={rowKeyDown(onToggle, dnd.listeners)}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setMenu({ x: e.clientX, y: e.clientY });
        }}
        className={rowClass(dnd.zone, dnd.isDragging, striped)}
        style={{ paddingLeft: 8 + depth * INDENT_PX }}
      >
        <TreeLines depth={depth} guides={guides} last={last} />
        <IconBox>
          <Icon size={15} strokeWidth={1.8} style={{ color: group.color }} aria-hidden="true" />
        </IconBox>
        <span className="text-[length:var(--text-sm)] font-medium text-text-primary truncate">
          {group.name}
        </span>
        <span className="text-[length:var(--text-xs)] text-text-muted shrink-0">
          {t("groupCard.hostCount", { count })}
        </span>
        <ToggleChevron expanded={expanded} />
        {expanded && hasChildren && <Stem depth={depth} />}
        <ZoneLine zone={dnd.zone} depth={depth} />
      </div>

      {menu && (
        <ContextMenu
          position={menu}
          onClose={() => setMenu(null)}
          items={[
            {
              label: t("groupCard.newSubgroup"),
              icon: FolderPlus,
              onClick: () => actions.onGroupCreate(group.id),
            },
            {
              label: t("groupCard.deleteGroup"),
              icon: Trash2,
              danger: true,
              separator: true,
              onClick: () => actions.onGroupDelete(group.id),
            },
          ]}
        />
      )}
    </>
  );
}

function HostRow({
  host,
  folderId,
  depth,
  guides,
  last,
  striped,
  dndDisabled,
  actions,
}: RowProps & { host: SavedHost }) {
  const { t } = useTranslation(["dashboard", "common"]);
  const item: TreeItemRef = { kind: "host", id: host.id };
  const dnd = useDndEntry(item, { type: "item", item, folderId, axis: "y" }, dndDisabled);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const displayName = host.label || host.host;
  const color = host.color || getHostColor(host.host);

  return (
    <>
      <div
        ref={dnd.setRef}
        {...dnd.attributes}
        {...dnd.listeners}
        role="treeitem"
        aria-level={depth + 1}
        data-testid={`host-card-${host.id}`}
        data-host-id={host.id}
        data-host-label={displayName}
        title={t("card.connectTitle", { name: displayName })}
        onClick={() => actions.onConnect(host)}
        onKeyDown={rowKeyDown(() => actions.onConnect(host), dnd.listeners)}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setMenu({ x: e.clientX, y: e.clientY });
        }}
        className={rowClass(dnd.zone, dnd.isDragging, striped)}
        style={{ paddingLeft: 8 + depth * INDENT_PX }}
      >
        <TreeLines depth={depth} guides={guides} last={last} />
        <span
          aria-hidden="true"
          className="flex items-center justify-center w-5 h-5 rounded-full shrink-0 text-[11px] font-semibold"
          style={{ backgroundColor: `${color}25`, color }}
        >
          {displayName.charAt(0).toUpperCase()}
        </span>
        <span className="text-[length:var(--text-sm)] text-text-primary truncate">{displayName}</span>
        <span className="text-[length:var(--text-xs)] text-text-muted font-mono truncate">
          {host.username}@{host.host}
        </span>
        <div className="ml-auto flex items-center shrink-0 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100">
          <CardActionButton
            icon={TerminalSquare}
            label={t("hostCard.terminal")}
            onClick={() => actions.onConnect(host)}
            ariaLabel={t("hostCard.openTerminalAria", { name: displayName })}
            testId={`host-card-${host.id}-terminal`}
          />
          <CardActionButton
            icon={FolderOpen}
            label={t("hostCard.explorer")}
            onClick={() => actions.onExplore(host)}
            ariaLabel={t("card.openExplorerAria", { name: displayName })}
            testId={`host-card-${host.id}-explorer`}
          />
        </div>
        <ZoneLine zone={dnd.zone} depth={depth} />
      </div>

      {menu && (
        <ContextMenu
          position={menu}
          onClose={() => setMenu(null)}
          items={[
            { label: t("hostCard.terminal"), icon: TerminalSquare, onClick: () => actions.onConnect(host) },
            { label: t("hostCard.explorer"), icon: FolderOpen, onClick: () => actions.onExplore(host) },
            { label: t("common:actions.edit"), icon: Pencil, onClick: () => actions.onEdit(host.id) },
            { label: t("common:actions.duplicate"), icon: Copy, onClick: () => actions.onDuplicate(host) },
            { label: t("common:actions.delete"), icon: Trash2, danger: true, onClick: () => setConfirmDelete(true) },
          ]}
        />
      )}

      <ConfirmDangerDialog
        open={confirmDelete}
        title={t("hostCard.deleteTitle")}
        message={t("hostCard.deleteMessage")}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false);
          actions.onDelete(host.id);
        }}
      />
    </>
  );
}

function S3Row({
  conn,
  folderId,
  depth,
  guides,
  last,
  striped,
  dndDisabled,
  actions,
}: RowProps & { conn: S3Connection }) {
  const { t } = useTranslation(["dashboard", "common"]);
  const item: TreeItemRef = { kind: "s3", id: conn.id };
  const dnd = useDndEntry(item, { type: "item", item, folderId, axis: "y" }, dndDisabled);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const color = conn.color || getHostColor(conn.label);
  const subtitle = [conn.provider, conn.bucket].filter(Boolean).join(" · ");

  return (
    <>
      <div
        ref={dnd.setRef}
        {...dnd.attributes}
        {...dnd.listeners}
        role="treeitem"
        aria-level={depth + 1}
        data-testid={`s3-card-${conn.id}`}
        data-s3-id={conn.id}
        data-s3-label={conn.label}
        title={t("card.connectTitle", { name: conn.label })}
        onClick={() => actions.onS3Connect(conn)}
        onKeyDown={rowKeyDown(() => actions.onS3Connect(conn), dnd.listeners)}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setMenu({ x: e.clientX, y: e.clientY });
        }}
        className={rowClass(dnd.zone, dnd.isDragging, striped)}
        style={{ paddingLeft: 8 + depth * INDENT_PX }}
      >
        <TreeLines depth={depth} guides={guides} last={last} />
        <span
          aria-hidden="true"
          className="flex items-center justify-center w-5 h-5 rounded-full shrink-0"
          style={{ backgroundColor: `${color}25`, color }}
        >
          <Cloud size={11} strokeWidth={2} />
        </span>
        <span className="text-[length:var(--text-sm)] text-text-primary truncate">{conn.label}</span>
        <span className="text-[length:var(--text-xs)] text-text-muted font-mono truncate">{subtitle}</span>
        <div className="ml-auto flex items-center shrink-0 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100">
          <CardActionButton
            icon={FolderOpen}
            label={t("s3Card.explore")}
            onClick={() => actions.onS3Connect(conn)}
            ariaLabel={t("card.openExplorerAria", { name: conn.label })}
            testId={`s3-card-${conn.id}-explorer`}
          />
        </div>
        <ZoneLine zone={dnd.zone} depth={depth} />
      </div>

      {menu && (
        <ContextMenu
          position={menu}
          onClose={() => setMenu(null)}
          items={[
            { label: t("s3Card.explore"), icon: FolderOpen, onClick: () => actions.onS3Connect(conn) },
            { label: t("common:actions.edit"), icon: Pencil, onClick: () => actions.onS3Edit(conn) },
            { label: t("common:actions.duplicate"), icon: Copy, onClick: () => actions.onS3Duplicate(conn) },
            {
              label: t("common:actions.delete"),
              icon: Trash2,
              danger: true,
              separator: true,
              onClick: () => setConfirmDelete(true),
            },
          ]}
        />
      )}

      <ConfirmDangerDialog
        open={confirmDelete}
        title={t("s3Card.deleteTitle")}
        message={t("s3Card.deleteMessage")}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false);
          actions.onS3Delete(conn);
        }}
      />
    </>
  );
}
