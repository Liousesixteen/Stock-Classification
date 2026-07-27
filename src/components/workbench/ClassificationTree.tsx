"use client";

import { Building2, Check, ChevronRight, Pencil, Plus, Trash2, X } from "lucide-react";
import { type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import type { CategoryNode } from "@/lib/domain/types";

type ClassificationTreeProps = {
  selectedCategoryId: number | null;
  onSelect: (categoryId: number) => void;
  onClearSelection: () => void;
  onAddStock?: (categoryId: number) => void;
  onChanged: () => void;
  refreshKey: number;
};

type DraftState =
  | {
      mode: "create";
      parentId: number | null;
      value: string;
      error: string;
    }
  | {
      mode: "rename";
      categoryId: number;
      value: string;
      error: string;
    };

async function requestJson<T>(url: string, init: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  const data = (await response.json().catch(() => ({}))) as { error?: string };

  if (!response.ok) {
    throw new Error(data.error ?? "分类操作失败");
  }

  return data as T;
}

function findDefaultLeaf(nodes: CategoryNode[]): CategoryNode | undefined {
  for (const node of nodes) {
    if (node.name === "ArF 干法/浸没式光刻胶") return node;
    const child = findDefaultLeaf(node.children);
    if (child) return child;
  }
  return nodes[0];
}

function collectDefaultExpandedIds(nodes: CategoryNode[]) {
  const expandedIds = new Set<number>();

  const walk = (items: CategoryNode[]) => {
    for (const item of items) {
      if (item.children.length > 0 && item.level <= 2) {
        expandedIds.add(item.id);
      }
      walk(item.children);
    }
  };

  walk(nodes);
  return expandedIds;
}

function IconButton({
  label,
  children,
  onClick,
  tone = "default",
}: {
  label: string;
  children: ReactNode;
  onClick: () => void;
  tone?: "default" | "danger";
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className={`grid h-7 w-7 shrink-0 place-items-center rounded border border-transparent transition ${
        tone === "danger"
          ? "text-slate-400 hover:border-rose-100 hover:bg-rose-50 hover:text-rose-600"
          : "text-slate-400 hover:border-line hover:bg-white hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

function DraftEditor({
  value,
  error,
  placeholder,
  onValueChange,
  onCancel,
  onSubmit,
}: {
  value: string;
  error: string;
  placeholder: string;
  onValueChange: (value: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit();
  };

  return (
    <form onSubmit={handleSubmit} className="rounded-md border border-[#b7d8c9] bg-white p-1.5 shadow-sm">
      <div className="flex items-center gap-1">
        <input
          autoFocus
          value={value}
          placeholder={placeholder}
          onChange={(event) => onValueChange(event.target.value)}
          className="min-w-0 flex-1 rounded border border-line px-2 py-1 text-[13px] outline-none transition focus:border-[#73b99a] focus:ring-2 focus:ring-[#dff0e8]"
        />
        <IconButton label="保存分类" onClick={onSubmit}>
          <Check className="h-3.5 w-3.5" />
        </IconButton>
        <IconButton label="取消分类编辑" onClick={onCancel}>
          <X className="h-3.5 w-3.5" />
        </IconButton>
      </div>
      {error ? <div className="mt-1 px-1 text-[11px] text-rose-600">{error}</div> : null}
    </form>
  );
}

function TreeNode({
  node,
  selectedCategoryId,
  onSelect,
  draft,
  expandedIds,
  onToggleExpanded,
  onStartCreate,
  onAddStock,
  onStartRename,
  onDelete,
  onDraftValueChange,
  onCancelDraft,
  onSubmitDraft,
}: {
  node: CategoryNode;
  selectedCategoryId: number | null;
  onSelect: (categoryId: number) => void;
  draft: DraftState | null;
  expandedIds: Set<number>;
  onToggleExpanded: (categoryId: number) => void;
  onStartCreate: (parentId: number | null) => void;
  onAddStock?: (categoryId: number) => void;
  onStartRename: (node: CategoryNode) => void;
  onDelete: (node: CategoryNode) => void;
  onDraftValueChange: (value: string) => void;
  onCancelDraft: () => void;
  onSubmitDraft: () => void;
}) {
  const hasChildren = node.children.length > 0;
  const isSelected = node.id === selectedCategoryId;
  const isExpanded = expandedIds.has(node.id);
  const isRenaming = draft?.mode === "rename" && draft.categoryId === node.id;
  const isCreatingChild = draft?.mode === "create" && draft.parentId === node.id;

  return (
    <div className="grid gap-1">
      <div
        className={`group/node flex min-w-0 items-center gap-1 rounded-md px-1 py-1 transition ${
          isSelected ? "bg-[#dff0e8] text-[#173326]" : "text-slate-700 hover:bg-slate-50"
        }`}
      >
        {hasChildren ? (
          <button
            type="button"
            aria-label={`${isExpanded ? "收起" : "展开"} ${node.name}`}
            title={`${isExpanded ? "收起" : "展开"} ${node.name}`}
            onClick={() => onToggleExpanded(node.id)}
            className="grid h-6 w-6 shrink-0 place-items-center rounded text-slate-500 hover:bg-white hover:text-ink"
          >
            <ChevronRight className={`h-3.5 w-3.5 transition ${isExpanded ? "rotate-90" : ""}`} />
          </button>
        ) : (
          <span className="h-6 w-6 shrink-0" />
        )}

        {isRenaming ? (
          <div className="min-w-0 flex-1">
            <DraftEditor
              value={draft.value}
              error={draft.error}
              placeholder="分组名称"
              onValueChange={onDraftValueChange}
              onCancel={onCancelDraft}
              onSubmit={onSubmitDraft}
            />
          </div>
        ) : (
          <>
            <button
              type="button"
              aria-label={node.name}
              title={node.name}
              onClick={() => onSelect(node.id)}
              className={`min-w-0 flex-1 truncate rounded px-1 py-1 text-left text-[13px] transition ${
                isSelected ? "font-semibold" : hasChildren ? "font-semibold" : "font-normal"
              }`}
            >
              {node.name}
            </button>
            {hasChildren ? (
              <span title="子分类数量" className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-muted">
                {node.children.length} 子类
              </span>
            ) : null}
            <div className="flex shrink-0 items-center">
              {onAddStock ? (
                <IconButton label={`向 ${node.name} 添加公司`} onClick={() => onAddStock(node.id)}>
                  <Building2 className="h-3.5 w-3.5" />
                </IconButton>
              ) : null}
              <IconButton label={`为 ${node.name} 新增子分类`} onClick={() => onStartCreate(node.id)}>
                <Plus className="h-3.5 w-3.5" />
              </IconButton>
              <IconButton label={`重命名 ${node.name}`} onClick={() => onStartRename(node)}>
                <Pencil className="h-3.5 w-3.5" />
              </IconButton>
              <IconButton label={`删除 ${node.name}`} onClick={() => onDelete(node)} tone="danger">
                <Trash2 className="h-3.5 w-3.5" />
              </IconButton>
            </div>
          </>
        )}
      </div>

      {isCreatingChild ? (
        <div className="ml-8">
          <DraftEditor
            value={draft.value}
            error={draft.error}
            placeholder="新分组名称"
            onValueChange={onDraftValueChange}
            onCancel={onCancelDraft}
            onSubmit={onSubmitDraft}
          />
        </div>
      ) : null}

      {isExpanded && node.children.length > 0 ? (
        <div className="ml-3 grid gap-1 border-l border-slate-200 pl-2">
          {node.children.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              selectedCategoryId={selectedCategoryId}
              onSelect={onSelect}
              draft={draft}
              expandedIds={expandedIds}
              onToggleExpanded={onToggleExpanded}
              onStartCreate={onStartCreate}
              onAddStock={onAddStock}
              onStartRename={onStartRename}
              onDelete={onDelete}
              onDraftValueChange={onDraftValueChange}
              onCancelDraft={onCancelDraft}
              onSubmitDraft={onSubmitDraft}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function ClassificationTree({
  selectedCategoryId,
  onSelect,
  onClearSelection,
  onAddStock,
  onChanged,
  refreshKey,
}: ClassificationTreeProps) {
  const [categories, setCategories] = useState<CategoryNode[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [draft, setDraft] = useState<DraftState | null>(null);

  const loadCategories = useCallback(async (shouldApply: () => boolean = () => true) => {
    setIsLoading(true);
    const response = await fetch("/api/categories");
    const data = (await response.json()) as { categories: CategoryNode[] };
    if (!shouldApply()) return;
    setCategories(data.categories);
    setExpandedIds((current) => new Set([...current, ...collectDefaultExpandedIds(data.categories)]));
    setIsLoading(false);
  }, []);

  useEffect(() => {
    let isMounted = true;
    loadCategories(() => isMounted).catch(() => {
      if (isMounted) setIsLoading(false);
    });

    return () => {
      isMounted = false;
    };
  }, [loadCategories, refreshKey]);

  useEffect(() => {
    if (selectedCategoryId !== null) return;
    const defaultLeaf = findDefaultLeaf(categories);
    if (defaultLeaf) onSelect(defaultLeaf.id);
  }, [categories, onSelect, selectedCategoryId]);

  const nodeCount = useMemo(() => {
    const count = (nodes: CategoryNode[]): number => nodes.reduce((total, node) => total + 1 + count(node.children), 0);
    return count(categories);
  }, [categories]);

  const handleToggleExpanded = (categoryId: number) => {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(categoryId)) {
        next.delete(categoryId);
      } else {
        next.add(categoryId);
      }
      return next;
    });
  };

  const handleStartCreate = (parentId: number | null) => {
    if (parentId !== null) {
      setExpandedIds((current) => new Set([...current, parentId]));
    }
    setDraft({ mode: "create", parentId, value: "", error: "" });
  };

  const handleStartRename = (node: CategoryNode) => {
    setDraft({ mode: "rename", categoryId: node.id, value: node.name, error: "" });
  };

  const handleDraftValueChange = (value: string) => {
    setDraft((current) => (current ? { ...current, value, error: "" } : current));
  };

  const setDraftError = (message: string) => {
    setDraft((current) => (current ? { ...current, error: message } : current));
  };

  const handleSubmitDraft = async () => {
    if (!draft) return;
    const name = draft.value.trim();
    if (!name) {
      setDraftError("分类名称不能为空");
      return;
    }

    try {
      if (draft.mode === "create") {
        const data = await requestJson<{ category: CategoryNode }>("/api/categories", {
          method: "POST",
          body: JSON.stringify({ name, parentId: draft.parentId }),
        });
        setDraft(null);
        setExpandedIds((current) => (draft.parentId === null ? current : new Set([...current, draft.parentId])));
        await loadCategories();
        onSelect(data.category.id);
        onChanged();
        return;
      }

      await requestJson<{ category: CategoryNode }>(`/api/categories/${draft.categoryId}`, {
        method: "PATCH",
        body: JSON.stringify({ name }),
      });
      setDraft(null);
      await loadCategories();
      onChanged();
    } catch (error) {
      setDraftError(error instanceof Error ? error.message : "分类操作失败");
    }
  };

  const handleDelete = async (node: CategoryNode) => {
    const confirmed = window.confirm(`删除「${node.name}」及其所有子分组？关联到这些分类的公司关系也会删除。`);
    if (!confirmed) return;

    try {
      await requestJson<{ deletedCount: number }>(`/api/categories/${node.id}`, { method: "DELETE" });
      setDraft(null);
      onClearSelection();
      await loadCategories();
      onChanged();
    } catch (error) {
      setDraft({
        mode: "rename",
        categoryId: node.id,
        value: node.name,
        error: error instanceof Error ? error.message : "删除分类失败",
      });
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="text-xs font-semibold uppercase text-muted">行业 / 产业链</div>
          <h2 className="mt-1 text-lg font-semibold">产业链分类树</h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded border border-line px-2 py-1 text-xs text-muted">{nodeCount} 节点</span>
          <IconButton label="新增顶层分类" onClick={() => handleStartCreate(null)}>
            <Plus className="h-3.5 w-3.5" />
          </IconButton>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto rounded border border-line bg-panel p-2">
        {isLoading ? (
          <div className="p-3 text-sm text-muted">加载分类中...</div>
        ) : (
          <div className="grid gap-1">
            {draft?.mode === "create" && draft.parentId === null ? (
              <DraftEditor
                value={draft.value}
                error={draft.error}
                placeholder="新分组名称"
                onValueChange={handleDraftValueChange}
                onCancel={() => setDraft(null)}
                onSubmit={handleSubmitDraft}
              />
            ) : null}
            {categories.map((category) => (
              <TreeNode
                key={category.id}
                node={category}
                selectedCategoryId={selectedCategoryId}
                onSelect={onSelect}
                draft={draft}
                expandedIds={expandedIds}
                onToggleExpanded={handleToggleExpanded}
                onStartCreate={handleStartCreate}
                onAddStock={onAddStock}
                onStartRename={handleStartRename}
                onDelete={handleDelete}
                onDraftValueChange={handleDraftValueChange}
                onCancelDraft={() => setDraft(null)}
                onSubmitDraft={handleSubmitDraft}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
