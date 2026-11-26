"use client";

import { useState } from "react";
import { CmsIcon } from "@/components/site/cms-icon";
import { cn } from "@/lib/cn";
import { CMS_ICONS, type CmsIconKey } from "@/lib/content/icons";

export function IconPicker({
  name = "icon",
  defaultValue = null,
  label = "Icon",
  hint,
}: {
  name?: string;
  defaultValue?: CmsIconKey | null;
  label?: string;
  hint?: string;
}) {
  const [selected, setSelected] = useState<CmsIconKey | "">(defaultValue ?? "");

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="block text-sm font-medium text-ink">{label}</span>
        {selected ? (
          <button
            type="button"
            onClick={() => setSelected("")}
            className="text-xs font-medium text-muted hover:text-ink"
          >
            Clear
          </button>
        ) : null}
      </div>
      <input type="hidden" name={name} value={selected} />
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={label}>
        {CMS_ICONS.map((item) => {
          const active = selected === item.key;
          return (
            <button
              key={item.key}
              type="button"
              role="radio"
              aria-checked={active}
              title={item.label}
              onClick={() => setSelected(active ? "" : item.key)}
              className={cn(
                "inline-flex size-9 items-center justify-center rounded-xl border transition-colors",
                active
                  ? "border-oak bg-oak/15 text-oak-deep"
                  : "border-line bg-canvas/60 text-muted hover:border-oak/40 hover:text-ink",
              )}
            >
              <CmsIcon icon={item.key} className="size-4" />
            </button>
          );
        })}
      </div>
      {hint ? <p className="text-xs text-muted">{hint}</p> : null}
    </div>
  );
}
