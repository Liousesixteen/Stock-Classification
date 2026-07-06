"use client";

import { ChevronRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { CategoryNode } from "@/lib/domain/types";

type ClassificationTreeProps = {
  selectedCategoryId: number | null;
  onSelect: (categoryId: number) => void;
  refreshKey: number;
};

function findDefaultLeaf(nodes: CategoryNode[]): CategoryNode | undefined {
  for (const node of nodes) {
    if (node.name === "ArF 干法/浸没式光刻胶") return node;
    const child = findDefaultLeaf(node.children);
    if (child) return child;
  }
  return nodes[0];
}

function TreeNode({
  node,
  selectedCategoryId,
  onSelect,
}: {
  node: CategoryNode;
  selectedCategoryId: number | null;
  onSelect: (categoryId: number) => void;
}) {
  const hasChildren = node.children.length > 0;
  const isSelected = node.id === selectedCategoryId;

  if (!hasChildren) {
    return (
      <button
        type="button"
        onClick={() => onSelect(node.id)}
        className={`w-full rounded-md px-2 py-1.5 text-left text-[13px] transition ${
          isSelected ? "bg-[#dff0e8] font-semibold text-[#173326]" : "text-slate-700 hover:bg-slate-50"
        }`}
      >
        {node.name}
      </button>
    );
  }

  return (
    <details open={node.level <= 2} className="group">
      <summary
        onClick={() => onSelect(node.id)}
        className={`flex cursor-pointer list-none items-center gap-1 rounded-md px-2 py-1.5 text-[13px] font-semibold transition ${
          isSelected ? "bg-[#dff0e8] text-[#173326]" : "hover:bg-slate-50"
        }`}
      >
        <ChevronRight className="h-3.5 w-3.5 shrink-0 transition group-open:rotate-90" />
        <span className="min-w-0 flex-1 truncate text-left">{node.name}</span>
        <span className="text-[11px] font-normal text-muted">{node.children.length}</span>
      </summary>
      <div className="ml-3 mt-1 grid gap-1 border-l border-slate-200 pl-2">
        {node.children.map((child) => (
          <TreeNode key={child.id} node={child} selectedCategoryId={selectedCategoryId} onSelect={onSelect} />
        ))}
      </div>
    </details>
  );
}

export function ClassificationTree({ selectedCategoryId, onSelect, refreshKey }: ClassificationTreeProps) {
  const [categories, setCategories] = useState<CategoryNode[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    fetch("/api/categories")
      .then((response) => response.json() as Promise<{ categories: CategoryNode[] }>)
      .then((data) => {
        if (!isMounted) return;
        setCategories(data.categories);
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [refreshKey]);

  useEffect(() => {
    if (selectedCategoryId !== null) return;
    const defaultLeaf = findDefaultLeaf(categories);
    if (defaultLeaf) onSelect(defaultLeaf.id);
  }, [categories, onSelect, selectedCategoryId]);

  const nodeCount = useMemo(() => {
    const count = (nodes: CategoryNode[]): number => nodes.reduce((total, node) => total + 1 + count(node.children), 0);
    return count(categories);
  }, [categories]);

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="text-xs font-semibold uppercase text-muted">行业 / 产业链</div>
          <h2 className="mt-1 text-lg font-semibold">半导体细分树</h2>
        </div>
        <span className="rounded border border-line px-2 py-1 text-xs text-muted">{nodeCount} 节点</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto rounded border border-line bg-panel p-2">
        {isLoading ? (
          <div className="p-3 text-sm text-muted">加载分类中...</div>
        ) : (
          <div className="grid gap-1">
            {categories.map((category) => (
              <TreeNode key={category.id} node={category} selectedCategoryId={selectedCategoryId} onSelect={onSelect} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
