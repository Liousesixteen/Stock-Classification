"use client";

import { GripVertical, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen } from "lucide-react";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";

type PanelSide = "left" | "right";

type PanelDefinition = {
  defaultWidth: number;
  minWidth: number;
  maxWidth: number;
};

type PanelLayout = {
  leftWidth: number;
  rightWidth: number;
  leftCollapsed: boolean;
  rightCollapsed: boolean;
};

export function useResizablePanelLayout(
  storageKey: string,
  left: PanelDefinition,
  right: PanelDefinition,
) {
  const [layout, setLayout] = useState<PanelLayout>({
    leftWidth: left.defaultWidth,
    rightWidth: right.defaultWidth,
    leftCollapsed: false,
    rightCollapsed: false,
  });
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<PanelLayout>;
        setLayout({
          leftWidth: clamp(parsed.leftWidth, left.minWidth, left.maxWidth, left.defaultWidth),
          rightWidth: clamp(parsed.rightWidth, right.minWidth, right.maxWidth, right.defaultWidth),
          leftCollapsed: parsed.leftCollapsed === true,
          rightCollapsed: parsed.rightCollapsed === true,
        });
      }
    } catch {
      // Invalid local layout state should never block the workspace.
    }
    setHydrated(true);
  }, [left.defaultWidth, left.maxWidth, left.minWidth, right.defaultWidth, right.maxWidth, right.minWidth, storageKey]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(layout));
    } catch {
      // Storage can be unavailable in private or restricted browser contexts.
    }
  }, [hydrated, layout, storageKey]);

  const resize = useCallback((side: PanelSide, event: ReactPointerEvent<HTMLElement>) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = side === "left" ? layout.leftWidth : layout.rightWidth;
    const definition = side === "left" ? left : right;
    document.body.classList.add("is-resizing-workspace");

    const move = (pointerEvent: PointerEvent) => {
      const delta = side === "left" ? pointerEvent.clientX - startX : startX - pointerEvent.clientX;
      setLayout((current) => ({
        ...current,
        [side === "left" ? "leftWidth" : "rightWidth"]: Math.round(
          Math.max(definition.minWidth, Math.min(definition.maxWidth, startWidth + delta)),
        ),
      }));
    };
    const stop = () => {
      document.body.classList.remove("is-resizing-workspace");
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop, { once: true });
  }, [layout.leftWidth, layout.rightWidth, left, right]);

  const resizeByKeyboard = useCallback((side: PanelSide, delta: number) => {
    const definition = side === "left" ? left : right;
    setLayout((current) => {
      const key = side === "left" ? "leftWidth" : "rightWidth";
      return {
        ...current,
        [key]: Math.max(definition.minWidth, Math.min(definition.maxWidth, current[key] + delta)),
      };
    });
  }, [left, right]);

  const toggle = useCallback((side: PanelSide) => {
    setLayout((current) => ({
      ...current,
      [side === "left" ? "leftCollapsed" : "rightCollapsed"]:
        !current[side === "left" ? "leftCollapsed" : "rightCollapsed"],
    }));
  }, []);

  const style = useMemo(() => ({
    "--workspace-left-panel": layout.leftCollapsed ? "0px" : `${layout.leftWidth}px`,
    "--workspace-right-panel": layout.rightCollapsed ? "0px" : `${layout.rightWidth}px`,
  }) as CSSProperties, [layout]);

  return { layout, bounds: { left, right }, style, resize, resizeByKeyboard, toggle };
}

export function ResizablePanelControls({
  layout,
  bounds,
  onResize,
  onResizeByKeyboard,
  onToggle,
}: {
  layout: PanelLayout;
  bounds: { left: PanelDefinition; right: PanelDefinition };
  onResize: (side: PanelSide, event: ReactPointerEvent<HTMLElement>) => void;
  onResizeByKeyboard: (side: PanelSide, delta: number) => void;
  onToggle: (side: PanelSide) => void;
}) {
  return (
    <>
      <button
        className="workspace-panel-toggle is-left"
        type="button"
        title={layout.leftCollapsed ? "展开左侧栏" : "折叠左侧栏"}
        aria-label={layout.leftCollapsed ? "展开左侧栏" : "折叠左侧栏"}
        aria-pressed={layout.leftCollapsed}
        onClick={() => onToggle("left")}
      >
        {layout.leftCollapsed ? <PanelLeftOpen aria-hidden="true" /> : <PanelLeftClose aria-hidden="true" />}
      </button>
      <button
        className="workspace-panel-toggle is-right"
        type="button"
        title={layout.rightCollapsed ? "展开右侧栏" : "折叠右侧栏"}
        aria-label={layout.rightCollapsed ? "展开右侧栏" : "折叠右侧栏"}
        aria-pressed={layout.rightCollapsed}
        onClick={() => onToggle("right")}
      >
        {layout.rightCollapsed ? <PanelRightOpen aria-hidden="true" /> : <PanelRightClose aria-hidden="true" />}
      </button>
      {!layout.leftCollapsed ? (
        <div
          className="workspace-panel-resizer is-left"
          role="separator"
          aria-label="调整左侧栏宽度"
          aria-orientation="vertical"
          aria-valuemin={bounds.left.minWidth}
          aria-valuemax={bounds.left.maxWidth}
          aria-valuenow={layout.leftWidth}
          tabIndex={0}
          onPointerDown={(event) => onResize("left", event)}
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft") { event.preventDefault(); onResizeByKeyboard("left", -12); }
            if (event.key === "ArrowRight") { event.preventDefault(); onResizeByKeyboard("left", 12); }
          }}
        ><GripVertical aria-hidden="true" /></div>
      ) : null}
      {!layout.rightCollapsed ? (
        <div
          className="workspace-panel-resizer is-right"
          role="separator"
          aria-label="调整右侧栏宽度"
          aria-orientation="vertical"
          aria-valuemin={bounds.right.minWidth}
          aria-valuemax={bounds.right.maxWidth}
          aria-valuenow={layout.rightWidth}
          tabIndex={0}
          onPointerDown={(event) => onResize("right", event)}
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft") { event.preventDefault(); onResizeByKeyboard("right", 12); }
            if (event.key === "ArrowRight") { event.preventDefault(); onResizeByKeyboard("right", -12); }
          }}
        ><GripVertical aria-hidden="true" /></div>
      ) : null}
    </>
  );
}

function clamp(value: unknown, min: number, max: number, fallback: number) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(min, Math.min(max, value))
    : fallback;
}
