import { useState, useId } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle } from "lucide-react";
import type { HostGroup } from "../../types";
import { ModalShell, BTN_GHOST, BTN_DANGER } from "../shared/ModalShell";

interface GroupDeleteDialogProps {
  group: HostGroup;
  /** Hosts + S3 connections in the group and all its subgroups. */
  hostCount: number;
  subgroupCount: number;
  onConfirm: (deleteHosts: boolean) => void;
  onCancel: () => void;
}

export function GroupDeleteDialog({
  group,
  hostCount,
  subgroupCount,
  onConfirm,
  onCancel,
}: GroupDeleteDialogProps) {
  const { t } = useTranslation(["dashboard", "common"]);
  const [deleteHosts, setDeleteHosts] = useState(false);
  const checkboxId = useId();
  const hasContents = hostCount > 0 || subgroupCount > 0;

  const confirmLabel =
    hasContents && deleteHosts ? t("groupDelete.confirmGroupAndHosts") : t("groupDelete.confirmGroup");

  let alsoDeleteLabel: string;
  if (subgroupCount === 0) alsoDeleteLabel = t("groupDelete.alsoDeleteHosts", { count: hostCount });
  else if (hostCount === 0) alsoDeleteLabel = t("groupDelete.alsoDeleteSubgroups", { count: subgroupCount });
  else alsoDeleteLabel = t("groupDelete.alsoDeleteAll", { count: hostCount });

  return (
    <ModalShell
      open
      onClose={onCancel}
      title={t("groupDelete.title", { name: group.name })}
      icon={AlertTriangle}
      iconVariant="danger"
      maxWidth="sm"
      footer={
        <>
          {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
          <button autoFocus type="button" onClick={onCancel} className={BTN_GHOST}>
            {t("common:actions.cancel")}
          </button>
          <button type="button" onClick={() => onConfirm(deleteHosts)} className={BTN_DANGER}>
            {confirmLabel}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-[length:var(--text-sm)] text-text-secondary">
          {!hasContents && t("groupDelete.emptyMessage")}
          {hostCount > 0 && (
            <span className="block">{t("groupDelete.containsHosts", { count: hostCount })}</span>
          )}
          {subgroupCount > 0 && (
            <span className="block">{t("groupDelete.containsSubgroups", { count: subgroupCount })}</span>
          )}
        </p>

        {hasContents && (
          <label
            htmlFor={checkboxId}
            className="flex items-start gap-2.5 cursor-pointer rounded-lg px-3 py-2.5 bg-bg-subtle border border-border hover:border-border-focus transition-colors duration-[var(--duration-fast)]"
          >
            <input
              id={checkboxId}
              type="checkbox"
              checked={deleteHosts}
              onChange={(e) => setDeleteHosts(e.target.checked)}
              className="mt-0.5 h-3.5 w-3.5 rounded shrink-0 cursor-pointer accent-[oklch(0.650_0.200_25)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <span className="text-[length:var(--text-xs)] text-text-secondary leading-snug select-none">
              {alsoDeleteLabel}
              <span className="block text-text-muted mt-0.5">
                {t("groupDelete.uncheckedHint")}
              </span>
            </span>
          </label>
        )}
      </div>
    </ModalShell>
  );
}
