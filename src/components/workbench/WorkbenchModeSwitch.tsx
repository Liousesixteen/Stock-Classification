"use client";

import { Boxes, ClipboardList, LibraryBig, Orbit } from "lucide-react";
import * as React from "react";
import type { WorkbenchMode } from "./types";

export function WorkbenchModeSwitch({ value, onChange, onOpenQueue }: { value: WorkbenchMode; onChange: (mode: WorkbenchMode) => void; onOpenQueue: () => void }) {
  return (
    <div className="mode-navigation" aria-label="研究空间导航">
      <div className="mode-switch" aria-label="研究空间">
        <button type="button" aria-pressed={value === "research"} onClick={() => onChange("research")}>
          <Boxes aria-hidden="true" />
          研究工作台
        </button>
        <button type="button" aria-pressed={value === "atlas"} onClick={() => onChange("atlas")}>
          <Orbit aria-hidden="true" />
          产业链图谱
        </button>
        <button type="button" aria-pressed={value === "results"} onClick={() => onChange("results")}>
          <LibraryBig aria-hidden="true" />
          成果库
        </button>
      </div>
      <button className="queue-launch" type="button" aria-label="任务中心" aria-pressed={value === "queue"} onClick={onOpenQueue}>
        <ClipboardList aria-hidden="true" />
        <span>任务中心</span>
      </button>
    </div>
  );
}
