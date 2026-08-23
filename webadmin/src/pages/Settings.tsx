import { useState } from "react";
import { useIntl } from "react-intl";
import Icon from "../components/Icon";
import { toast } from "../lib/toast";

const TABS = [
  { id: "general", labelId: "settings.tab.general", icon: "sliders" },
  { id: "rtmp", labelId: "settings.tab.rtmp", icon: "server" },
  { id: "http", labelId: "settings.tab.http", icon: "globe" },
  { id: "auth", labelId: "settings.tab.auth", icon: "lock" },
  { id: "storage", labelId: "settings.tab.storage", icon: "hard-drive" },
  { id: "notify", labelId: "settings.tab.notify", icon: "bell" }
] as const;

type TabId = (typeof TABS)[number]["id"];

interface SwitchRowProps {
  title: string;
  desc: string;
  defaultChecked?: boolean;
}

function SwitchRow({ title, desc, defaultChecked = false }: SwitchRowProps) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-stone-200 p-4">
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-stone-500 mt-0.5">{desc}</p>
      </div>
      <label className="switch">
        <input type="checkbox" defaultChecked={defaultChecked} />
        <span className="track" />
        <span className="thumb" />
      </label>
    </div>
  );
}

function FormActions() {
  const { formatMessage } = useIntl();
  return (
    <div className="flex justify-end gap-2 pt-2 border-t border-stone-100">
      <button type="button" className="btn btn-ghost">
        {formatMessage({ id: "settings.restoreDefaults" })}
      </button>
      <button type="submit" className="btn btn-primary" onClick={() => toast(formatMessage({ id: "settings.toastSaved" }))}>
        {formatMessage({ id: "settings.save" })}
      </button>
    </div>
  );
}

export default function Settings() {
  const { formatMessage } = useIntl();
  const [tab, setTab] = useState<TabId>("general");

  const t = (id: string) => formatMessage({ id });
  const sw = (key: string) => ({
    title: t(`settings.sw.${key}.title`),
    desc: t(`settings.sw.${key}.desc`)
  });

  function onSettingsSubmit(e: React.FormEvent) {
    e.preventDefault();
    toast(t("settings.toastSaved"));
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
              <form className="card p-5 space-y-5" onSubmit={onSettingsSubmit}>
                <div className="grid gap-5 sm:grid-cols-2">
                  <div>
                    <label className="label" htmlFor="g-name">{t("settings.field.instanceName")}</label>
                    <input id="g-name" className="input" defaultValue="NMS Console" />
                  </div>
                  <div>
                    <label className="label" htmlFor="g-tz">{t("settings.field.timezone")}</label>
                    <select id="g-tz" className="select" defaultValue="Asia/Shanghai (UTC+8)">
                      <option>Asia/Shanghai (UTC+8)</option>
                      <option>UTC</option>
                      <option>America/New_York</option>
                      <option>Europe/London</option>
                    </select>
                  </div>
                  <div>
                    <label className="label" htmlFor="g-keep">{t("settings.field.keepDays")}</label>
                    <input id="g-keep" className="input" type="number" defaultValue={30} />
                    <p className="help">{t("settings.field.keepDaysHelp")}</p>
                  </div>
                  <div>
                    <label className="label" htmlFor="g-log">{t("settings.field.logLevel")}</label>
                    <select id="g-log" className="select" defaultValue="info">
                      <option>info</option>
                      <option>debug</option>
                      <option>warn</option>
                      <option>error</option>
                    </select>
                  </div>
                </div>
                <SwitchRow {...sw("autoUpdate")} defaultChecked />
                <FormActions />
              </form>
            </section>
          )}

          {tab === "rtmp" && (
            <section>
              <div className="mb-4">
                <h2 className="text-lg font-semibold tracking-tight">{t("settings.tab.rtmp")}</h2>
                <p className="text-sm text-stone-500 mt-0.5">{t("settings.rtmp.subtitle")}</p>
              </div>
              <form className="card p-5 space-y-5" onSubmit={onSettingsSubmit}>
                <div className="grid gap-5 sm:grid-cols-2">
                  <div>
                    <label className="label" htmlFor="rt-port">{t("settings.field.port")}</label>
                    <input id="rt-port" className="input font-mono" defaultValue={1935} />
                  </div>
                  <div>
                    <label className="label" htmlFor="rt-chunk">{t("settings.field.chunkSize")}</label>
                    <input id="rt-chunk" className="input font-mono" defaultValue={60000} />
                  </div>
                </div>
                <SwitchRow {...sw("gop")} defaultChecked />
                <SwitchRow {...sw("hls")} defaultChecked />
                <SwitchRow {...sw("flv")} defaultChecked />
                <FormActions />
              </form>
            </section>
          )}

          {tab === "http" && (
            <section>
              <div className="mb-4">
                <h2 className="text-lg font-semibold tracking-tight">{t("settings.tab.http")}</h2>
                <p className="text-sm text-stone-500 mt-0.5">{t("settings.http.subtitle")}</p>
              </div>
              <form className="card p-5 space-y-5" onSubmit={onSettingsSubmit}>
                <div className="grid gap-5 sm:grid-cols-2">
                  <div>
                    <label className="label" htmlFor="h-port">{t("settings.field.port")}</label>
                    <input id="h-port" className="input font-mono" defaultValue={8000} />
                  </div>
                  <div>
                    <label className="label" htmlFor="h-root">{t("settings.field.mediaRoot")}</label>
                    <input id="h-root" className="input font-mono" defaultValue="/media" />
                  </div>
                  <div>
                    <label className="label" htmlFor="h-hls">{t("settings.field.hlsDur")}</label>
                    <input id="h-hls" className="input font-mono" defaultValue={6} />
                  </div>
                  <div>
                    <label className="label" htmlFor="h-frag">{t("settings.field.fragDur")}</label>
                    <input id="h-frag" className="input font-mono" defaultValue={4} />
                  </div>
                </div>
                <SwitchRow {...sw("cors")} defaultChecked />
                <SwitchRow {...sw("api")} defaultChecked />
                <FormActions />
              </form>
            </section>
          )}

          {tab === "auth" && (
            <section>
              <div className="mb-4">
                <h2 className="text-lg font-semibold tracking-tight">{t("settings.tab.auth")}</h2>
                <p className="text-sm text-stone-500 mt-0.5">{t("settings.auth.subtitle")}</p>
              </div>
              <form className="card p-5 space-y-5" onSubmit={onSettingsSubmit}>
                <SwitchRow {...sw("publishAuth")} defaultChecked />
                <div>
                  <label className="label" htmlFor="a-secret">{t("settings.field.secret")}</label>
                  <input id="a-secret" className="input font-mono" type="password" defaultValue="nms-secret-2024" />
                  <p className="help">{t("settings.field.secretHelp")}</p>
                </div>
                <SwitchRow {...sw("playAuth")} />
                <div className="grid gap-5 sm:grid-cols-2">
                  <div>
                    <label className="label" htmlFor="a-exp">{t("settings.field.expiry")}</label>
                    <input id="a-exp" className="input font-mono" defaultValue={300} />
                  </div>
                  <div>
                    <label className="label" htmlFor="a-ip">{t("settings.field.ipLimit")}</label>
                    <input id="a-ip" className="input font-mono" defaultValue={8} />
                  </div>
                </div>
                <FormActions />
              </form>
            </section>
          )}

          {tab === "storage" && (
            <section>
              <div className="mb-4">
                <h2 className="text-lg font-semibold tracking-tight">{t("settings.tab.storage")}</h2>
                <p className="text-sm text-stone-500 mt-0.5">{t("settings.storage.subtitle")}</p>
              </div>
              <form className="card p-5 space-y-5" onSubmit={onSettingsSubmit}>
                <div className="grid gap-5 sm:grid-cols-2">
                  <div>
                    <label className="label" htmlFor="s-dir">{t("settings.field.recDir")}</label>
                    <input id="s-dir" className="input font-mono" defaultValue="/media/records" />
                  </div>
                  <div>
                    <label className="label" htmlFor="s-fmt">{t("settings.field.recFmt")}</label>
                    <select id="s-fmt" className="select" defaultValue="MP4">
                      <option>MP4</option>
                      <option>FLV</option>
                      <option>HLS-TS</option>
                    </select>
                  </div>
                  <div>
                    <label className="label" htmlFor="s-keep">{t("settings.field.recKeep")}</label>
                    <input id="s-keep" className="input font-mono" defaultValue={15} />
                  </div>
                  <div>
                    <label className="label" htmlFor="s-seg">{t("settings.field.recSeg")}</label>
                    <input id="s-seg" className="input font-mono" defaultValue={30} />
                  </div>
                </div>
                <SwitchRow {...sw("autoRec")} />
                <SwitchRow {...sw("diskClean")} defaultChecked />
                <FormActions />
              </form>
            </section>
          )}

          {tab === "notify" && (
            <section>
              <div className="mb-4">
                <h2 className="text-lg font-semibold tracking-tight">{t("settings.tab.notify")}</h2>
                <p className="text-sm text-stone-500 mt-0.5">{t("settings.notify.subtitle")}</p>
              </div>
              <form className="card p-5 space-y-5" onSubmit={onSettingsSubmit}>
                <div>
                  <label className="label" htmlFor="n-hook">{t("settings.field.webhook")}</label>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input id="n-hook" className="input font-mono text-xs flex-1" defaultValue="https://hooks.example.com/nms/alert" />
                    <button type="button" className="btn btn-secondary shrink-0" onClick={() => toast(t("settings.toastWebhookOk"))}>
                      <Icon name="send" className="w-3.5 h-3.5" />
                      {t("settings.testConnection")}
                    </button>
                  </div>
                  <p className="help">{t("settings.webhookHelp")}</p>
                </div>
                <SwitchRow {...sw("notifyPublish")} defaultChecked />
                <SwitchRow {...sw("notifyRecord")} defaultChecked />
                <SwitchRow {...sw("notifyError")} defaultChecked />
                <FormActions />
              </form>
            </section>
          )}
        </div>
      </div>
    </main>
  );
}
