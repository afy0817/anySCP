import { FolderOpen, Cloud, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ExplorerView } from "./ExplorerView";
import { S3Browser } from "../s3/S3Browser";
import { useSftpStore } from "../../stores/sftp-store";
import { useS3Store } from "../../stores/s3-store";
import { useLocalExplorerStore } from "../../stores/local-explorer-store";
import type { Transport } from "../../lib/explorer-transport";

interface ExplorerPageProps {
  /** SFTP/SCP transport session id (both live in the sftp store). */
  sftpSessionId?: string;
  /** Defaults to "sftp"; "scp" when the host fell back to SCP. */
  transport?: Transport;
  s3SessionId?: string;
  /** Whether this tab is the active/visible one. Explorer tabs stay mounted
   *  (issue #17), so document-level listeners must only fire for the active one. */
  isActive?: boolean;
}

export function ExplorerPage({ sftpSessionId, transport = "sftp", s3SessionId, isActive = true }: ExplorerPageProps) {
  const { t } = useTranslation("explorer");
  const sftpSession = useSftpStore((s) => sftpSessionId ? s.sessions.get(sftpSessionId) : null);
  const s3Session = useS3Store((s) => s3SessionId ? s.sessions.get(s3SessionId) : null);
  const showLocal = useLocalExplorerStore((s) => s.visible);
  const setShowLocal = useLocalExplorerStore((s) => s.setVisible);

  const baseLabel = sftpSession?.label ?? s3Session?.label ?? t("page.fallbackLabel");
  // Surface SCP fallback subtly so the user understands why server-side
  // metadata (timestamps, etc.) may look slightly different.
  const label = sftpSessionId && transport === "scp" ? `${baseLabel} · SCP` : baseLabel;
  const isSftp = !!sftpSessionId;
  const Icon = isSftp ? FolderOpen : Cloud;

  return (
    <div className="flex flex-col h-full p-2">
      <div className="flex flex-col flex-1 min-h-0 rounded-lg overflow-hidden border border-border/60">
        {/* Pane header — matching terminal pane style */}
        <div className="flex items-center h-8 px-2.5 gap-2.5 shrink-0 no-select bg-bg-surface/80 border-b border-border/60">
          {/* Show/hide the local "This PC" pane (SFTP/SCP only). */}
          {isSftp && (
            <button
              data-testid="explorer-toggle-local"
              onClick={() => setShowLocal(!showLocal)}
              title={showLocal ? t("local.hide") : t("local.show")}
              aria-label={showLocal ? t("local.hide") : t("local.show")}
              aria-pressed={showLocal}
              className="-ml-1 flex items-center justify-center w-6 h-6 rounded shrink-0 text-text-muted hover:text-text-secondary hover:bg-bg-subtle transition-colors duration-[var(--duration-fast)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {showLocal ? (
                <PanelLeftClose size={14} strokeWidth={1.8} aria-hidden="true" />
              ) : (
                <PanelLeftOpen size={14} strokeWidth={1.8} aria-hidden="true" />
              )}
            </button>
          )}
          <Icon size={14} strokeWidth={1.8} className="shrink-0 text-status-connected" aria-hidden="true" />
          <span className="text-[11px] font-mono truncate flex-1 min-w-0 text-text-primary leading-none" title={label}>
            {label}
          </span>
        </div>

        {/* Browser content */}
        <div
          className="flex-1 min-h-0 bg-bg-base"
          data-explorer-transport={sftpSessionId ? transport : s3SessionId ? "s3" : undefined}
        >
          {sftpSessionId && <ExplorerView sessionId={sftpSessionId} transport={transport} isActive={isActive} />}
          {s3SessionId && <S3Browser sessionId={s3SessionId} isActive={isActive} />}
        </div>
      </div>
    </div>
  );
}
