"use client";

import { Bell, BookOpenCheck, CheckCircle2, Crown, Database, FolderClock, Settings2, ShieldCheck, Star, UserRound } from "lucide-react";
import { useEffect, useState } from "react";

export type AccountSection = "profile" | "membership" | "data" | "notifications";
type RuntimeStatus = { deepseekConfigured: boolean; model: string; profileProvidersEnabled: boolean };

const accountSections = [
  { id: "profile" as const, label: "个人资料", icon: UserRound },
  { id: "membership" as const, label: "会员权益", icon: Crown },
  { id: "data" as const, label: "数据偏好", icon: Database },
  { id: "notifications" as const, label: "通知设置", icon: Bell },
];

export function AccountWorkspace({ section, queueCount, onOpenQueue, onSectionChange }: { section: AccountSection; queueCount: number; onOpenQueue: () => void; onSectionChange: (section: AccountSection) => void }) {
  const [runtime, setRuntime] = useState<RuntimeStatus | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/runtime-config", { signal: controller.signal, cache: "no-store" })
      .then((response) => response.ok ? response.json() as Promise<RuntimeStatus> : Promise.reject(new Error("runtime unavailable")))
      .then(setRuntime)
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setRuntime({ deepseekConfigured: false, model: "未配置", profileProvidersEnabled: false });
      });
    return () => controller.abort();
  }, []);

  return (
    <section className="account-workspace">
      <header><div><span>我的账户</span><h2>个人研究空间</h2><p>管理资料、研究权益、数据偏好与任务通知。</p></div><button type="button" onClick={onOpenQueue}><Bell aria-hidden="true" />打开任务中心{queueCount ? <b>{queueCount > 99 ? "99+" : queueCount}</b> : null}</button></header>
      <div className="account-layout">
        <nav aria-label="账户设置">{accountSections.map((item) => <button type="button" key={item.id} className={section === item.id ? "is-active" : ""} onClick={() => onSectionChange(item.id)}><item.icon aria-hidden="true" />{item.label}</button>)}</nav>
        <main>
          {section === "profile" ? <>
            <section className="account-profile-card"><div className="account-avatar">N<span><Settings2 aria-hidden="true" /></span></div><div><h3>本地研究账户 <em>星图专享会员</em></h3><p>个人研究数据保存在当前工作区</p><small>区域：中国 · 研究偏好：A 股产业链</small></div><article><Crown aria-hidden="true" /><span><b>星图专享会员</b><small>深度研究与研报工作流已启用</small></span></article></section>
            <div className="account-columns"><section><header><h3>我的关注</h3><button type="button">管理关注</button></header><div className="account-follow-list"><AccountRow icon={Star} title="先进封装产业链" meta="半导体封装测试" /><AccountRow icon={Star} title="PCB 产业链" meta="电子元件" /><AccountRow icon={Star} title="存储芯片产业链" meta="半导体" /></div></section><section><header><h3>研究历史</h3><button type="button">全部历史</button></header><div className="account-follow-list"><AccountRow icon={BookOpenCheck} title="通富微电产业位置梳理" meta="公司研报 · 最近更新" /><AccountRow icon={FolderClock} title="先进封装产业链梳理" meta="产业链研究" /><AccountRow icon={BookOpenCheck} title="半导体设备国产化跟踪" meta="主题研究" /></div></section></div>
          </> : <AccountSettingsSection section={section} runtime={runtime} />}
        </main>
      </div>
    </section>
  );
}

function AccountRow({ icon: Icon, title, meta }: { icon: typeof Star; title: string; meta: string }) {
  return <article><span><Icon aria-hidden="true" /></span><div><b>{title}</b><small>{meta}</small></div><em>›</em></article>;
}

function AccountSettingsSection({ section, runtime }: { section: Exclude<AccountSection, "profile">; runtime: RuntimeStatus | null }) {
  const meta = {
    membership: { title: "会员权益", description: "查看当前研究能力与使用边界。", icon: Crown },
    data: { title: "数据偏好", description: "确认 AI 与公司资料数据源的运行状态。", icon: Database },
    notifications: { title: "通知设置", description: "控制研究任务与证据更新提醒。", icon: Bell },
  }[section];
  const Icon = meta.icon;
  return <section className="account-settings-card"><header><Icon aria-hidden="true" /><div><h3>{meta.title}</h3><p>{meta.description}</p></div></header>{section === "membership" ? <div className="account-setting-rows"><SettingRow label="深度研究" value="不限次" ready /><SettingRow label="AI 研报生成" value="已启用" ready /><SettingRow label="数据导出" value="500 次 / 月" ready /></div> : section === "data" ? <div className="account-setting-rows"><SettingRow label="AI 研究服务" value={runtime ? runtime.deepseekConfigured ? `已配置 · ${runtime.model}` : "尚未配置" : "读取中"} ready={runtime?.deepseekConfigured} /><SettingRow label="公司资料 Provider" value={runtime?.profileProvidersEnabled ? "真实数据源已启用" : "本地证据边界模式"} ready={runtime?.profileProvidersEnabled} /><p><ShieldCheck aria-hidden="true" />密钥只在服务端读取，不会在界面或接口中返回。</p></div> : <div className="account-setting-rows"><SettingRow label="任务进度提醒" value="开启" ready /><SettingRow label="证据更新提醒" value="开启" ready /><SettingRow label="周度研究摘要" value="关闭" /></div>}</section>;
}

function SettingRow({ label, value, ready = false }: { label: string; value: string; ready?: boolean }) {
  return <div><span>{ready ? <CheckCircle2 aria-hidden="true" /> : <ShieldCheck aria-hidden="true" />}{label}</span><b className={ready ? "is-ready" : ""}>{value}</b></div>;
}
