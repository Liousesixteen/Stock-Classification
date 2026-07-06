"use client";

import { Search } from "lucide-react";

type WorkbenchToolbarProps = {
  searchQuery: string;
  onSearchChange: (value: string) => void;
};

export function WorkbenchToolbar({ searchQuery, onSearchChange }: WorkbenchToolbarProps) {
  return (
    <div className="rounded-lg border border-line bg-white p-3">
      <label className="flex items-center gap-2 rounded-md border border-line bg-panel px-3 py-2">
        <Search className="h-4 w-4 text-muted" />
        <input
          value={searchQuery}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="搜索：ArF、12英寸硅片、CMP抛光垫、电子特气"
          className="h-8 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
        />
      </label>
    </div>
  );
}
