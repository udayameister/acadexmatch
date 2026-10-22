'use client';

import React, { useEffect, useState } from 'react';

export interface Selection {
  selected: Set<string>;
  ids: string[];
  count: number;
  allOn: boolean;
  has: (id: string) => boolean;
  toggle: (id: string) => void;
  toggleAll: () => void;
  clear: () => void;
}

/** Multi-select state for a list; selections that leave the list (filtered out or deleted) are dropped. */
export function useSelection(visibleIds: string[]): Selection {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const key = visibleIds.join('|');
  useEffect(() => {
    setSelected(prev => {
      const next = new Set([...prev].filter(id => visibleIds.includes(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const allOn = visibleIds.length > 0 && visibleIds.every(id => selected.has(id));
  return {
    selected,
    ids: [...selected],
    count: selected.size,
    allOn,
    has: id => selected.has(id),
    toggle: id => setSelected(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; }),
    toggleAll: () => setSelected(allOn ? new Set() : new Set(visibleIds)),
    clear: () => setSelected(new Set()),
  };
}

export function RowCheck({ sel, id, label }: { sel: Selection; id: string; label: string }) {
  return (
    <td className="pl-4 pr-1 py-3 w-8">
      <input type="checkbox" className="w-4 h-4 accent-brand-900 cursor-pointer" aria-label={`Select ${label}`} checked={sel.has(id)} onChange={() => sel.toggle(id)} />
    </td>
  );
}

/** Bar of actions for the selected rows; stays in view while scrolling. */
export function BulkBar({ sel, noun, children }: { sel: Selection; noun: string; children: React.ReactNode }) {
  if (!sel.count) return null;
  return (
    <div className="sticky top-20 z-20 flex flex-wrap items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-950 text-white shadow-lg" role="region" aria-label="Bulk actions">
      <span className="text-sm font-semibold mr-1">{sel.count} {noun}{sel.count === 1 ? '' : 's'} selected</span>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
      <button className="ml-auto text-xs text-brand-100 hover:text-white underline" onClick={sel.clear}>Clear selection</button>
    </div>
  );
}

