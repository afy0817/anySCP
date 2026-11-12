import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import { useTranslation } from "react-i18next";
import { Search, Plus, FolderPlus, Import, Cloud } from "lucide-react";
import { ImportSshConfigModal } from "./ImportSshConfigModal";
import { S3ConnectDialog } from "../s3/S3ConnectDialog";
import { useHostsStore } from "../../stores/hosts-store";
import { useGroupsStore } from "../../stores/groups-store";
import { useSessionStore } from "../../stores/session-store";
import { useUiStore } from "../../stores/ui-store";
import { useTabStore } from "../../stores/tab-store";
import { useSftpStore } from "../../stores/sftp-store";
import { useS3Store } from "../../stores/s3-store";
import { useHostBrowserStore } from "../../stores/host-browser-store";
import type { SavedHost, HostGroup, RecentConnection, S3Connection } from "../../types";
import { buildGroupTree, folderOf, subtreeIds } from "../../lib/host-tree";
import { HostBrowser } from "./HostBrowser";
import { GroupDeleteDialog } from "./GroupDeleteDialog";
import { GroupModal } from "./GroupModal";
import { ConnectionDialog } from "./ConnectionDialog";
import { RecentConnections } from "./RecentConnections";
import { toast } from "../../stores/toast-store";
import { duplicateS3Connection } from "../../lib/duplicate";

// Abort an in-flight SSH connection attempt on the Rust side. Best-effort:
// the attempt may already have settled, in which case the backend reports it
// found nothing and we simply move on.
async function cancelConnectAttempt(attemptId: string) {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("ssh_cancel_connect", { attemptId });
  } catch {
    /* attempt already finished — nothing to cancel */
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

export function HostsDashboard() {
  const { t } = useTranslation("dashboard");
  const { hosts, loadHosts, recentConnections, loadRecent, duplicateHost, deleteHost } =
    useHostsStore();
  const { groups, loadGroups, createGroup, updateGroup, deleteGroup } = useGroupsStore();
  const setEditingHostId = useUiStore((s) => s.setEditingHostId);
  const viewMode = useHostBrowserStore((s) => s.viewMode);
  const openFolderId = useHostBrowserStore((s) => s.folderId);
  const setOpenFolderId = useHostBrowserStore((s) => s.setFolderId);

  const [query, setQuery] = useState("");

  // Group modal state
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  // Group the new group goes under (`null` = top level).
  const [newGroupParentId, setNewGroupParentId] = useState<string | null>(null);
  const [editingGroup, setEditingGroup] = useState<HostGroup | null>(null);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [s3DialogOpen, setS3DialogOpen] = useState(false);

  // Group delete dialog state
  const [deletingGroup, setDeletingGroup] = useState<{
    group: HostGroup;
    hostCount: number;
    subgroupCount: number;
  } | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);

  // S3 connections
  const s3Connections = useS3Store((s) => s.connections);
  const loadS3Connections = useS3Store((s) => s.loadConnections);

  const [editingS3Connection, setEditingS3Connection] = useState<S3Connection | null>(null);

  const handleS3Duplicate = async (conn: S3Connection) => {
    await duplicateS3Connection(conn);
    await loadS3Connections();
  };

  const handleS3Connect = async (conn: S3Connection) => {
    let cancelled = false;
    const cancel = () => {
      cancelled = true;
      setConnectingHost(null);
    };
    setConnectingHost({ label: conn.label, error: null, retry: () => void handleS3Connect(conn), cancel });
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("s3_reconnect", { id: conn.id });
      if (cancelled) return;
      useS3Store.getState().openSession(conn.id, conn.label);
      if (conn.bucket) {
        useS3Store.getState().setCurrentBucket(conn.id, conn.bucket);
      }
      setConnectingHost(null);
      useTabStore.getState().addTab({ type: "s3", id: conn.id, label: conn.label });
    } catch (err) {
      if (cancelled) return;
      const msg = err && typeof err === "object" && "message" in err
        ? String((err as { message: string }).message)
        : t("hostsPage.errors.s3ConnectFailed");
      setConnectingHost({ label: conn.label, error: msg, retry: () => void handleS3Connect(conn), cancel: null });
    }
  };

  const handleS3Delete = async (conn: S3Connection) => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("s3_delete_connection", { id: conn.id });
      await loadS3Connections();
    } catch { /* best-effort */ }
  };

  // Connection dialog state
  const [connectingHost, setConnectingHost] = useState<{ label: string; error: string | null; retry: (() => void) | null; cancel: (() => void) | null } | null>(null);

  // Load data on mount
  useEffect(() => {
    void loadHosts();
    void loadGroups();
    void loadRecent();
    void loadS3Connections();
  }, [loadHosts, loadGroups, loadRecent, loadS3Connections]);


  // ─── Derived data ─────────────────────────────────────────────────────────

  const groupTree = useMemo(() => buildGroupTree(groups), [groups]);

  // ─── Connect handlers ──────────────────────────────────────────────────────

  // Connect directly using saved credentials from the vault.
  // If connection fails (e.g., no saved credential), the error shows in the terminal overlay.
  const connectToHost = useCallback(
    async (host: SavedHost) => {
      const label = host.label || `${host.username}@${host.host}`;
      const attemptId = crypto.randomUUID();
      let cancelled = false;
      const cancel = () => {
        cancelled = true;
        void cancelConnectAttempt(attemptId);
        setConnectingHost(null);
      };
      setConnectingHost({ label, error: null, retry: () => void connectToHost(host), cancel });
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const addSession = useSessionStore.getState().addSession;
        const sessionId = await invoke<string>("connect_saved_host", { hostId: host.id, attemptId });
        if (cancelled) {
          void invoke("ssh_disconnect", { sessionId });
          return;
        }
        const hostLabel = host.label || `${host.username}@${host.host}`;
        addSession(sessionId, {
          host: host.host,
          port: host.port,
          username: host.username,
          label: host.label || undefined,
          auth_method: { type: "password", password: "" },
        });
        void useHostsStore.getState().recordConnection(host.id);
        setConnectingHost(null);
        useTabStore.getState().addTab({ type: "terminal", id: sessionId, label: hostLabel });
      } catch (err) {
        if (cancelled) return;
        const msg = err && typeof err === "object" && "message" in err
          ? String((err as { message: string }).message)
          : t("hostsPage.errors.connectFailedCheck");
        setConnectingHost({ label, error: msg, retry: () => void connectToHost(host), cancel: null });
      }
    },
    [t],
  );

  const handleRecentConnect = useCallback(
    async (conn: RecentConnection) => {
      const label = conn.host_label || `${conn.username}@${conn.host}`;
      const attemptId = crypto.randomUUID();
      let cancelled = false;
      const cancel = () => {
        cancelled = true;
        void cancelConnectAttempt(attemptId);
        setConnectingHost(null);
      };
      setConnectingHost({ label, error: null, retry: () => void handleRecentConnect(conn), cancel });
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const addSession = useSessionStore.getState().addSession;
        const sessionId = await invoke<string>("connect_saved_host", { hostId: conn.host_id, attemptId });
        if (cancelled) {
          void invoke("ssh_disconnect", { sessionId });
          return;
        }
        const connLabel = conn.host_label || `${conn.username}@${conn.host}`;
        addSession(sessionId, {
          host: conn.host,
          port: conn.port,
          username: conn.username,
          label: conn.host_label || undefined,
          auth_method: { type: "password", password: "" },
        });
        void useHostsStore.getState().recordConnection(conn.host_id);
        setConnectingHost(null);
        useTabStore.getState().addTab({ type: "terminal", id: sessionId, label: connLabel });
      } catch (err) {
        if (cancelled) return;
        const msg = err && typeof err === "object" && "message" in err
          ? String((err as { message: string }).message)
          : t("hostsPage.errors.connectFailed");
        setConnectingHost({ label, error: msg, retry: () => void handleRecentConnect(conn), cancel: null });
      }
    },
    [t],
  );

  // Explore: connect SSH + open a file browser + switch to Files page.
  // Prefers SFTP; transparently falls back to SCP on the same SSH connection
  // when the server has the SFTP subsystem disabled — the user never picks.
  // NOTE: We don't call addSession — the SSH connection lives in Rust's SshManager
  // but we don't need a terminal pane for file-only connections.
  const exploreHost = useCallback(
    async (host: SavedHost) => {
      const label = host.label || `${host.username}@${host.host}`;
      const attemptId = crypto.randomUUID();
      let cancelled = false;
      const cancel = () => {
        cancelled = true;
        void cancelConnectAttempt(attemptId);
        setConnectingHost(null);
      };
      setConnectingHost({ label, error: null, retry: () => void exploreHost(host), cancel });
      try {
        const { invoke } = await import("@tauri-apps/api/core");

        const sessionId = await invoke<string>("connect_saved_host_no_pty", { hostId: host.id, attemptId });
        if (cancelled) {
          // The handshake settled before the cancel landed — tear the bare
          // connection down, otherwise nothing ever references it again.
          void invoke("ssh_disconnect", { sessionId });
          return;
        }

        let explorerSessionId: string;
        let transport: "sftp" | "scp" = "sftp";
        try {
          explorerSessionId = await invoke<string>("sftp_open", { sessionId });
        } catch (sftpErr) {
          // SFTP subsystem unavailable — retry over SCP on the same connection.
          try {
            explorerSessionId = await invoke<string>("scp_open", { sessionId });
            transport = "scp";
          } catch {
            // Surface the original SFTP error if SCP also fails.
            throw sftpErr;
          }
        }

        if (cancelled) {
          // Cancel landed while the explorer channel was opening — drop the
          // explorer session and the connection beneath it; no tab was added.
          if (transport === "sftp") void invoke("sftp_close", { sftpSessionId: explorerSessionId });
          else void invoke("scp_close", { scpSessionId: explorerSessionId });
          void invoke("ssh_disconnect", { sessionId });
          return;
        }

        useSftpStore.getState().openSession(explorerSessionId, sessionId, label, host.username, false, host.start_directory ?? undefined);

        setConnectingHost(null);
        useTabStore.getState().addTab({ type: "sftp", id: explorerSessionId, label, transport });
      } catch (err) {
        if (cancelled) return;
        const msg = err && typeof err === "object" && "message" in err
          ? String((err as { message: string }).message)
          : t("hostsPage.errors.connectFailed");
        setConnectingHost({ label, error: msg, retry: () => void exploreHost(host), cancel: null });
      }
    },
    [t],
  );

  // ─── Host action handlers ──────────────────────────────────────────────────

  const handleDeleteHost = useCallback(
    async (id: string) => {
      const host = hosts.find((h) => h.id === id);
      const label = host ? host.label || host.host : "host";
      try {
        await deleteHost(id);
        // deleteHost already reloads the hosts list in the store
      } catch {
        // `delete_host` returns NotFound once the row is already gone (a
        // "Delete Group & Hosts" cascade elsewhere in the session), and
        // propagates any other DB error. Unhandled, the dialog just closed and
        // the card stayed, with an unhandled rejection from the `void` call.
        toast.error(t("hostsPage.toasts.deleteHostFailed", { label }));
        // Reload so a card for an already-deleted row doesn't linger.
        // loadHosts reports its own failure through the store's error state.
        await loadHosts();
      }
    },
    [deleteHost, hosts, loadHosts, t],
  );

  const handleDuplicateHost = useCallback(
    // Delegate to the store, which builds the copy row AND calls the backend
    // `duplicate_host` command so the source's keychain secret is copied under
    // the new id. Inlining `saveHost` here (the old path) skipped that, so a
    // duplicated password/passphrase host couldn't authenticate.
    async (host: SavedHost) => {
      const label = host.label || host.host;
      try {
        const outcome = await duplicateHost(host.id);
        // The copy exists but its secret didn't come across — say so now, rather
        // than letting the first connect fail with "server rejected credentials",
        // which is indistinguishable from a wrong password.
        if (outcome.credential_error) {
          toast.error(t("hostsPage.toasts.duplicateHostNoCredential", { label }));
        }
      } catch {
        // The store throws when the source is gone or the backend write fails;
        // unhandled, the click just did nothing visible.
        toast.error(t("hostsPage.toasts.duplicateHostFailed", { label }));
      }
    },
    [duplicateHost, t],
  );

  // ─── Group handlers ────────────────────────────────────────────────────────

  const handleGroupDeleteRequest = useCallback(
    (groupId: string) => {
      const group = groups.find((g) => g.id === groupId);
      if (!group) return;
      // Everything in the group's whole subtree goes with a cascade delete.
      const ids = subtreeIds(groupTree, groupId);
      const inSubtree = (id: string | null) => {
        const folder = folderOf(id, groupTree.byId);
        return folder !== null && ids.has(folder);
      };
      const hostCount =
        hosts.filter((h) => inSubtree(h.group_id)).length +
        s3Connections.filter((c) => inSubtree(c.group_id)).length;
      setDeletingGroup({ group, hostCount, subgroupCount: ids.size - 1 });
    },
    [groups, groupTree, hosts, s3Connections],
  );

  const handleGroupDeleteConfirm = useCallback(
    async (deleteHosts: boolean) => {
      if (!deletingGroup) return;
      const { group } = deletingGroup;

      // Groups that disappear: the whole subtree on a cascade, else just this one.
      const removed = deleteHosts ? subtreeIds(groupTree, group.id) : new Set([group.id]);
      try {
        if (deleteHosts) {
          const { invoke } = await import("@tauri-apps/api/core");
          await invoke("delete_group_with_hosts", { id: group.id });
          // Reload hosts, groups and S3 connections — the cascade removes all three
          await Promise.all([loadHosts(), loadGroups(), loadS3Connections()]);
        } else {
          await deleteGroup(group.id);
          // deleteGroup reloads groups; hosts and S3 connections moved up a level
          await Promise.all([loadHosts(), loadS3Connections()]);
        }
        // Only on success: if folder view had a removed group open, step out to
        // the deleted group's parent. Doing it in `finally` moved the view even
        // when the delete had failed and the group was still there.
        if (openFolderId !== null && removed.has(openFolderId)) {
          setOpenFolderId(folderOf(group.parent_id, groupTree.byId));
        }
      } catch {
        // Without this the dialog just closed: no reload, nothing shown, and an
        // unhandled rejection from the `void handleGroupDeleteConfirm(...)` call.
        toast.error(t("hostsPage.toasts.deleteGroupFailed", { name: group.name }));
      } finally {
        setDeletingGroup(null);
      }
    },
    [deletingGroup, deleteGroup, loadHosts, loadGroups, loadS3Connections, groupTree, openFolderId, setOpenFolderId, t],
  );

  const handleCreateGroup = async (data: { name: string; color: string; icon: string }) => {
    const now = new Date().toISOString();
    await createGroup({
      id: crypto.randomUUID(),
      name: data.name,
      color: data.color,
      icon: data.icon,
      sort_order: groups.length,
      default_username: null,
      created_at: now,
      updated_at: now,
      parent_id: newGroupParentId,
    });
    setGroupModalOpen(false);
  };

  const handleEditGroup = async (group: HostGroup, data: { name: string; color: string; icon: string }) => {
    await updateGroup({ ...group, ...data, updated_at: new Date().toISOString() });
    setEditingGroup(null);
  };

  const openNewGroup = (parentId: string | null) => {
    setNewGroupParentId(parentId);
    setGroupModalOpen(true);
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <div className="flex flex-col h-full overflow-y-scroll bg-bg-base">
        <div className="max-w-4xl w-full mx-auto px-8 py-8 flex flex-col gap-8">

          {/* ── Page title ── */}
          <div>
            <h1 className="text-[length:var(--text-lg)] font-semibold text-text-primary">{t("hostsPage.title")}</h1>
            <p className="text-[length:var(--text-xs)] text-text-muted mt-1">{t("hostsPage.subtitle")}</p>
          </div>

          {/* ── Search bar ── */}
          <div className="relative">
            <Search
              size={16}
              strokeWidth={2}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none"
              aria-hidden="true"
            />
            <input
              ref={searchInputRef}
              data-testid="host-search"
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setQuery("");
              }}
              placeholder={t("hostsPage.searchPlaceholder")}
              aria-label={t("hostsPage.searchLabel")}
              className={[
                "w-full pl-10 pr-4 py-2.5 rounded-xl text-[length:var(--text-sm)]",
                "bg-bg-surface border border-border text-text-primary placeholder:text-text-muted",
                "outline-none transition-[border-color,box-shadow] duration-[var(--duration-fast)]",
                "focus:border-border-focus focus:ring-2 focus:ring-ring",
              ].join(" ")}
            />
          </div>

          {/* ── Recent connections ── */}
          {recentConnections.length > 0 && (
            <RecentConnections
              connections={recentConnections}
              onConnect={(conn) => void handleRecentConnect(conn)}
            />
          )}

          {/* ── Action buttons ── */}
          <div className="flex gap-2">
            <button
              data-testid="new-host-button"
              onClick={() => setEditingHostId("__new__")}
              className={[
                "flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium uppercase tracking-wide",
                "bg-bg-surface border border-border text-text-secondary",
                "hover:border-border-focus hover:text-text-primary hover:bg-bg-overlay",
                "transition-all duration-[var(--duration-fast)]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              ].join(" ")}
              title={t("hostsPage.newServerTitle")}
            >
              <Plus size={14} strokeWidth={2.2} aria-hidden="true" />
              {t("hostsPage.newServer")}
            </button>

            <button
              data-testid="new-s3-button"
              onClick={() => setS3DialogOpen(true)}
              className={[
                "flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium uppercase tracking-wide",
                "bg-bg-surface border border-border text-text-secondary",
                "hover:border-border-focus hover:text-text-primary hover:bg-bg-overlay",
                "transition-all duration-[var(--duration-fast)]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              ].join(" ")}
              title={t("hostsPage.newS3Title")}
            >
              <Cloud size={14} strokeWidth={2} aria-hidden="true" />
              {t("hostsPage.newS3")}
            </button>

            <button
              data-testid="new-group-button"
              // Folder view creates the group inside the open one.
              onClick={() =>
                openNewGroup(viewMode === "folder" ? folderOf(openFolderId, groupTree.byId) : null)
              }
              className={[
                "flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium uppercase tracking-wide",
                "bg-bg-surface border border-border text-text-secondary",
                "hover:border-border-focus hover:text-text-primary hover:bg-bg-overlay",
                "transition-all duration-[var(--duration-fast)]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              ].join(" ")}
              title={t("hostsPage.newGroup")}
            >
              <FolderPlus size={14} strokeWidth={2} aria-hidden="true" />
              {t("hostsPage.newGroup")}
            </button>

            <button
              data-testid="import-ssh-config-button"
              onClick={() => setImportModalOpen(true)}
              className={[
                "flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium uppercase tracking-wide",
                "bg-bg-surface border border-border text-text-secondary",
                "hover:border-border-focus hover:text-text-primary hover:bg-bg-overlay",
                "transition-all duration-[var(--duration-fast)]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              ].join(" ")}
              title={t("hostsPage.importTitle")}
            >
              <Import size={14} strokeWidth={2} aria-hidden="true" />
              {t("hostsPage.import")}
            </button>
          </div>

          {/* ── Groups, hosts and S3 connections ── */}
          <HostBrowser
            hosts={hosts}
            groups={groups}
            s3Connections={s3Connections}
            query={query}
            renderEmpty={(inGroup) => (
              <EmptyHostsState
                query={query}
                hasHosts={hosts.length + s3Connections.length > 0}
                groupFiltered={inGroup}
              />
            )}
            actions={{
              onConnect: (h) => void connectToHost(h),
              onExplore: (h) => void exploreHost(h),
              onEdit: setEditingHostId,
              onDelete: (id) => void handleDeleteHost(id),
              onDuplicate: (h) => void handleDuplicateHost(h),
              onS3Connect: (c) => void handleS3Connect(c),
              onS3Edit: (c) => setEditingS3Connection(c),
              onS3Duplicate: (c) => void handleS3Duplicate(c),
              onS3Delete: (c) => void handleS3Delete(c),
              onGroupDelete: handleGroupDeleteRequest,
              onGroupEdit: setEditingGroup,
              onGroupCreate: openNewGroup,
            }}
          />
        </div>
      </div>

      {/* ── Group create modal ── */}
      <GroupModal
        open={groupModalOpen}
        onClose={() => setGroupModalOpen(false)}
        onSave={handleCreateGroup}
      />

      {/* ── Group edit modal ── */}
      {editingGroup && (
        <GroupModal
          open
          onClose={() => setEditingGroup(null)}
          onSave={(data) => handleEditGroup(editingGroup, data)}
          initial={editingGroup}
        />
      )}

      {/* ── Group delete confirmation dialog ── */}
      {deletingGroup && (
        <GroupDeleteDialog
          group={deletingGroup.group}
          hostCount={deletingGroup.hostCount}
          subgroupCount={deletingGroup.subgroupCount}
          onConfirm={(deleteHosts) => void handleGroupDeleteConfirm(deleteHosts)}
          onCancel={() => setDeletingGroup(null)}
        />
      )}

      {s3DialogOpen && (
        <S3ConnectDialog onClose={() => { setS3DialogOpen(false); void loadS3Connections(); }} />
      )}

      {editingS3Connection && (
        <S3ConnectDialog
          editConnection={editingS3Connection}
          onClose={() => { setEditingS3Connection(null); void loadS3Connections(); }}
        />
      )}

      {importModalOpen && (
        <ImportSshConfigModal
          onClose={() => setImportModalOpen(false)}
          onImported={() => void loadHosts()}
        />
      )}

      {connectingHost && (
        <ConnectionDialog
          label={connectingHost.label}
          error={connectingHost.error}
          onClose={() => setConnectingHost(null)}
          onRetry={connectingHost.retry ?? undefined}
          onCancel={connectingHost.cancel ?? undefined}
        />
      )}
    </>
  );
}

// ─── Empty states ─────────────────────────────────────────────────────────────

interface EmptyHostsStateProps {
  query: string;
  hasHosts: boolean;
  groupFiltered: boolean;
}

function EmptyHostsState({ query, hasHosts, groupFiltered }: EmptyHostsStateProps) {
  const { t } = useTranslation("dashboard");
  if (query.trim()) {
    return (
      <p className="text-[length:var(--text-sm)] text-text-muted py-8 text-center">
        {t("hostsPage.empty.noMatch", { query })}
      </p>
    );
  }

  if (groupFiltered) {
    return (
      <p className="text-[length:var(--text-sm)] text-text-muted py-8 text-center">
        {t("hostsPage.empty.groupEmpty")}
      </p>
    );
  }

  if (!hasHosts) {
    return (
      <p className="text-[length:var(--text-sm)] text-text-muted py-8 text-center">
        {t("hostsPage.empty.noHosts")}
      </p>
    );
  }

  return null;
}
