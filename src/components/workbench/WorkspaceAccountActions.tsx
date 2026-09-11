"use client";

import {
  Bell,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Crown,
  Database,
  Settings2,
  ShieldCheck,
  UserRound,
  X,
} from "lucide-react";
import React from "react";
import { useEffect, useId, useRef, useState } from "react";
import type { AccountSection } from "./AccountWorkspace";

type RuntimeStatus = {
  deepseekConfigured: boolean;
  model: string;
  profileProvidersEnabled: boolean;
};

type QueueSummary = {
  attention: number;
  running: number;
};

const shortcuts: Array<{
  section: AccountSection;
  label: string;
  description: string;
  icon: typeof UserRound;
}> = [
  { section: "profile", label: "个人研究空间", description: "关注与研究历史", icon: UserRound },
  { section: "membership", label: "研究权益", description: "能力与使用边界", icon: Crown },
  { section: "data", label: "数据与模型", description: "Provider 运行状态", icon: Database },
  { section: "notifications", label: "通知设置", description: "任务与证据提醒", icon: Bell },
];

export function WorkspaceAccountActions({
  queue,
  queueOpen,
  accountActive,
  onOpenQueue,
  onOpenAccount,
}: {
  queue: QueueSummary;
  queueOpen: boolean;
  accountActive: boolean;
  onOpenQueue: () => void;
  onOpenAccount: (section: AccountSection) => void;
}) {
  const [open, setOpen] = useState(false);
  const [runtime, setRuntime] = useState<RuntimeStatus | null>(null);
  const [runtimeUnavailable, setRuntimeUnavailable] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const queueCount = queue.attention;

  useEffect(() => {
    if (!open) return;
    const closeOnPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnPointerDown);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnPointerDown);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  useEffect(() => {
    if (!open || runtime || runtimeUnavailable) return;
    const controller = new AbortController();
    void fetch("/api/runtime-config", { cache: "no-store", signal: controller.signal })
      .then((response) => response.ok ? response.json() as Promise<RuntimeStatus> : Promise.reject(new Error("runtime unavailable")))
      .then(setRuntime)
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setRuntimeUnavailable(true);
      });
    return () => controller.abort();
  }, [open, runtime, runtimeUnavailable]);

  const navigate = (section: AccountSection) => {
    setOpen(false);
    onOpenAccount(section);
  };

  return (
    <div className="workspace-account-actions" ref={rootRef}>
      <button
        className="queue-launch"
        type="button"
        aria-label={queueCount ? `打开任务中心，${queueCount} 项待处理` : "打开任务中心"}
        aria-expanded={queueOpen}
        aria-pressed={queueOpen}
        onClick={() => { setOpen(false); onOpenQueue(); }}
      >
        <Bell aria-hidden="true" />
        <span>任务中心</span>
        {queueCount ? <b>{queueCount > 99 ? "99+" : queueCount}</b> : null}
      </button>

      <button
        type="button"
        className="workspace-profile"
        title="账户与设置"
        aria-label="打开账户与设置"
        aria-haspopup="dialog"
        aria-controls={panelId}
        aria-expanded={open}
        aria-pressed={accountActive || open}
        onClick={() => setOpen((value) => !value)}
      >
        <span>N</span><ChevronDown aria-hidden="true" />
      </button>

      {open ? (
        <aside id={panelId} className="workspace-profile-popover account-command-popover" role="dialog" aria-label="账户与设置">
          <header>
            <div>
              <span>N</span>
              <div><strong>本地研究账户</strong><small><Crown aria-hidden="true" />星图专享会员</small></div>
            </div>
            <button type="button" aria-label="关闭账户与设置" onClick={() => setOpen(false)}><X aria-hidden="true" /></button>
          </header>

          <section className="account-command-task-summary">
            <div><span>研究任务</span><strong>{queueCount ? `${queueCount} 项待处理` : "当前无待办"}</strong></div>
            <div aria-label="任务状态">
              <span className={queue.attention ? "is-attention" : "is-clear"}><i />待处理 <b>{queue.attention}</b></span>
              <span className="is-running"><i />进行中 <b>{queue.running}</b></span>
            </div>
            <button type="button" onClick={() => { setOpen(false); onOpenQueue(); }}>查看全部任务<ChevronRight aria-hidden="true" /></button>
          </section>

          <nav className="account-command-shortcuts" aria-label="账户快捷设置">
            {shortcuts.map((item) => (
              <button type="button" key={item.section} onClick={() => navigate(item.section)}>
                <span><item.icon aria-hidden="true" /></span>
                <span><b>{item.label}</b><small>{item.description}</small></span>
                <ChevronRight aria-hidden="true" />
              </button>
            ))}
          </nav>

          <section className="account-command-runtime" aria-live="polite">
            <div><span>{runtime?.deepseekConfigured ? <CheckCircle2 aria-hidden="true" /> : <Settings2 aria-hidden="true" />}AI 研究</span><b className={runtime?.deepseekConfigured ? "is-ready" : "is-pending"}>{runtimeUnavailable ? "状态不可用" : runtime ? runtime.deepseekConfigured ? runtime.model : "待配置" : "读取中"}</b></div>
            <div><span><Database aria-hidden="true" />资料 Provider</span><b className={runtime?.profileProvidersEnabled ? "is-ready" : "is-pending"}>{runtimeUnavailable ? "状态不可用" : runtime ? runtime.profileProvidersEnabled ? "已启用" : "本地模式" : "读取中"}</b></div>
          </section>

          <footer><ShieldCheck aria-hidden="true" /><span>研究数据保存在当前工作区<br />服务密钥仅在本地服务端读取</span></footer>
        </aside>
      ) : null}
    </div>
  );
}
