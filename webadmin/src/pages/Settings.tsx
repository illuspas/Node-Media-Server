import { useState } from "react";
import Icon from "../components/Icon";
import { toast } from "../lib/toast";

const TABS = [
  { id: "general", label: "通用", icon: "sliders" },
  { id: "rtmp", label: "RTMP 服务", icon: "server" },
  { id: "http", label: "HTTP 服务", icon: "globe" },
  { id: "auth", label: "安全认证", icon: "lock" },
  { id: "storage", label: "录制存储", icon: "hard-drive" },
  { id: "notify", label: "通知告警", icon: "bell" }
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
  return (
    <div className="flex justify-end gap-2 pt-2 border-t border-stone-100">
      <button type="button" className="btn btn-ghost">
        恢复默认
      </button>
      <button type="submit" className="btn btn-primary">
        保存更改
      </button>
    </div>
  );
}

function onSettingsSubmit(e: React.FormEvent) {
  e.preventDefault();
  toast("设置已保存");
}

export default function Settings() {
  const [tab, setTab] = useState<TabId>("general");

  return (
    <main className="p-4 md:p-6 max-w-[1100px] mx-auto space-y-4 md:space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-semibold tracking-tight">系统设置</h1>
        <p className="text-sm text-stone-500 mt-1">配置 Node-Media-Server 的运行参数，保存后即时生效</p>
      </div>

      <div className="flex flex-col lg:flex-row lg:gap-8">
        {/* side nav */}
        <aside className="lg:w-56 shrink-0 mb-4 lg:mb-0">
          <nav className="flex lg:flex-col gap-1 overflow-x-auto pb-1 lg:pb-0">
            {TABS.map(t => (
              <button
                key={t.id}
                className={`snav ${t.id === tab ? "active" : ""}`}
                onClick={() => setTab(t.id)}
              >
                <Icon name={t.icon} className="w-4 h-4" />
                {t.label}
              </button>
            ))}
          </nav>
        </aside>

        {/* panels */}
        <div className="flex-1 min-w-0 space-y-6">
          {tab === "general" && (
            <section>
              <div className="mb-4">
                <h2 className="text-lg font-semibold tracking-tight">通用</h2>
                <p className="text-sm text-stone-500 mt-0.5">实例基础信息与全局行为</p>
              </div>
              <form className="card p-5 space-y-5" onSubmit={onSettingsSubmit}>
                <div className="grid gap-5 sm:grid-cols-2">
                  <div>
                    <label className="label" htmlFor="g-name">实例名称</label>
                    <input id="g-name" className="input" defaultValue="NMS Console" />
                  </div>
                  <div>
                    <label className="label" htmlFor="g-tz">服务器时区</label>
                    <select id="g-tz" className="select" defaultValue="Asia/Shanghai (UTC+8)">
                      <option>Asia/Shanghai (UTC+8)</option>
                      <option>UTC</option>
                      <option>America/New_York</option>
                      <option>Europe/London</option>
                    </select>
                  </div>
                  <div>
                    <label className="label" htmlFor="g-keep">统计数据保留（天）</label>
                    <input id="g-keep" className="input" type="number" defaultValue={30} />
                    <p className="help">超过保留期的会话与带宽记录将被自动清理。</p>
                  </div>
                  <div>
                    <label className="label" htmlFor="g-log">日志级别</label>
                    <select id="g-log" className="select" defaultValue="info">
                      <option>info</option>
                      <option>debug</option>
                      <option>warn</option>
                      <option>error</option>
                    </select>
                  </div>
                </div>
                <SwitchRow title="自动检查更新" desc="每周检查一次 Node-Media-Server 新版本" defaultChecked />
                <FormActions />
              </form>
            </section>
          )}

          {tab === "rtmp" && (
            <section>
              <div className="mb-4">
                <h2 className="text-lg font-semibold tracking-tight">RTMP 服务</h2>
                <p className="text-sm text-stone-500 mt-0.5">核心推流入口协议配置</p>
              </div>
              <form className="card p-5 space-y-5" onSubmit={onSettingsSubmit}>
                <div className="grid gap-5 sm:grid-cols-2">
                  <div>
                    <label className="label" htmlFor="rt-port">监听端口</label>
                    <input id="rt-port" className="input font-mono" defaultValue={1935} />
                  </div>
                  <div>
                    <label className="label" htmlFor="rt-chunk">Chunk Size</label>
                    <input id="rt-chunk" className="input font-mono" defaultValue={60000} />
                  </div>
                </div>
                <SwitchRow title="GOP 缓存" desc="缓存最近一组关键帧，显著降低首帧等待时间" defaultChecked />
                <SwitchRow title="同步转 HLS" desc="推流时自动生成 HLS 切片" defaultChecked />
                <SwitchRow title="同步转 HTTP-FLV" desc="推流时自动开放 HTTP-FLV 播放地址" defaultChecked />
                <FormActions />
              </form>
            </section>
          )}

          {tab === "http" && (
            <section>
              <div className="mb-4">
                <h2 className="text-lg font-semibold tracking-tight">HTTP 服务</h2>
                <p className="text-sm text-stone-500 mt-0.5">API 与播放网关配置</p>
              </div>
              <form className="card p-5 space-y-5" onSubmit={onSettingsSubmit}>
                <div className="grid gap-5 sm:grid-cols-2">
                  <div>
                    <label className="label" htmlFor="h-port">监听端口</label>
                    <input id="h-port" className="input font-mono" defaultValue={8000} />
                  </div>
                  <div>
                    <label className="label" htmlFor="h-root">媒体根目录</label>
                    <input id="h-root" className="input font-mono" defaultValue="/media" />
                  </div>
                  <div>
                    <label className="label" htmlFor="h-hls">HLS 切片时长（秒）</label>
                    <input id="h-hls" className="input font-mono" defaultValue={6} />
                  </div>
                  <div>
                    <label className="label" htmlFor="h-frag">FLV 分片时长（秒）</label>
                    <input id="h-frag" className="input font-mono" defaultValue={4} />
                  </div>
                </div>
                <SwitchRow title="允许跨域（CORS）" desc="允许网页播放器跨域拉取 FLV / HLS 流" defaultChecked />
                <SwitchRow title="开放管理 API" desc="外部系统可通过 /api 访问本控制台数据" defaultChecked />
                <FormActions />
              </form>
            </section>
          )}

          {tab === "auth" && (
            <section>
              <div className="mb-4">
                <h2 className="text-lg font-semibold tracking-tight">安全认证</h2>
                <p className="text-sm text-stone-500 mt-0.5">推拉流地址签名与访问控制</p>
              </div>
              <form className="card p-5 space-y-5" onSubmit={onSettingsSubmit}>
                <SwitchRow title="推流鉴权" desc="发布地址必须携带签名参数方可推流" defaultChecked />
                <div>
                  <label className="label" htmlFor="a-secret">签名密钥（Secret）</label>
                  <input id="a-secret" className="input font-mono" type="password" defaultValue="nms-secret-2024" />
                  <p className="help">密钥用于生成 exp / sign 签名参数，请妥善保管。</p>
                </div>
                <SwitchRow title="播放鉴权" desc="HTTP-FLV / HLS 播放地址同样需要签名" />
                <div className="grid gap-5 sm:grid-cols-2">
                  <div>
                    <label className="label" htmlFor="a-exp">签名有效期（秒）</label>
                    <input id="a-exp" className="input font-mono" defaultValue={300} />
                  </div>
                  <div>
                    <label className="label" htmlFor="a-ip">限制单 IP 连接数</label>
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
                <h2 className="text-lg font-semibold tracking-tight">录制存储</h2>
                <p className="text-sm text-stone-500 mt-0.5">录像行为与磁盘策略</p>
              </div>
              <form className="card p-5 space-y-5" onSubmit={onSettingsSubmit}>
                <div className="grid gap-5 sm:grid-cols-2">
                  <div>
                    <label className="label" htmlFor="s-dir">录制目录</label>
                    <input id="s-dir" className="input font-mono" defaultValue="/media/records" />
                  </div>
                  <div>
                    <label className="label" htmlFor="s-fmt">文件格式</label>
                    <select id="s-fmt" className="select" defaultValue="MP4">
                      <option>MP4</option>
                      <option>FLV</option>
                      <option>HLS-TS</option>
                    </select>
                  </div>
                  <div>
                    <label className="label" htmlFor="s-keep">录像保留（天）</label>
                    <input id="s-keep" className="input font-mono" defaultValue={15} />
                  </div>
                  <div>
                    <label className="label" htmlFor="s-seg">自动分段时长（分钟）</label>
                    <input id="s-seg" className="input font-mono" defaultValue={30} />
                  </div>
                </div>
                <SwitchRow title="新流自动录制" desc="检测到新推流时自动开始录制" />
                <SwitchRow title="磁盘满自动清理" desc="空间不足 5% 时按时间顺序删除最早录像" defaultChecked />
                <FormActions />
              </form>
            </section>
          )}

          {tab === "notify" && (
            <section>
              <div className="mb-4">
                <h2 className="text-lg font-semibold tracking-tight">通知告警</h2>
                <p className="text-sm text-stone-500 mt-0.5">关键事件推送到外部系统</p>
              </div>
              <form className="card p-5 space-y-5" onSubmit={onSettingsSubmit}>
                <div>
                  <label className="label" htmlFor="n-hook">Webhook 地址</label>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input id="n-hook" className="input font-mono text-xs flex-1" defaultValue="https://hooks.example.com/nms/alert" />
                    <button type="button" className="btn btn-secondary shrink-0" onClick={() => toast("Webhook 连接测试成功")}>
                      <Icon name="send" className="w-3.5 h-3.5" />
                      测试连接
                    </button>
                  </div>
                  <p className="help">以 JSON POST 推送事件，兼容钉钉 / 飞书 / 企业微信机器人格式。</p>
                </div>
                <SwitchRow title="推流开始 / 结束" desc="流上下线时通知" defaultChecked />
                <SwitchRow title="录制完成" desc="录像归档后通知" defaultChecked />
                <SwitchRow title="服务异常告警" desc="端口不可用 / 码率异常波动时通知" defaultChecked />
                <FormActions />
              </form>
            </section>
          )}
        </div>
      </div>
    </main>
  );
}
