"use client";

import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer, NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { useState } from "react";

export type ArticleBlockImage = { src: string; alt: string; caption: string };
export type ArticleBlockLayout = "full" | "side-by-side" | "gallery" | "with-text";
export type ArticleImageBlockAttrs = {
  layout: ArticleBlockLayout;
  side: "left" | "right";
  text: string;
  images: ArticleBlockImage[];
};

export type ArticleBlockUploadRequest = { position: number; imageIndex: number | null };

function ImageBlockView({ node, updateAttributes, getPos, editor }: NodeViewProps) {
  const attrs = node.attrs as ArticleImageBlockAttrs;
  const [choosing, setChoosing] = useState(false);
  const [pendingLayout, setPendingLayout] = useState<ArticleBlockLayout | null>(null);
  const pos = (typeof getPos === "function" ? getPos() : 0) ?? 0;
  const images = attrs.images ?? [];

  function updateImage(index: number, patch: Partial<ArticleBlockImage>) {
    updateAttributes({ images: images.map((image, i) => (i === index ? { ...image, ...patch } : image)) });
  }

  function removeImage(index: number) {
    const remaining = images.filter((_, i) => i !== index);
    if (!remaining.length) editor.commands.deleteRange({ from: pos, to: pos + node.nodeSize });
    else updateAttributes({ images: remaining });
  }

  function requestReplace(index: number | null) {
    window.dispatchEvent(
      new CustomEvent<ArticleBlockUploadRequest>("tidynest:replace-article-image", {
        detail: { position: pos, imageIndex: index },
      }),
    );
  }

  function changeLayout(layout: ArticleBlockLayout) {
    if (layout === attrs.layout) return;
    if ((layout === "full" || layout === "with-text") && images.length > 1) {
      setPendingLayout(layout);
      setChoosing(true);
      return;
    }
    updateAttributes({ layout });
  }

  function keepImages(keep: number[]) {
    if (!keep.length) return;
    updateAttributes({
      images: keep.map((index) => images[index]).filter(Boolean),
      layout: pendingLayout ?? attrs.layout,
    });
    setChoosing(false);
    setPendingLayout(null);
  }

  const countLimit = attrs.layout === "full" || attrs.layout === "with-text" ? 1 : 12;

  return (
    <NodeViewWrapper className="my-5 rounded-xl border border-line bg-white p-4" contentEditable={false}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-sm font-semibold">
          Image layout
          <select
            value={attrs.layout}
            onChange={(event) => changeLayout(event.target.value as ArticleBlockLayout)}
            className="rounded-lg border border-line bg-white px-2 py-1 font-normal"
          >
            <option value="full">Full width</option>
            <option value="side-by-side">Side by side</option>
            <option value="gallery">Gallery grid</option>
            <option value="with-text">Image with text</option>
          </select>
        </label>
        {attrs.layout === "with-text" ? (
          <label className="text-sm">
            Image side{" "}
            <select
              value={attrs.side}
              onChange={(event) => updateAttributes({ side: event.target.value })}
              className="ml-1 rounded-lg border border-line px-2 py-1"
            >
              <option value="left">Left</option>
              <option value="right">Right</option>
            </select>
          </label>
        ) : null}
      </div>
      {choosing ? (
        <div className="mb-3 rounded-lg bg-oak-pale p-3">
          <p className="text-sm font-medium">
            This layout supports one image. Choose which image to keep. The others will be removed from this
            block:
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {images.map((image, index) => (
              <button
                key={`${image.src}-${index}`}
                type="button"
                onClick={() => keepImages([index])}
                className="rounded-full border border-line bg-white px-3 py-1 text-sm"
              >
                Keep image {index + 1}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              setChoosing(false);
              setPendingLayout(null);
            }}
            className="mt-2 text-xs text-muted"
          >
            Cancel
          </button>
        </div>
      ) : null}
      {attrs.layout === "with-text" ? (
        <label className="mb-3 block text-xs font-medium text-muted">
          Text beside image
          <textarea
            value={attrs.text}
            onChange={(event) => updateAttributes({ text: event.target.value })}
            rows={3}
            className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm text-ink"
          />
        </label>
      ) : null}
      <div
        className={
          attrs.layout === "gallery" || attrs.layout === "side-by-side"
            ? "grid grid-cols-1 gap-3 sm:grid-cols-2"
            : "space-y-3"
        }
      >
        {images.map((image, index) => (
          <div
            key={`${image.src}-${index}`}
            className={
              attrs.layout === "with-text"
                ? `grid items-center gap-4 sm:grid-cols-2 ${attrs.side === "right" ? "sm:[&>img]:order-2" : ""}`
                : "min-w-0"
            }
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={image.src}
              alt={image.alt}
              className={
                attrs.layout === "full"
                  ? "max-h-96 w-full rounded-lg object-cover"
                  : "max-h-72 w-full rounded-lg object-cover"
              }
            />
            <div className="space-y-2">
              <label className="block text-xs font-medium text-muted">
                Alt text
                <input
                  value={image.alt}
                  maxLength={200}
                  onChange={(event) => updateImage(index, { alt: event.target.value })}
                  className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm text-ink"
                />
              </label>
              <label className="block text-xs font-medium text-muted">
                Caption (optional)
                <input
                  value={image.caption}
                  maxLength={200}
                  onChange={(event) => updateImage(index, { caption: event.target.value })}
                  className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm text-ink"
                />
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    updateAttributes({
                      images: images.map((item, i) =>
                        i === index
                          ? images[Math.max(0, index - 1)]!
                          : i === index - 1
                            ? images[index]!
                            : item,
                      ),
                    })
                  }
                  disabled={index === 0}
                  aria-label={`Move image ${index + 1} up`}
                  className="rounded border border-line px-2 py-1 text-xs disabled:opacity-40"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() =>
                    updateAttributes({
                      images: images.map((item, i) =>
                        i === index
                          ? images[Math.min(images.length - 1, index + 1)]!
                          : i === index + 1
                            ? images[index]!
                            : item,
                      ),
                    })
                  }
                  disabled={index === images.length - 1}
                  aria-label={`Move image ${index + 1} down`}
                  className="rounded border border-line px-2 py-1 text-xs disabled:opacity-40"
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => requestReplace(index)}
                  className="rounded border border-line px-2 py-1 text-xs"
                >
                  Replace
                </button>
                <button
                  type="button"
                  onClick={() => removeImage(index)}
                  aria-label={`Remove image ${index + 1}`}
                  className="ml-auto rounded p-1 text-xs text-danger"
                >
                  Remove
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
      {images.length < countLimit ? (
        <button
          type="button"
          onClick={() => requestReplace(null)}
          className="mt-3 inline-flex items-center gap-2 rounded-full border border-line px-3 py-1.5 text-sm"
        >
          ＋ Add image
        </button>
      ) : null}
    </NodeViewWrapper>
  );
}

export function createArticleImageBlockExtension() {
  return Node.create({
    name: "articleImageBlock",
    group: "block",
    atom: true,
    selectable: true,
    draggable: true,
    addAttributes() {
      return {
        layout: { default: "full" },
        side: { default: "left" },
        text: { default: "" },
        images: { default: [] },
      };
    },
    parseHTML() {
      return [{ tag: "div[data-article-image-block]" }];
    },
    renderHTML({ HTMLAttributes }) {
      return ["div", mergeAttributes(HTMLAttributes, { "data-article-image-block": "" })];
    },
    addNodeView() {
      return ReactNodeViewRenderer(ImageBlockView);
    },
    markdownTokenName: "tnArticleImageBlock",
    markdownTokenizer: {
      name: "tnArticleImageBlock",
      level: "block",
      start: "```tidynest-images",
      tokenize(source) {
        const match = /^```tidynest-images\s*\n([\s\S]*?)\n```(?:\n|$)/.exec(source);
        if (!match) return;
        try {
          const data = JSON.parse(decodeURIComponent(match[1]!)) as ArticleImageBlockAttrs;
          return { type: "tnArticleImageBlock", raw: match[0], ...data };
        } catch {
          return;
        }
      },
    },
    parseMarkdown(token, helpers) {
      const data = token as typeof token & ArticleImageBlockAttrs;
      return helpers.createNode("articleImageBlock", {
        layout: data.layout,
        side: data.side,
        text: data.text,
        images: data.images,
      });
    },
    renderMarkdown(node) {
      const data = node.attrs as ArticleImageBlockAttrs;
      const encoded = encodeURIComponent(JSON.stringify(data));
      return `\`\`\`tidynest-images\n${encoded}\n\`\`\``;
    },
  });
}
