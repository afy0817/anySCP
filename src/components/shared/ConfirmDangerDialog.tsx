import { AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ModalShell, BTN_GHOST, BTN_DANGER } from "./ModalShell";

interface ConfirmDangerDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDangerDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDangerDialogProps) {
  const { t } = useTranslation(["app", "common"]);
  return (
    <ModalShell
      open={open}
      onClose={onCancel}
      title={title}
      icon={AlertTriangle}
      iconVariant="danger"
      maxWidth="sm"
      busy={busy}
      footer={
        <>
          {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
          <button autoFocus type="button" onClick={onCancel} disabled={busy} className={BTN_GHOST}>
            {cancelLabel ?? t("common:actions.cancel")}
          </button>
          <button type="button" onClick={onConfirm} disabled={busy} className={BTN_DANGER}>
            {busy ? t("confirmDanger.deleting") : (confirmLabel ?? t("confirmDanger.confirm"))}
          </button>
        </>
      }
    >
      <p className="text-[length:var(--text-sm)] text-text-secondary">{message}</p>
    </ModalShell>
  );
}
