import { CircleAlert, Inbox, LoaderCircle, RefreshCw } from "lucide-react";
import React, { type ReactNode } from "react";

export function WorkspaceState({
  state,
  title,
  description,
  actionLabel = "重新加载",
  onAction,
  compact = false,
  icon,
}: {
  state: "loading" | "error" | "empty";
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  compact?: boolean;
  icon?: ReactNode;
}) {
  return (
    <div className={`workspace-state is-${state} ${compact ? "is-compact" : ""}`} role={state === "error" ? "alert" : "status"}>
      <span className="workspace-state-icon">
        {icon ?? (state === "loading"
          ? <LoaderCircle aria-hidden="true" />
          : state === "error"
            ? <CircleAlert aria-hidden="true" />
            : <Inbox aria-hidden="true" />)}
      </span>
      <strong>{title}</strong>
      {description ? <p>{description}</p> : null}
      {state === "loading" ? (
        <div className="workspace-state-skeleton" aria-hidden="true">
          <i /><i /><i /><i />
        </div>
      ) : null}
      {onAction ? <button type="button" onClick={onAction}><RefreshCw aria-hidden="true" />{actionLabel}</button> : null}
    </div>
  );
}
