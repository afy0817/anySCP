import { useCallback, useEffect, useMemo, useRef } from "react";
import { AlertCircle, Laptop } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ExplorerToolbar, ExplorerFileTable } from "../explorer";
import type { PaneTransfer } from "../explorer/ExplorerFileTable";
import { useLocalExplorerStore } from "../../stores/local-explorer-store";
import { createLocalProvider, localRoot, localSegments } from "../../providers/local-provider";
import { toExplorerEntry } from "../../providers/sftp-provider";
import { useExplorerBackNavigation } from "../../hooks/use-explorer-back-navigation";

interface LocalPaneProps {
  /** Whether this explorer's tab is the visible one (tabs stay mounted). */
  isActive: boolean;
  /** Upload local paths; `remoteDir` null = the remote pane's current folder. */
  onUpload: (localPaths: string[], remoteDir: string | null) => void;
}

const noop = () => {};
const noopAsync = async () => {};

/**
 * The "This PC" side of the dual-pane explorer: browse local folders (hidden
 * files included) and drag entries onto the remote pane to upload them.
 * Downloads land here when remote entries are dropped onto it.
 */
export function LocalPane({ isActive, onUpload }: LocalPaneProps) {
  const { t } = useTranslation("explorer");
  const homeDir = useLocalExplorerStore((s) => s.homeDir);
  const currentPath = useLocalExplorerStore((s) => s.currentPath);
  const entries = useLocalExplorerStore((s) => s.entries);
  const loading = useLocalExplorerStore((s) => s.loading);
  const error = useLocalExplorerStore((s) => s.error);
  const sortBy = useLocalExplorerStore((s) => s.sortBy);
  const sortAsc = useLocalExplorerStore((s) => s.sortAsc);
  const init = useLocalExplorerStore((s) => s.init);
  const load = useLocalExplorerStore((s) => s.load);
  const refresh = useLocalExplorerStore((s) => s.refresh);
  const setSort = useLocalExplorerStore((s) => s.setSort);

  useEffect(() => {
    void init();
  }, [init]);

  const shownPath = currentPath || homeDir || "/";
  const root = localRoot(shownPath);
  const provider = useMemo(() => createLocalProvider(root), [root]);
  const segments = useMemo(() => localSegments(shownPath), [shownPath]);
  const explorerEntries = useMemo(() => entries.map(toExplorerEntry), [entries]);

  const navigate = useCallback((path: string) => void load(path), [load]);

  const rootRef = useRef<HTMLDivElement>(null);
  useExplorerBackNavigation({
    rootRef,
    isActive,
    provider,
    currentPath: shownPath,
    loading,
    onNavigate: navigate,
  });

  const paneTransfer = useMemo<PaneTransfer>(
    () => ({
      targetPane: "remote",
      direction: "upload",
      onTransfer: (selection, remoteDir) =>
        onUpload(
          selection.map((e) => e.id),
          remoteDir,
        ),
    }),
    [onUpload],
  );

  return (
    <div
      ref={rootRef}
      data-explorer-pane="local"
      className="flex flex-col h-full min-w-0 overflow-hidden relative data-[drop-target=true]:outline-2 data-[drop-target=true]:-outline-offset-2 data-[drop-target=true]:outline-accent"
    >
      <ExplorerToolbar
        provider={provider}
        currentPath={shownPath}
        segments={segments}
        loading={loading}
        onNavigate={navigate}
        onRefresh={() => void refresh()}
        onNewFile={noop}
        onNewFolder={noop}
        onUpload={noop}
        homePath={homeDir || undefined}
        badge={{ icon: Laptop, label: t("local.title") }}
        testIdPrefix="local"
      />

      {error && (
        <div className="flex items-center gap-2.5 px-4 py-2.5 bg-status-error/10 border-b border-status-error/20 text-status-error">
          <AlertCircle size={15} strokeWidth={2} aria-hidden="true" className="shrink-0" />
          <p className="text-[length:var(--text-sm)]">{error}</p>
        </div>
      )}

      <ExplorerFileTable
        provider={provider}
        entries={explorerEntries}
        sortBy={sortBy}
        sortAsc={sortAsc}
        onSortChange={setSort}
        clipboard={null}
        onSetClipboard={noop}
        onNavigate={navigate}
        onDownload={noop}
        onDelete={noopAsync}
        paneTransfer={paneTransfer}
        testIdPrefix="local"
        currentPath={shownPath}
        loading={loading}
      />
    </div>
  );
}
