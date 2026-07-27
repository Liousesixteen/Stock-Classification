"use client";

import { Search } from "lucide-react";

type WorkbenchToolbarProps = {
  searchQuery: string;
  onSearchChange: (value: string) => void;
};

export function WorkbenchToolbar({ searchQuery, onSearchChange }: WorkbenchToolbarProps) {
  return (
    <div className="future-panel flex h-12 items-center p-1.5">
      <label className="flex h-full min-w-0 flex-1 items-center gap-2 rounded-md border border-line bg-white/65 px-3 shadow-inner shadow-slate-200/50">
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
