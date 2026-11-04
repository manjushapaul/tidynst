"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { LinkTargets } from "@/lib/content/link-targets";
import { cn } from "@/lib/cn";
import { inputClasses } from "./form";

type Choice = { label: string; path: string; detail?: string; indent?: boolean };

const matches = (query: string, ...texts: (string | null | undefined)[]) =>
  !query || texts.some((text) => text?.toLowerCase().includes(query));

function Section({
  title,
  choices,
  onPick,
}: {
  title: string;
  choices: Choice[];
  onPick: (choice: Choice) => void;
}) {
  if (!choices.length) return null;
  return (
    <section>
      <h3 className="sticky top-0 z-10 bg-surface px-3 pt-3 pb-1.5 font-sans text-[calc(0.7rem*var(--text-scale))] font-semibold tracking-[0.12em] text-oak uppercase">
        {title}
      </h3>
      <ul>
        {choices.map((choice) => (
          <li key={`${choice.path}:${choice.label}`}>
            <button
              type="button"
              onClick={() => onPick(choice)}
              className={cn(
                "flex w-full items-baseline justify-between gap-3 rounded-lg px-3 py-1.5 text-left text-sm hover:bg-sand focus-visible:bg-sand",
                choice.indent && "pl-7 text-muted hover:text-ink",
              )}
            >
              <span className={cn(!choice.indent && "font-medium text-ink")}>{choice.label}</span>
              <span className="shrink-0 truncate text-xs text-muted">{choice.detail ?? choice.path}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Chooses where a link points: a subcategory, topic, article or category on this site, or a web
 * address. `selectedText` becomes the link text unless the editor types another.
 */
export function LinkPicker({
  targets,
  selectedText,
  onInsert,
  onClose,
}: {
  targets: LinkTargets;
  selectedText: string;
  onInsert: (url: string, text: string, fallback: string) => void;
  onClose: () => void;
}) {
  const id = useId();
  const panel = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [text, setText] = useState(selectedText);
  const [url, setUrl] = useState("https://");
  const q = query.trim().toLowerCase();

  useEffect(() => {
    function onPointer(event: PointerEvent) {
      if (panel.current && !panel.current.contains(event.target as Node)) onClose();
    }
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [onClose]);

  const subcategories = useMemo(() => {
    const choices: Choice[] = [];
    for (const group of targets.subcategories) {
      const topics = group.topics.filter((topic) => matches(q, topic.name, group.name, group.categoryName));
      if (!matches(q, group.name, group.categoryName) && !topics.length) continue;
      choices.push({ label: group.name, path: group.path, detail: group.categoryName });
      for (const topic of topics)
        choices.push({ label: topic.name, path: topic.path, detail: "Topic", indent: true });
    }
    return choices;
  }, [q, targets.subcategories]);

  const articles = useMemo(
    () =>
      targets.articles
        .filter((article) => matches(q, article.title, article.categoryName))
        .map((article) => ({
          label: article.title,
          path: article.path,
          detail: article.categoryName ?? "Article",
        })),
    [q, targets.articles],
  );

  const categories = useMemo(
    () =>
      targets.categories
        .filter((category) => matches(q, category.name))
        .map((category) => ({ label: category.name, path: category.path, detail: "Category page" })),
    [q, targets.categories],
  );

  const webAddress = /^https:\/\/[^\s/]+\.[^\s]+$/.test(url.trim());
  const nothing = !subcategories.length && !articles.length && !categories.length;

  return (
    <div
      ref={panel}
      role="dialog"
      aria-labelledby={`${id}-title`}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onClose();
        }
      }}
      className="absolute top-full left-0 z-30 mt-1 w-full max-w-xl rounded-2xl border border-line bg-surface p-4 shadow-[0_18px_40px_-18px_rgb(74_52_30/0.45)]"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id={`${id}-title`} className="font-sans text-sm font-semibold tracking-normal">
          Insert a link
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="rounded-full px-2 text-lg leading-none text-muted hover:text-ink"
        >
          ×
        </button>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor={`${id}-text`} className="block text-xs font-medium">
            Link text
          </label>
          <input
            id={`${id}-text`}
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.preventDefault();
            }}
            placeholder="Uses the page name when empty"
            className={cn(inputClasses, "py-2 text-sm")}
          />
        </div>
        <div className="space-y-1">
          <label htmlFor={`${id}-search`} className="block text-xs font-medium">
            Find a page
          </label>
          <input
            id={`${id}-search`}
            type="search"
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              const first = subcategories[0] ?? articles[0] ?? categories[0];
              if (first) onInsert(first.path, text, first.label);
            }}
            placeholder="Subcategory, topic or article"
            className={cn(inputClasses, "py-2 text-sm")}
          />
        </div>
      </div>

      <div className="mt-3 max-h-72 overflow-y-auto rounded-xl border border-line">
        <Section
          title="Subcategories"
          choices={subcategories}
          onPick={(choice) => onInsert(choice.path, text, choice.label)}
        />
        <Section
          title="Articles"
          choices={articles}
          onPick={(choice) => onInsert(choice.path, text, choice.label)}
        />
        <Section
          title="Categories"
          choices={categories}
          onPick={(choice) => onInsert(choice.path, text, choice.label)}
        />
        {nothing ? (
          <p className="px-3 py-6 text-center text-sm text-muted">No pages match “{query}”.</p>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1 space-y-1">
          <label htmlFor={`${id}-url`} className="block text-xs font-medium">
            Or link to another website
          </label>
          <input
            id={`${id}-url`}
            type="url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            onKeyDown={(event) => {
              // The picker sits inside the article form; Enter must not submit it.
              if (event.key !== "Enter") return;
              event.preventDefault();
              if (webAddress) onInsert(url.trim(), text, url.trim());
            }}
            className={cn(inputClasses, "py-2 text-sm")}
          />
        </div>
        <button
          type="button"
          disabled={!webAddress}
          onClick={() => onInsert(url.trim(), text, url.trim())}
          className="rounded-full border border-line-strong bg-surface px-4 py-2 text-sm font-medium text-oak-deep hover:bg-sand disabled:opacity-50"
        >
          Insert
        </button>
      </div>
    </div>
  );
}
