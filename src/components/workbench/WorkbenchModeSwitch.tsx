"use client";

import { Bot, FileText, Orbit, PanelsTopLeft } from "lucide-react";
import * as React from "react";
import type { WorkbenchMode } from "./types";

export function WorkbenchModeSwitch({ value, onChange }: { value: WorkbenchMode; onChange: (mode: WorkbenchMode) => void }) {
  return (
    <nav className="mode-navigation" aria-label="主要功能导航">
      <div className="mode-switch" aria-label="主要功能">
        <button type="button" aria-pressed={value === "rich"} onClick={() => onChange("rich")}>
          <PanelsTopLeft aria-hidden="true" />
          市场工作台
        </button>
        <button type="button" aria-pressed={value === "atlas"} onClick={() => onChange("atlas")}>
          <Orbit aria-hidden="true" />
          星图
        </button>
        <button type="button" aria-pressed={value === "ai"} onClick={() => onChange("ai")}>
          <Bot aria-hidden="true" />
          AI研判
        </button>
        <button type="button" aria-pressed={value === "report"} onClick={() => onChange("report")}>
          <FileText aria-hidden="true" />
          研报生成
        </button>
      </div>
      {/* LEGACY NAVIGATION（按产品要求注释保留）：研究工作台、公司研究与成果库入口曾位于此处。 */}
    </nav>
  );
}
