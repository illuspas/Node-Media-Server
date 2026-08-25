import { useCallback, useEffect, useState } from "react";
import { useIntl } from "react-intl";
import Icon from "../components/Icon";
import { fetchConfig, updateConfig } from "../lib/api";
import type { ApiConfig } from "../lib/api";
import { toast } from "../lib/toast";

const TABS = [
  { id: "general", labelId: "settings.tab.general", icon: "sliders" },
  { id: "rtmp", labelId: "settings.tab.rtmp", icon: "server" },
  { id: "http", labelId: "settings.tab.http", icon: "globe" },
  { id: "auth", labelId: "settings.tab.auth", icon: "lock" },
  { id: "storage", labelId: "settings.tab.storage", icon: "hard-drive" }
] as const;

type TabId = (typeof TABS)[number]["id"];

interface FieldProps {
  id: string;
  labelId: string;
  value: string | number;
  onChange: (value: string) => void;
  mono?: boolean;
  type?: string;
  helpId?: string;
  placeholderId?: string;
}

function Field({ id, labelId, value, onChange, mono, type = "text", helpId, placeholderId }: FieldProps) {
  const { formatMessage } = useIntl();
  return (
    <div>
      <label className="label" htmlFor={id}>{formatMessage({ id: labelId })}</label>
      <input
        id={id}
        className={`input${mono ? " font-mono" : ""}`}
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholderId ? formatMessage({ id: placeholderId }) : undefined}
      />
      {helpId && <p className="help">{formatMessage({ id: helpId })}</p>}
    </div>
  );
}

interface SwitchRowProps {
  title: string;
  desc: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

function SwitchRow({ title, desc, checked, onChange }: SwitchRowProps) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-stone-200 p-4">
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-stone-500 mt-0.5">{desc}</p>
      </div>
      <label className="switch">
        <input
          type="checkbox"
          checked={checked}
          onChange={e => onChange(e.target.checked)}
        />
        <span className="track" />
        <span className="thumb" />
      </label>
    </div>
  );
}

function FormActions({ saving, t }: { saving: boolean; t: (id: string) => string }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-end gap-2 pt-2 border-t border-stone-100">
      <p className="text-xs text-stone-500 sm:mr-auto">{t("settings.restartNote")}</p>
      <button type="submit" className="btn btn-primary" disabled={saving}>
        {saving ? t("settings.saving") : t("settings.save")}
      </button>
    </div>
  );
}

export default function Settings() {
  const { formatMessage } = useIntl();
  const [tab, setTab] = useState<TabId>("general");
  const [config, setConfig] = useState<ApiConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const t = (id: string) => formatMessage({ id });
  const sw = (key: string) => ({
    title: t(`settings.sw.${key}.title`),
    desc: t(`settings.sw.${key}.desc`)
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setConfig(await fetchConfig());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : formatMessage({ id: "settings.errLoad" }));
    } finally {
      setLoading(false);
    }
  }, [formatMessage]);

  useEffect(() => {
    // Fetch-on-mount is a legitimate external-system sync.
    // oxlint-disable-next-line react/set-state-in-effect
    void load();
  }, [load]);

  /** Patch a nested config value, e.g. set("rtmp", "port", 1936). */
  function set<K extends keyof ApiConfig>(section: K, key: string, value: unknown) {
    setConfig(c => (c ? { ...c, [section]: { ...(c[section] as object), [key]: value } } : c));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!config) return;
    setSaving(true);
    try {
      // Numbers are edited as strings; convert known numeric fields back.
      const patch: ApiConfig = {
        ...config,
        store: {
          ...config.store,
          maxHistory: Number(config.store?.maxHistory ?? 0)
        },
        rtmp: { ...config.rtmp, port: Number(config.rtmp?.port ?? 0) },
        rtmps: { ...config.rtmps, port: Number(config.rtmps?.port ?? 0) },
        http: { ...config.http, port: Number(config.http?.port ?? 0) },
        https: { ...config.https, port: Number(config.https?.port ?? 0) }
      };
      await updateConfig(patch);
      toast(t("settings.toastSaved"));
    } catch (e) {
      toast(e instanceof Error ? e.message : t("settings.errSave"), "warning");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main className="p-4 md:p-6 max-w-[1100px] mx-auto">
        <p className="text-sm text-stone-500">{t("settings.loading")}</p>
      </main>
    );
  }

  if (error || !config) {
    return (
      <main className="p-4 md:p-6 max-w-[1100px] mx-auto space-y-4">
        <div className="card p-4 border-red-200 bg-red-50 text-sm text-red-700">
          {formatMessage({ id: "settings.errBanner" }, { error: error ?? "" })}
        </div>
        <button type="button" className="btn btn-secondary" onClick={() => void load()}>
          {t("settings.retry")}
        </button>
      </main>
    );
  }

  return (
    <main className="p-4 md:p-6 max-w-[1100px] mx-auto space-y-4 md:space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-semibold tracking-tight">{t("nav.settings")}</h1>
        <p className="text-sm text-stone-500 mt-1">{t("settings.subtitle")}</p>
      </div>

      <div className="flex flex-col lg:flex-row lg:gap-8">
        {/* side nav */}
        <aside className="lg:w-56 shrink-0 mb-4 lg:mb-0">
          <nav className="flex lg:flex-col gap-1 overflow-x-auto pb-1 lg:pb-0">
            {TABS.map(tabItem => (
              <button
                key={tabItem.id}
                className={`snav ${tabItem.id === tab ? "active" : ""}`}
                onClick={() => setTab(tabItem.id)}
              >
                <Icon name={tabItem.icon} className="w-4 h-4" />
                {t(tabItem.labelId)}
              </button>
            ))}
          </nav>
        </aside>

        {/* panels */}
        <div className="flex-1 min-w-0 space-y-6">
          {tab === "general" && (
            <section>
              <div className="mb-4">
                <h2 className="text-lg font-semibold tracking-tight">{t("settings.tab.general")}</h2>
                <p className="text-sm text-stone-500 mt-0.5">{t("settings.general.subtitle")}</p>
              </div>
              <form className="card p-5 space-y-5" onSubmit={handleSave}>
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field
                    id="g-bind"
                    labelId="settings.field.bind"
                    value={config.bind ?? ""}
                    onChange={v => setConfig(c => (c ? { ...c, bind: v } : c))}
                    mono
                    helpId="settings.field.bindHelp"
                  />
                </div>
                <div>
                  <Field
                    id="g-notify"
                    labelId="settings.field.webhook"
                    value={config.notify?.url ?? ""}
                    onChange={v => set("notify", "url", v)}
                    mono
                    helpId="settings.webhookHelp"
                    placeholderId="settings.webhookPlaceholder"
                  />
                </div>
                <FormActions saving={saving} t={t} />
              </form>
            </section>
          )}

          {tab === "rtmp" && (
            <section>
              <div className="mb-4">
                <h2 className="text-lg font-semibold tracking-tight">{t("settings.tab.rtmp")}</h2>
                <p className="text-sm text-stone-500 mt-0.5">{t("settings.rtmp.subtitle")}</p>
              </div>
              <form className="card p-5 space-y-5" onSubmit={handleSave}>
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field
                    id="rt-port"
                    labelId="settings.field.rtmpPort"
                    value={config.rtmp?.port ?? ""}
                    onChange={v => set("rtmp", "port", v)}
                    mono
                    type="number"
                  />
                  <Field
                    id="rts-port"
                    labelId="settings.field.rtmpsPort"
                    value={config.rtmps?.port ?? ""}
                    onChange={v => set("rtmps", "port", v)}
                    mono
                    type="number"
                  />
                  <Field
                    id="rts-key"
                    labelId="settings.field.tlsKey"
                    value={config.rtmps?.key ?? ""}
                    onChange={v => set("rtmps", "key", v)}
                    mono
                    helpId="settings.field.tlsHelp"
                  />
                  <Field
                    id="rts-cert"
                    labelId="settings.field.tlsCert"
                    value={config.rtmps?.cert ?? ""}
                    onChange={v => set("rtmps", "cert", v)}
                    mono
                  />
                </div>
                <FormActions saving={saving} t={t} />
              </form>
            </section>
          )}

          {tab === "http" && (
            <section>
              <div className="mb-4">
                <h2 className="text-lg font-semibold tracking-tight">{t("settings.tab.http")}</h2>
                <p className="text-sm text-stone-500 mt-0.5">{t("settings.http.subtitle")}</p>
              </div>
              <form className="card p-5 space-y-5" onSubmit={handleSave}>
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field
                    id="h-port"
                    labelId="settings.field.httpPort"
                    value={config.http?.port ?? ""}
                    onChange={v => set("http", "port", v)}
                    mono
                    type="number"
                  />
                  <Field
                    id="hs-port"
                    labelId="settings.field.httpsPort"
                    value={config.https?.port ?? ""}
                    onChange={v => set("https", "port", v)}
                    mono
                    type="number"
                  />
                  <Field
                    id="hs-key"
                    labelId="settings.field.tlsKey"
                    value={config.https?.key ?? ""}
                    onChange={v => set("https", "key", v)}
                    mono
                    helpId="settings.field.tlsHelp"
                  />
                  <Field
                    id="hs-cert"
                    labelId="settings.field.tlsCert"
                    value={config.https?.cert ?? ""}
                    onChange={v => set("https", "cert", v)}
                    mono
                  />
                </div>
                <FormActions saving={saving} t={t} />
              </form>
            </section>
          )}

          {tab === "auth" && (
            <section>
              <div className="mb-4">
                <h2 className="text-lg font-semibold tracking-tight">{t("settings.tab.auth")}</h2>
                <p className="text-sm text-stone-500 mt-0.5">{t("settings.auth.subtitle")}</p>
              </div>
              <form className="card p-5 space-y-5" onSubmit={handleSave}>
                <SwitchRow
                  {...sw("publishAuth")}
                  checked={!!config.auth?.publish}
                  onChange={v => set("auth", "publish", v)}
                />
                <SwitchRow
                  {...sw("playAuth")}
                  checked={!!config.auth?.play}
                  onChange={v => set("auth", "play", v)}
                />
                <div>
                  <Field
                    id="a-secret"
                    labelId="settings.field.secret"
                    value={config.auth?.secret ?? ""}
                    onChange={v => set("auth", "secret", v)}
                    mono
                    helpId="settings.field.secretHelp"
                  />
                </div>
                <FormActions saving={saving} t={t} />
              </form>
            </section>
          )}

          {tab === "storage" && (
            <section>
              <div className="mb-4">
                <h2 className="text-lg font-semibold tracking-tight">{t("settings.tab.storage")}</h2>
                <p className="text-sm text-stone-500 mt-0.5">{t("settings.storage.subtitle")}</p>
              </div>
              <form className="card p-5 space-y-5" onSubmit={handleSave}>
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field
                    id="s-store"
                    labelId="settings.field.storePath"
                    value={config.store?.path ?? ""}
                    onChange={v => set("store", "path", v)}
                    mono
                  />
                  <Field
                    id="s-max"
                    labelId="settings.field.maxHistory"
                    value={config.store?.maxHistory ?? ""}
                    onChange={v => set("store", "maxHistory", v)}
                    mono
                    type="number"
                    helpId="settings.field.maxHistoryHelp"
                  />
                  <Field
                    id="s-rec"
                    labelId="settings.field.recDir"
                    value={config.record?.path ?? ""}
                    onChange={v => set("record", "path", v)}
                    mono
                  />
                  <div>
                    <label className="label" htmlFor="s-autorec">{t("settings.field.autoRecord")}</label>
                    <div className="flex items-center gap-3 h-9">
                      <label className="switch">
                        <input
                          id="s-autorec"
                          type="checkbox"
                          checked={config.record?.auto !== false}
                          onChange={e => set("record", "auto", e.target.checked)}
                        />
                        <span className="track" />
                        <span className="thumb" />
                      </label>
                      <span className="help !mt-0">{t("settings.sw.autoRecord.desc")}</span>
                    </div>
                  </div>
                </div>
                <FormActions saving={saving} t={t} />
              </form>
            </section>
          )}
        </div>
      </div>
    </main>
  );
}
