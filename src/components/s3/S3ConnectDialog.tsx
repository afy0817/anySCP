import { useState, useEffect } from "react";
import { Cloud } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useS3Store } from "../../stores/s3-store";
import { ModalShell, BTN_GHOST, BTN_SECONDARY, BTN_PRIMARY } from "../shared/ModalShell";
import { useGroupsStore } from "../../stores/groups-store";
import { CustomSelect } from "../shared/CustomSelect";
import { S3_PROVIDERS } from "../../types";
import type { S3Provider, S3Connection } from "../../types";

interface S3ConnectDialogProps {
  onClose: () => void;
  /** When provided, the dialog enters edit mode and pre-populates fields. */
  editConnection?: S3Connection;
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 my-1">
      <span className="text-[length:var(--text-xs)] font-semibold uppercase tracking-widest text-text-muted whitespace-nowrap">
        {children}
      </span>
      <div className="flex-1 h-px bg-border" aria-hidden="true" />
    </div>
  );
}

export function S3ConnectDialog({ onClose, editConnection }: S3ConnectDialogProps) {
  const { t } = useTranslation(["s3", "common", "app"]);
  const isEdit = !!editConnection;
  const [provider, setProvider] = useState<S3Provider>(
    (editConnection?.provider as S3Provider) ?? "aws",
  );
  const [label, setLabel] = useState(editConnection?.label ?? "");
  const [accessKey, setAccessKey] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [region, setRegion] = useState(editConnection?.region ?? "us-east-1");
  const [endpoint, setEndpoint] = useState(editConnection?.endpoint ?? "");
  const [bucket, setBucket] = useState(editConnection?.bucket ?? "");
  const [pathStyle, setPathStyle] = useState(editConnection?.path_style ?? false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Applying a provider's presets is a user action, not a mount effect. Syncing
  // it via useEffect clobbered a saved endpoint on open: StrictMode runs effects
  // twice, so the "skip the first run" guard let the second run overwrite the
  // pre-populated endpoint with the provider default (e.g. MinIO → localhost).
  const handleProviderChange = (next: S3Provider) => {
    setProvider(next);
    const preset = S3_PROVIDERS.find((p) => p.id === next);
    if (preset) {
      setRegion(preset.regionPlaceholder);
      setEndpoint(preset.endpointPattern);
      setPathStyle(preset.pathStyle);
    }
  };


  const [groupId, setGroupId] = useState(editConnection?.group_id ?? "");
  const [color, setColor] = useState<string | null>(editConnection?.color ?? null);
  const [environment, setEnvironment] = useState(editConnection?.environment ?? "");
  const [notes, setNotes] = useState(editConnection?.notes ?? "");

  const groups = useGroupsStore((s) => s.groups);
  const loadGroups = useGroupsStore((s) => s.loadGroups);
  useEffect(() => { void loadGroups(); }, [loadGroups]);
  const [saving, setSaving] = useState(false);

  // In edit mode, credentials are optional (leave blank to keep existing)
  const canSubmit = isEdit
    ? region.trim() && bucket.trim()
    : accessKey.trim() && secretKey.trim() && region.trim() && bucket.trim();

  const handleSave = async () => {
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    try {
      const { invoke } = await import("@tauri-apps/api/core");

      if (isEdit) {
        // Update existing connection: reuse the ID
        // If credentials are provided, update them; otherwise keep existing vault entry
        const hasNewCreds = accessKey.trim() && secretKey.trim();
        await invoke("s3_update_connection", {
          id: editConnection.id,
          label: label.trim() || `${provider}/${bucket.trim()}`,
          provider,
          bucketName: bucket.trim(),
          region: region.trim(),
          endpoint: endpoint.trim() || null,
          pathStyle,
          groupId: groupId || null,
          color,
          environment: environment || null,
          notes: notes.trim() || null,
          accessKey: hasNewCreds ? accessKey.trim() : null,
          secretKey: hasNewCreds ? secretKey.trim() : null,
        });
      } else {
        await invoke<string>("s3_save_connection", {
          label: label.trim() || `${provider}/${bucket.trim()}`,
          provider,
          bucketName: bucket.trim(),
          region: region.trim(),
          endpoint: endpoint.trim() || null,
          accessKey: accessKey.trim(),
          secretKey: secretKey.trim(),
          pathStyle,
          groupId: groupId || null,
          color,
          environment: environment || null,
          notes: notes.trim() || null,
        });
      }
      onClose();
    } catch (err) {
      const msg = err && typeof err === "object" && "message" in err
        ? String((err as { message: string }).message)
        : t("dialog.saveFailed");
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleConnect = async () => {
    if (!canSubmit) return;
    setConnecting(true);
    setError(null);

    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const sessionId = await invoke<string>("s3_connect", {
        label: label.trim() || `${provider}/${bucket.trim()}`,
        provider,
        bucketName: bucket.trim(),
        region: region.trim(),
        endpoint: endpoint.trim() || null,
        accessKey: accessKey.trim(),
        secretKey: secretKey.trim(),
        pathStyle,
        groupId: groupId || null,
      });

      useS3Store.getState().openSession(sessionId, label.trim() || `${provider}/${bucket.trim()}`);
      onClose();
    } catch (err) {
      const msg = err && typeof err === "object" && "message" in err
        ? String((err as { message: string }).message)
        : t("dialog.connectFailed");
      setError(msg);
    } finally {
      setConnecting(false);
    }
  };

  const inputClass =
    "w-full rounded-lg bg-bg-base border border-border px-3 py-2 text-[length:var(--text-sm)] text-text-primary placeholder:text-text-muted outline-none focus:border-border-focus focus:ring-2 focus:ring-ring transition-[border-color,box-shadow] duration-[var(--duration-fast)]";

  const labelClass =
    "block text-[length:var(--text-xs)] font-medium text-text-secondary mb-1";

  return (
    <ModalShell
      open
      onClose={onClose}
      title={isEdit ? t("dialog.titleEdit") : t("dialog.titleNew")}
      icon={Cloud}
      maxWidth="lg"
      scrollable
      busy={connecting || saving}
      testId="s3-dialog"
      footer={
        <>
          <button type="button" onClick={onClose} disabled={connecting || saving} className={BTN_GHOST}>
            {t("common:actions.cancel")}
          </button>
          {isEdit ? (
            <button type="button" onClick={() => void handleSave()} disabled={saving || !canSubmit} className={BTN_PRIMARY}>
              {saving ? t("dialog.saving") : t("dialog.saveChanges")}
            </button>
          ) : (
            <>
              <button type="button" data-testid="s3-dialog-save" onClick={() => void handleSave()} disabled={saving || connecting || !canSubmit} className={BTN_SECONDARY}>
                {saving ? t("dialog.saving") : t("common:actions.save")}
              </button>
              <button type="button" data-testid="s3-dialog-connect" onClick={() => void handleConnect()} disabled={connecting || saving || !canSubmit} className={BTN_PRIMARY}>
                {connecting ? t("dialog.connecting") : t("common:actions.connect")}
              </button>
            </>
          )}
        </>
      }
    >
        <div className="flex flex-col gap-3.5">
          <SectionHeader>{t("dialog.sections.provider")}</SectionHeader>

          <div>
            <label className={labelClass}>{t("dialog.fields.service")}</label>
            <CustomSelect
              data-testid="s3-dialog-provider"
              value={provider}
              onChange={(v) => handleProviderChange(v as S3Provider)}
              options={S3_PROVIDERS.map((p) => ({
                value: p.id,
                // Brand names stay as-is; only presets with a labelKey are translated.
                label: p.labelKey ? t(p.labelKey) : p.label,
              }))}
            />
          </div>

          <div>
            <label className={labelClass}>
              {t("dialog.fields.label")}
              <span className="ml-1 text-text-muted font-normal">{t("dialog.fields.optional")}</span>
            </label>
            <input
              data-testid="s3-dialog-label"
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={t("dialog.fields.labelPlaceholder")}
              className={inputClass}
              autoFocus
            />
          </div>

          <SectionHeader>{t("dialog.sections.credentials")}</SectionHeader>

          {isEdit && (
            <p className="text-[length:var(--text-2xs)] text-text-muted -mb-1">
              {t("dialog.fields.keepCredentials")}
            </p>
          )}

          <div>
            <label className={labelClass}>{t("dialog.fields.accessKey")}</label>
            <input
              data-testid="s3-dialog-access-key"
              type="text"
              value={accessKey}
              onChange={(e) => setAccessKey(e.target.value)}
              placeholder={isEdit ? "••••••••••••" : "AKIAIOSFODNN7EXAMPLE"}
              className={`${inputClass} font-mono`}
            />
          </div>

          <div>
            <label className={labelClass}>{t("dialog.fields.secretKey")}</label>
            <input
              data-testid="s3-dialog-secret-key"
              type="password"
              value={secretKey}
              onChange={(e) => setSecretKey(e.target.value)}
              placeholder={isEdit ? "••••••••••••" : "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"}
              className={`${inputClass} font-mono`}
            />
          </div>

          <SectionHeader>{t("dialog.sections.connection")}</SectionHeader>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className={labelClass}>{t("dialog.fields.region")}</label>
              <input
                data-testid="s3-dialog-region"
                type="text"
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                placeholder="us-east-1"
                className={`${inputClass} font-mono`}
              />
            </div>
            <div className="flex-1">
              <label className={labelClass}>{t("dialog.fields.bucket")}</label>
              <input
                data-testid="s3-dialog-bucket"
                type="text"
                value={bucket}
                onChange={(e) => setBucket(e.target.value)}
                placeholder="my-bucket"
                className={`${inputClass} font-mono`}
              />
            </div>
          </div>

          {(provider !== "aws") && (
            <div>
              <label className={labelClass}>{t("dialog.fields.endpoint")}</label>
              <input
                data-testid="s3-dialog-endpoint"
                type="text"
                value={endpoint}
                onChange={(e) => setEndpoint(e.target.value)}
                placeholder="https://s3.example.com"
                className={`${inputClass} font-mono`}
              />
            </div>
          )}

          <SectionHeader>{t("dialog.sections.appearance")}</SectionHeader>

          {groups.length > 0 && (
            <div>
              <label className={labelClass}>{t("dialog.fields.group")}</label>
              <CustomSelect
                value={groupId}
                onChange={setGroupId}
                placeholder={t("dialog.fields.noGroup")}
                options={[
                  { value: "", label: t("dialog.fields.noGroup") },
                  ...groups.map((g) => ({ value: g.id, label: g.name })),
                ]}
              />
            </div>
          )}

          <div className="flex gap-3">
            <div className="flex-1">
              <label className={labelClass}>{t("dialog.fields.environment")}</label>
              <CustomSelect
                value={environment}
                onChange={setEnvironment}
                placeholder={t("environments.none")}
                options={[
                  { value: "", label: t("environments.none") },
                  { value: "production", label: t("environments.production") },
                  { value: "staging", label: t("environments.staging") },
                  { value: "dev", label: t("environments.dev") },
                  { value: "testing", label: t("environments.testing") },
                ]}
              />
            </div>
            <div className="flex-1">
              <label className={labelClass}>{t("dialog.fields.color")}</label>
              <div className="flex gap-1.5 py-2">
                {["#6366f1", "#8b5cf6", "#ec4899", "#f43f5e", "#f97316", "#eab308", "#22c55e", "#06b6d4"].map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(color === c ? null : c)}
                    className={[
                      "w-6 h-6 rounded-full border-2 transition-all duration-[var(--duration-fast)]",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      color === c ? "border-text-primary scale-110" : "border-transparent hover:scale-110",
                    ].join(" ")}
                    style={{ background: c }}
                    aria-label={t("dialog.fields.colorOption", { color: c })}
                  />
                ))}
              </div>
            </div>
          </div>

          <SectionHeader>{t("dialog.sections.notes")}</SectionHeader>

          <div>
            <label className={labelClass}>
              {t("dialog.fields.notes")}
              <span className="ml-1 text-text-muted font-normal">{t("dialog.fields.optional")}</span>
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t("dialog.fields.notesPlaceholder")}
              className={`${inputClass} resize-none`}
            />
          </div>

          {/* Error */}
          {error && (
            <p role="alert" className="text-[length:var(--text-sm)] text-status-error bg-status-error/10 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
        </div>
    </ModalShell>
  );
}
