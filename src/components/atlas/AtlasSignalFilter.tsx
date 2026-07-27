"use client";

import { ArrowDownToLine, ArrowUpFromLine, Bookmark, CircleAlert, FileWarning, ShieldCheck } from "lucide-react";
import type { IndustryGraphSignalFilter } from "@/lib/industry-graph/types";

const options: Array<{ id: IndustryGraphSignalFilter; label: string; icon: typeof ShieldCheck }> = [
  { id: "all", label: "全部连接", icon: ShieldCheck },
  { id: "upstream", label: "上游输入", icon: ArrowDownToLine },
  { id: "downstream", label: "下游输出", icon: ArrowUpFromLine },
  { id: "verified", label: "已证实", icon: ShieldCheck },
  { id: "review", label: "待复核", icon: CircleAlert },
  { id: "missingEvidence", label: "缺证据", icon: FileWarning },
  { id: "watchlist", label: "重点跟踪", icon: Bookmark },
];

export function AtlasSignalFilter({ value, onChange }: { value: IndustryGraphSignalFilter; onChange: (value: IndustryGraphSignalFilter) => void }) {
  return <div className="atlas-signal-filter" aria-label="图谱信号筛选">{options.map(({ id, label, icon: Icon }) => <button type="button" key={id} className={value === id ? "is-active" : ""} onClick={() => onChange(id)}><Icon aria-hidden="true" /><span>{label}</span></button>)}</div>;
}
