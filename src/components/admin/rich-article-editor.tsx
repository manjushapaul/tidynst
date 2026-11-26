"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import { Markdown } from "@tiptap/markdown";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  createArticleImageBlockExtension,
  type ArticleBlockImage,
  type ArticleBlockLayout,
  type ArticleImageBlockAttrs,
  type ArticleBlockUploadRequest,
} from "./article-image-block";
import type { PickerAsset, UploadProgress } from "./upload-image";
import { ARTICLE_IMAGE_SIZE_HINT, IMAGE_ACCEPT, uploadImage } from "./upload-image";
import type { LinkTargets } from "@/lib/content/link-targets";
import { LinkPicker } from "./link-picker";

type PendingFile = { key: string; file: File; alt: string; percent: number | null; error: string | null };

function altFromFilename(name: string) {
  return name
    .replace(/\.[^.]+$/, "")
    .replace(/[-_]+/g, " ")
    .trim();
}

export function RichArticleEditor({
  id = "guide-body",
  value,
  onChange,
  csrf,
  onUploaded,
  linkTargets,
  invalid,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  csrf: string;
  onUploaded: (asset: PickerAsset) => void;
  linkTargets?: LinkTargets;
  invalid?: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const replacingRef = useRef<ArticleBlockUploadRequest | null>(null);
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [layout, setLayout] = useState<ArticleBlockLayout>("side-by-side");
  const [side, setSide] = useState<"left" | "right">("left");
  const [linking, setLinking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3, 4] }, link: false }),
      Link.configure({ openOnClick: false, defaultProtocol: "https" }),
      Image.configure({ inline: true, allowBase64: false }),
      Markdown,
      createArticleImageBlockExtension(),
    ],
    content: value,
    contentType: "markdown",
    onUpdate: ({ editor: current }) => onChange(current.getMarkdown()),
    editorProps: {
      attributes: { class: "min-h-80 outline-none prose-tn max-w-none", "aria-label": "Article body" },
    },
  });

  // A server action can return a recovered draft after a validation error. Replace the document
  // only when the parent value actually changes independently of this editor.
  const lastValue = useRef(value);
  useEffect(() => {
    if (!editor || value === lastValue.current) return;
    lastValue.current = value;
    if (editor.getMarkdown() !== value)
      editor.commands.setContent(value, { contentType: "markdown", emitUpdate: false });
  }, [editor, value]);
  useEffect(() => {
    lastValue.current = value;
  }, [value]);

  const chooseFiles = useCallback((request: ArticleBlockUploadRequest | null = null) => {
    replacingRef.current = request;
    fileRef.current?.click();
  }, []);

  useEffect(() => {
    const onReplace = (event: Event) => chooseFiles((event as CustomEvent<ArticleBlockUploadRequest>).detail);
    window.addEventListener("tidynest:replace-article-image", onReplace);
    return () => window.removeEventListener("tidynest:replace-article-image", onReplace);
  }, [chooseFiles]);

  useEffect(() => {
    if (!editor) return;
    const onTransaction = ({ transaction }: { transaction: typeof editor.state.tr }) => {
      const request = replacingRef.current;
      if (request && transaction.docChanged) {
        replacingRef.current = { ...request, position: transaction.mapping.map(request.position) };
      }
    };
    editor.on("transaction", onTransaction);
    return () => {
      editor.off("transaction", onTransaction);
    };
  }, [editor]);

  function filesChosen(input: FileList | null) {
    const request = replacingRef.current;
    replacingRef.current = null;
    setFiles(
      Array.from(input ?? []).map((file, index) => ({
        key: `${Date.now()}-${index}-${file.name}`,
        file,
        alt: altFromFilename(file.name),
        percent: null,
        error: null,
      })),
    );
    if (request) replacingRef.current = request;
    if (fileRef.current) fileRef.current.value = "";
  }

  async function uploadSelected() {
    if (!files.length || !editor) return;
    setBusy(true);
    setStatus("");
    const succeeded: { asset: PickerAsset; alt: string }[] = [];
    const pending: PendingFile[] = [];
    for (const [index, item] of files.entries()) {
      setFiles((current) =>
        current.map((file) => (file.key === item.key ? { ...file, percent: 0, error: null } : file)),
      );
      const result = await uploadImage(csrf, item.file, item.alt, (progress: UploadProgress) => {
        setFiles((current) =>
          current.map((file) => (file.key === item.key ? { ...file, percent: progress.percent } : file)),
        );
      });
      if (typeof result === "string") pending.push({ ...item, error: result, percent: null });
      else {
        onUploaded(result);
        succeeded.push({ asset: result, alt: item.alt });
      }
      setStatus(`Uploaded ${index + 1} of ${files.length} images`);
    }
    const request = replacingRef.current;
    if (succeeded.length) {
      const images: ArticleBlockImage[] = succeeded.map(({ asset, alt }) => ({
        src: asset.src,
        alt,
        caption: "",
      }));
      if (request) {
        const target = editor.state.doc.nodeAt(request.position);
        if (target?.type.name === "articleImageBlock") {
          const attrs = target.attrs as ArticleImageBlockAttrs;
          const nextImages = [...attrs.images];
          if (request.imageIndex === null) nextImages.push(...images);
          else
            nextImages.splice(
              request.imageIndex,
              1,
              ...(attrs.layout === "full" || attrs.layout === "with-text" ? images.slice(0, 1) : images),
            );
          editor.view.dispatch(
            editor.state.tr.setNodeMarkup(request.position, undefined, { ...attrs, images: nextImages }),
          );
        }
      } else {
        const singleImageLayout = layout === "full" || layout === "with-text";
        const blocks = singleImageLayout
          ? images.map((image) => ({
              type: "articleImageBlock",
              attrs: { layout, side, text: "", images: [image] },
            }))
          : [{ type: "articleImageBlock", attrs: { layout, side, text: "", images } }];
        editor.chain().focus().insertContent(blocks).run();
      }
      replacingRef.current = null;
    }
    setFiles(pending);
    setBusy(false);
    if (!pending.length) setStatus(succeeded.length ? "Images added to the article." : "");
  }

  function applyLink(url: string, text: string) {
    if (!editor) return;
    const safe =
      /^https:\/\//i.test(url) || url.startsWith("/") || url.startsWith("#") ? url : `https://${url}`;
    const { from, to } = editor.state.selection;
    editor
      .chain()
      .focus()
      .insertContentAt({ from, to }, { type: "text", text, marks: [{ type: "link", attrs: { href: safe } }] })
      .run();
    setLinking(false);
  }

  if (!editor)
    return (
      <div className="min-h-80 rounded-xl border border-line p-4" aria-busy="true">
        Loading editor…
      </div>
    );

  const action = (label: string, run: () => void, active = false) => (
    <button
      type="button"
      onMouseDown={(event) => event.preventDefault()}
      onClick={run}
      aria-pressed={active}
      className={`rounded-lg px-2.5 py-1.5 text-xs font-medium hover:bg-white ${active ? "bg-white text-oak-deep shadow-sm" : "text-ink"}`}
    >
      {label}
    </button>
  );

  return (
    <div>
      <div
        className="mb-2 flex flex-wrap items-center gap-1 rounded-xl border border-line bg-sand p-1"
        role="toolbar"
        aria-label="Article formatting"
      >
        {action("Paragraph", () => editor.chain().focus().setParagraph().run())}
        {action(
          "Heading",
          () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
          editor.isActive("heading", { level: 2 }),
        )}
        {action(
          "Subheading",
          () => editor.chain().focus().toggleHeading({ level: 3 }).run(),
          editor.isActive("heading", { level: 3 }),
        )}
        <span aria-hidden="true" className="mx-1 h-5 border-l border-line" />
        {action("Bold", () => editor.chain().focus().toggleBold().run(), editor.isActive("bold"))}
        {action("Italic", () => editor.chain().focus().toggleItalic().run(), editor.isActive("italic"))}
        {action("Link", () => setLinking((current) => !current), editor.isActive("link"))}
        {action(
          "• List",
          () => editor.chain().focus().toggleBulletList().run(),
          editor.isActive("bulletList"),
        )}
        {action(
          "1. List",
          () => editor.chain().focus().toggleOrderedList().run(),
          editor.isActive("orderedList"),
        )}
        <span aria-hidden="true" className="mx-1 h-5 border-l border-line" />
        <label className="text-xs text-muted">
          Layout{" "}
          <select
            value={layout}
            onChange={(event) => setLayout(event.target.value as ArticleBlockLayout)}
            className="rounded-md border border-line bg-white px-2 py-1 text-ink"
          >
            <option value="full">Full width</option>
            <option value="side-by-side">Side by side</option>
            <option value="gallery">Gallery</option>
            <option value="with-text">Image + text</option>
          </select>
        </label>
        {layout === "with-text" ? (
          <label className="text-xs text-muted">
            Image{" "}
            <select
              value={side}
              onChange={(event) => setSide(event.target.value as "left" | "right")}
              className="rounded-md border border-line bg-white px-2 py-1 text-ink"
            >
              <option value="left">Left</option>
              <option value="right">Right</option>
            </select>
          </label>
        ) : null}
        <button
          aria-describedby={`${id}-image-hint`}
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => chooseFiles()}
          className="rounded-lg bg-oak px-3 py-1.5 text-xs font-semibold text-white hover:bg-oak-deep"
        >
          Insert images
        </button>
      </div>
      <p id={`${id}-image-hint`} className="mb-2 text-xs text-muted">
        {ARTICLE_IMAGE_SIZE_HINT}
      </p>
      {linking ? (
        linkTargets ? (
          <LinkPicker
            targets={linkTargets}
            selectedText={editor.state.doc.textBetween(
              editor.state.selection.from,
              editor.state.selection.to,
            )}
            onInsert={(url, text) => applyLink(url, text)}
            onClose={() => setLinking(false)}
          />
        ) : (
          <div className="mb-2 flex gap-2">
            <input
              id={`${id}-link`}
              className="min-w-0 flex-1 rounded-lg border border-line px-3 py-2 text-sm"
              placeholder="https://example.com"
            />
            <button
              type="button"
              onClick={() =>
                applyLink(
                  (document.getElementById(`${id}-link`) as HTMLInputElement).value,
                  editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to) ||
                    (document.getElementById(`${id}-link`) as HTMLInputElement).value,
                )
              }
              className="rounded-full bg-oak px-3 text-sm text-white"
            >
              Add link
            </button>
          </div>
        )
      ) : null}
      <div
        className={`min-h-80 rounded-xl border bg-white p-4 focus-within:ring-2 focus-within:ring-oak/30 ${invalid ? "border-danger" : "border-line"}`}
      >
        <EditorContent editor={editor} />
      </div>
      <input
        ref={fileRef}
        type="file"
        multiple
        accept={IMAGE_ACCEPT}
        className="sr-only"
        onChange={(event) => filesChosen(event.target.files)}
        aria-label="Choose article images"
      />
      {files.length ? (
        <div className="mt-3 space-y-3 rounded-xl bg-canvas p-3" aria-live="polite">
          <p className="text-sm font-medium">Upload images · JPEG, PNG, WebP or AVIF, up to 5 MB each</p>
          {files.map((item) => (
            <div key={item.key} className="grid gap-2 sm:grid-cols-[1fr_2fr]">
              <span className="truncate text-sm" title={item.file.name}>
                {item.file.name}
              </span>
              <input
                value={item.alt}
                onChange={(event) =>
                  setFiles((current) =>
                    current.map((file) =>
                      file.key === item.key ? { ...file, alt: event.target.value } : file,
                    ),
                  )
                }
                aria-label={`Alt text for ${item.file.name}`}
                placeholder="Alt text"
                className="rounded-lg border border-line px-3 py-1.5 text-sm"
              />
              {item.percent !== null ? (
                <progress
                  className="h-2 w-full sm:col-span-2"
                  max={100}
                  value={item.percent}
                  aria-label={`Upload progress for ${item.file.name}`}
                />
              ) : null}
              {item.error ? (
                <p role="alert" className="text-sm text-danger sm:col-span-2">
                  {item.error} · Use “Upload and insert” to retry this file.
                </p>
              ) : null}
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={() => void uploadSelected()}
              className="rounded-full bg-oak px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {busy ? "Uploading…" : "Upload and insert"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setFiles([]);
                setStatus("");
              }}
              className="text-sm text-muted"
            >
              Clear
            </button>
            <span role="status" className="text-sm text-muted">
              {status}
            </span>
          </div>
        </div>
      ) : null}
      <p className="mt-2 text-xs text-muted">
        Changes are saved with the article. Image blocks can be moved by dragging; use the controls on each
        image to reorder, replace, or remove it.
      </p>
    </div>
  );
}
