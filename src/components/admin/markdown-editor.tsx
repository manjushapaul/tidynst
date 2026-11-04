"use client";

import { type KeyboardEvent, useCallback, useEffect, useState } from "react";
import { type EditableImage, MarkdownContent } from "@/components/content/markdown-content";
import {
  ARTICLE_IMAGE_DEFAULTS,
  type ArticleImageStyle,
  resolveImageStyle,
  withImageStyle,
} from "@/lib/content/article-image-style";
import { insertSnippet, removeImageAt, setImageSrcAt } from "@/lib/content/body-images";
import {
  continueList,
  type FormatEdit,
  formatLines,
  insertLink,
  insertLinkTo,
  wrapSelection,
} from "@/lib/content/markdown-format";
import { countWords, readingMinutes } from "@/lib/content/markdown";
import type { LinkTargets } from "@/lib/content/link-targets";
import { cn } from "@/lib/cn";
import { ImageStyleDialog } from "./article-image-style-editor";
import { inputClasses } from "./form";
import { LinkPicker } from "./link-picker";

export function MarkdownEditor({
  id,
  name = "body",
  value,
  onChange,
  describedBy,
  invalid,
  insertRef,
  layoutHint,
  imageStyles,
  linkTargets,
}: {
  id: string;
  name?: string;
  value: string;
  onChange: (value: string) => void;
  describedBy?: string;
  invalid?: boolean;
  insertRef?: { current: ((snippet: string, options?: { block?: boolean }) => void) | null };
  /** Overrides the default body layout tip under the textarea. Pass `null` to hide it. */
  layoutHint?: string | null;
  /**
   * Adds an Edit button to each image in the preview for choosing how it is shown. The value is
   * the article's settings, used by images that have none of their own.
   */
  imageStyles?: ArticleImageStyle;
  /** Pages the Link button can choose from. Without them it inserts a link to type the address of. */
  linkTargets?: LinkTargets;
}) {
  const [pane, setPane] = useState<"write" | "preview">("write");
  const [linking, setLinking] = useState<{ start: number; end: number } | null>(null);
  const [editing, setEditing] = useState<EditableImage | null>(null);
  const articleStyle = imageStyles ?? ARTICLE_IMAGE_DEFAULTS;
  const words = countWords(value);
  const minutes = readingMinutes(value);

  const insert = useCallback(
    (snippet: string, options?: { block?: boolean }) => {
      const area = document.getElementById(id);
      if (!(area instanceof HTMLTextAreaElement)) {
        onChange(insertSnippet(value, value.length, value.length, snippet, options?.block).value);
        return;
      }
      const { value: next, cursor } = insertSnippet(
        value,
        area.selectionStart,
        area.selectionEnd,
        snippet,
        options?.block,
      );
      onChange(next);
      requestAnimationFrame(() => {
        area.focus();
        area.setSelectionRange(cursor, cursor);
      });
    },
    [id, onChange, value],
  );

  useEffect(() => {
    if (!insertRef) return;
    insertRef.current = insert;
  }, [insert, insertRef]);

  function apply(format: (value: string, start: number, end: number) => FormatEdit | null) {
    const area = document.getElementById(id);
    if (!(area instanceof HTMLTextAreaElement)) return false;
    const edit = format(value, area.selectionStart, area.selectionEnd);
    if (!edit) return false;
    onChange(edit.value);
    requestAnimationFrame(() => {
      area.focus();
      area.setSelectionRange(edit.selectionStart, edit.selectionEnd);
    });
    return true;
  }

  function openLinkPicker() {
    const area = document.getElementById(id);
    if (!(area instanceof HTMLTextAreaElement)) return;
    setLinking({ start: area.selectionStart, end: area.selectionEnd });
  }

  function insertChosenLink(url: string, text: string, fallback: string) {
    if (!linking) return;
    const edit = insertLinkTo(value, linking.start, linking.end, url, text, fallback);
    setLinking(null);
    onChange(edit.value);
    requestAnimationFrame(() => {
      const area = document.getElementById(id);
      if (!(area instanceof HTMLTextAreaElement)) return;
      area.focus();
      area.setSelectionRange(edit.selectionStart, edit.selectionEnd);
    });
  }

  const tools: { label: string; title: string; className?: string; run: Parameters<typeof apply>[0] }[] = [
    { label: "Heading", title: "Section heading (##)", run: (v, s, e) => formatLines(v, s, e, "h2") },
    { label: "Subheading", title: "Subheading (###)", run: (v, s, e) => formatLines(v, s, e, "h3") },
    {
      label: "Bold",
      title: "Bold (Ctrl or ⌘ + B)",
      className: "font-bold",
      run: (v, s, e) => wrapSelection(v, s, e, "**", "bold text"),
    },
    {
      label: "Italic",
      title: "Italic (Ctrl or ⌘ + I)",
      className: "italic",
      run: (v, s, e) => wrapSelection(v, s, e, "_", "italic text"),
    },
    { label: "• Bulleted list", title: "Bulleted list", run: (v, s, e) => formatLines(v, s, e, "bullet") },
    { label: "1. Numbered list", title: "Numbered list", run: (v, s, e) => formatLines(v, s, e, "number") },
    { label: "Tip", title: "Practical tip box", run: (v, s, e) => formatLines(v, s, e, "tip") },
    { label: "Link", title: "Link", run: insertLink },
  ];

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.nativeEvent.isComposing) return;
    const shortcut = event.metaKey || event.ctrlKey;
    if (shortcut && !event.shiftKey && !event.altKey && (event.key === "b" || event.key === "i")) {
      event.preventDefault();
      apply((v, s, e) =>
        event.key === "b"
          ? wrapSelection(v, s, e, "**", "bold text")
          : wrapSelection(v, s, e, "_", "italic text"),
      );
      return;
    }
    if (event.key === "Enter" && !event.shiftKey && !shortcut && !event.altKey) {
      const area = event.currentTarget;
      if (area.selectionStart !== area.selectionEnd) return;
      if (apply((v, s) => continueList(v, s))) event.preventDefault();
    }
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex rounded-full bg-sand p-1 lg:hidden" role="tablist" aria-label="Editor panes">
          {(["write", "preview"] as const).map((item) => (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={pane === item}
              className={cn(
                "rounded-full px-3 py-1.5 text-sm font-medium",
                pane === item ? "bg-surface text-ink shadow-sm" : "text-muted",
              )}
              onClick={() => setPane(item)}
            >
              {item === "write" ? "Write" : "Preview"}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted">
          {words} {words === 1 ? "word" : "words"} · {minutes} min read
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className={cn(pane === "write" ? "block" : "hidden", "lg:block")}>
          <label htmlFor={id} className="sr-only">
            Article body in Markdown
          </label>
          <div className="relative">
            <div
              role="toolbar"
              aria-label="Formatting"
              aria-controls={id}
              className="mb-2 flex flex-wrap gap-1 rounded-xl border border-line bg-sand p-1"
            >
              {tools.map((tool) => {
                const picksLink = tool.run === insertLink && linkTargets;
                return (
                  <button
                    key={tool.label}
                    type="button"
                    title={picksLink ? "Link to a subcategory, article or website" : tool.title}
                    aria-label={picksLink ? "Link to a subcategory, article or website" : tool.title}
                    aria-haspopup={picksLink ? "dialog" : undefined}
                    aria-expanded={picksLink ? linking !== null : undefined}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => (picksLink ? openLinkPicker() : apply(tool.run))}
                    className={cn(
                      "rounded-lg px-2.5 py-1 text-xs text-ink hover:bg-surface focus-visible:bg-surface",
                      picksLink && linking && "bg-surface",
                      tool.className,
                    )}
                  >
                    {tool.label}
                  </button>
                );
              })}
            </div>
            {linking && linkTargets ? (
              <LinkPicker
                targets={linkTargets}
                selectedText={value.slice(linking.start, linking.end)}
                onInsert={insertChosenLink}
                onClose={() => {
                  setLinking(null);
                  document.getElementById(id)?.focus();
                }}
              />
            ) : null}
          </div>
          <textarea
            id={id}
            name={name}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={onKeyDown}
            spellCheck
            aria-describedby={
              [describedBy, layoutHint === null ? undefined : `${id}-layout-hint`]
                .filter(Boolean)
                .join(" ") || undefined
            }
            aria-invalid={invalid || undefined}
            className={cn(inputClasses, "min-h-80 font-mono text-sm leading-relaxed")}
          />
          {layoutHint === null ? null : (
            <p id={`${id}-layout-hint`} className="mt-2 text-xs text-muted">
              {layoutHint ??
                "On the article page, a section (starting with a Heading) that contains an image shows that image beside its text, alternating left and right. Press Enter in a list to add the next item; press Enter on an empty item to end the list."}
            </p>
          )}
        </div>
        <div className={cn(pane === "preview" ? "block" : "hidden", "lg:block")}>
          <div
            className="min-h-80 overflow-auto rounded-xl border border-line bg-canvas p-4"
            aria-label="Preview"
          >
            {value.trim() ? (
              <MarkdownContent
                markdown={value}
                className="prose-tn max-w-none text-base"
                onRemoveImage={({ start, end }) => {
                  if (
                    window.confirm(
                      "Do you want to delete this image from the article?\n\nIt stays in the media library, so you can add it again later.",
                    )
                  ) {
                    onChange(removeImageAt(value, start, end));
                  }
                }}
                onEditImage={imageStyles ? setEditing : undefined}
              />
            ) : (
              <p className="text-sm text-muted">The preview appears here as you write.</p>
            )}
          </div>
        </div>
      </div>
      {imageStyles ? (
        <ImageStyleDialog
          image={editing}
          initial={resolveImageStyle(editing?.style ?? null, articleStyle)}
          onClose={() => setEditing(null)}
          onSave={(style) => {
            if (!editing) return;
            onChange(
              setImageSrcAt(
                value,
                editing.start,
                editing.end,
                withImageStyle(editing.src, style, articleStyle),
              ),
            );
          }}
        />
      ) : null}
    </div>
  );
}
