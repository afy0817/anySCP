import type { HostGroup, S3Connection, SavedHost } from "../../types";
import type { GroupTree } from "../../lib/host-tree";
import { folderOf } from "../../lib/host-tree";
import { GroupCard } from "./GroupCard";
import { HostCard } from "./HostCard";
import { S3Card } from "./S3Card";
import { DndCard } from "./HostDnd";
import type { HostActions } from "./HostBrowser";

interface HostFolderViewProps {
  tree: GroupTree;
  groups: HostGroup[];
  hosts: SavedHost[];
  s3: S3Connection[];
  /** Hosts + S3 connections in each group's whole subtree. */
  counts: Map<string, number>;
  onOpen: (groupId: string) => void;
  dndDisabled: boolean;
  actions: HostActions;
}

/** One group's contents as a card grid: subgroups first, then hosts, then S3. */
export function HostFolderView({
  tree,
  groups,
  hosts,
  s3,
  counts,
  onOpen,
  dndDisabled,
  actions,
}: HostFolderViewProps) {
  return (
    <div className="grid grid-cols-3 gap-2.5">
      {groups.map((group) => (
        <DndCard
          key={`group:${group.id}`}
          item={{ kind: "group", id: group.id }}
          target={{
            type: "item",
            item: { kind: "group", id: group.id },
            folderId: folderOf(group.parent_id, tree.byId),
            axis: "x",
          }}
          disabled={dndDisabled}
        >
          <GroupCard
            group={group}
            hostCount={counts.get(group.id) ?? 0}
            isSelected={false}
            onSelect={onOpen}
            onDelete={actions.onGroupDelete}
          />
        </DndCard>
      ))}
      {hosts.map((host) => (
        <DndCard
          key={`host:${host.id}`}
          item={{ kind: "host", id: host.id }}
          target={{
            type: "item",
            item: { kind: "host", id: host.id },
            folderId: folderOf(host.group_id, tree.byId),
            axis: "x",
          }}
          disabled={dndDisabled}
        >
          <HostCard
            host={host}
            onConnect={actions.onConnect}
            onExplore={actions.onExplore}
            onEdit={actions.onEdit}
            onDelete={actions.onDelete}
            onDuplicate={actions.onDuplicate}
          />
        </DndCard>
      ))}
      {s3.map((conn) => (
        <DndCard
          key={`s3:${conn.id}`}
          item={{ kind: "s3", id: conn.id }}
          target={{
            type: "item",
            item: { kind: "s3", id: conn.id },
            folderId: folderOf(conn.group_id, tree.byId),
            axis: "x",
          }}
          disabled={dndDisabled}
        >
          <S3Card
            conn={conn}
            onConnect={actions.onS3Connect}
            onEdit={actions.onS3Edit}
            onDuplicate={actions.onS3Duplicate}
            onDelete={actions.onS3Delete}
          />
        </DndCard>
      ))}
    </div>
  );
}
