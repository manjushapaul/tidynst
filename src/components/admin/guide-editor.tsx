"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { categories } from "@/content/categories";
import type { GuideFaq } from "@/db/schema";
import type { ArticleImageStyle } from "@/lib/content/article-image-style";
import type { FeaturedImageStyle } from "@/lib/content/featured-image-style";
import { removeMediaFromBody } from "@/lib/content/body-images";
import { GUIDE_LIMITS, guideContentSchema, type GuideContent } from "@/lib/content/guide-schema";
import {
  CONTENT_CHECKS_ISSUES,
  CONTENT_CHECKS_LABEL,
  CONTENT_CHECKS_PASSED,
} from "@/lib/content/guide-status";
import { bodyMediaIds, PUBLISH_RULES, publishIssues, type PublishContext } from "@/lib/content/publish-rules";
import { slugify } from "@/lib/content/slug";
import { CsrfField, Field, FormMessage, inputClasses, SubmitButton, useControlledSelect } from "./form";
import { FaqEditor, faqRows, faqsFromRows } from "./faq-editor";
import { FeaturedImagePicker } from "./featured-image-picker";
import { FeaturedImageStyleEditor } from "./featured-image-style-editor";
import type { LinkTargets } from "@/lib/content/link-targets";
import { MarkdownEditor } from "./markdown-editor";
import type { PickerAsset } from "./media-picker";
import { RichArticleEditor } from "./rich-article-editor";

type EditorState = {
  ok: boolean;
  message: string | null;
  fieldErrors?: Record<string, string>;
  conflict?: boolean;
  draft?: GuideContent;
  version?: number;
  redirectTo?: string;
} | null;

type ProductChoice = { id: string; name: string; status: "draft" | "active" | "retired" };
type TopicChoice = { id: string; name: string };
type ProductRow = { productId: string; note: string };

function snapshot(input: {
  title: string;
  slug: string;
  excerpt: string;
  body: string;
  closing: string;
  category: string;
  subcategoryGroupId: string;
  subcategoryId: string;
  topicIds: string[];
  products: ProductRow[];
  seoTitle: string;
  seoDescription: string;
  featuredImageId: string;
  featuredImageAlt: string;
  featuredImageStyle: FeaturedImageStyle;
  faqs: GuideFaq[];
  articleImageStyle: ArticleImageStyle;
}): string {
  return JSON.stringify(input);
}

export function GuideEditor({
  csrf,
  action,
  mode,
  guideId,
  initial,
  version: initialVersion,
  everPublished,
  topics,
  products,
  media,
  canDeleteMedia,
  categoryChoices = categories.map((item) => ({ slug: item.slug, name: item.name })),
  subcategoryChoices = [],
  linkTargets,
}: {
  csrf: string;
  action: (previous: EditorState, formData: FormData) => Promise<EditorState>;
  mode: "create" | "edit";
  guideId?: string;
  initial: GuideContent;
  version: number;
  everPublished: boolean;
  topics: TopicChoice[];
  products: ProductChoice[];
  media: PickerAsset[];
  canDeleteMedia: boolean;
  /** Public category names. Addresses stay on the built-in slugs. */
  categoryChoices?: ReadonlyArray<{ slug: string; name: string }>;
  /** Subcategories an article can be filed under, with their topics. Filtered by the chosen category. */
  subcategoryChoices?: ReadonlyArray<{
    id: string;
    category: string;
    name: string;
    topics: ReadonlyArray<{ id: string; name: string }>;
  }>;
  /** Pages the editor's Link button offers. */
  linkTargets?: LinkTargets;
}) {
  const router = useRouter();
  const [state, formAction] = useActionState(action, null);
  const [title, setTitle] = useState(initial.title);
  const [slug, setSlug] = useState(initial.slug);
  const [slugTouched, setSlugTouched] = useState(false);
  const [excerpt, setExcerpt] = useState(initial.excerpt);
  const [body, setBody] = useState(initial.body);
  const [closing, setClosing] = useState(initial.closing);
  const [category, setCategory] = useState(initial.category ?? "");
  const [subcategoryGroupId, setSubcategoryGroupId] = useState(initial.subcategoryGroupId ?? "");
  const [subcategoryId, setSubcategoryId] = useState(initial.subcategoryId ?? "");
  const [topicIds, setTopicIds] = useState(initial.topicIds);
  const [productRows, setProductRows] = useState<ProductRow[]>(
    initial.products.map((item) => ({ productId: item.productId, note: item.note ?? "" })),
  );
  const [seoTitle, setSeoTitle] = useState(initial.seoTitle ?? "");
  const [seoDescription, setSeoDescription] = useState(initial.seoDescription ?? "");
  const [featuredImageId, setFeaturedImageId] = useState(initial.featuredImageId ?? "");
  const [featuredImageAlt, setFeaturedImageAlt] = useState(initial.featuredImageAlt ?? "");
  const [featuredImageStyle, setFeaturedImageStyle] = useState(initial.featuredImageStyle);
  const [faqs, setFaqs] = useState(() => faqRows(initial.faqs));
  const [articleImageStyle, setArticleImageStyle] = useState(initial.articleImageStyle);
  const [version, setVersion] = useState(initialVersion);
  const [productToAdd, setProductToAdd] = useState("");
  const [library, setLibrary] = useState(media);
  const categoryRef = useControlledSelect(category, state);
  const subcategoryRef = useControlledSelect(subcategoryGroupId, state);
  const topicRef = useControlledSelect(subcategoryId, state);
  const productToAddRef = useControlledSelect(productToAdd, state);

  const current = {
    title,
    slug,
    excerpt,
    body,
    closing,
    category,
    subcategoryGroupId,
    subcategoryId,
    topicIds,
    products: productRows,
    seoTitle,
    seoDescription,
    featuredImageId,
    featuredImageAlt,
    featuredImageStyle,
    faqs: faqsFromRows(faqs),
    articleImageStyle,
  };
  const [baseline, setBaseline] = useState(() => snapshot(current));
  const dirty = snapshot(current) !== baseline;

  function apply(content: GuideContent) {
    setTitle(content.title);
    setSlug(content.slug);
    setExcerpt(content.excerpt);
    setBody(content.body);
    setClosing(content.closing);
    setCategory(content.category ?? "");
    setSubcategoryGroupId(content.subcategoryGroupId ?? "");
    setSubcategoryId(content.subcategoryId ?? "");
    setTopicIds(content.topicIds);
    setProductRows(content.products.map((item) => ({ productId: item.productId, note: item.note ?? "" })));
    setSeoTitle(content.seoTitle ?? "");
    setSeoDescription(content.seoDescription ?? "");
    setFeaturedImageId(content.featuredImageId ?? "");
    setFeaturedImageAlt(content.featuredImageAlt ?? "");
    setFeaturedImageStyle(content.featuredImageStyle);
    setFaqs(faqRows(content.faqs));
    setArticleImageStyle(content.articleImageStyle);
  }

  const [seenAction, setSeenAction] = useState<EditorState>(null);
  if (state !== seenAction) {
    setSeenAction(state);
    if (state?.draft && (state.ok || state.conflict)) apply(state.draft);
    if (state?.ok && state.version) {
      setVersion(state.version);
      if (state.draft) {
        setBaseline(
          snapshot({
            title: state.draft.title,
            slug: state.draft.slug,
            excerpt: state.draft.excerpt,
            body: state.draft.body,
            closing: state.draft.closing,
            category: state.draft.category ?? "",
            subcategoryGroupId: state.draft.subcategoryGroupId ?? "",
            subcategoryId: state.draft.subcategoryId ?? "",
            topicIds: state.draft.topicIds,
            products: state.draft.products.map((item) => ({
              productId: item.productId,
              note: item.note ?? "",
            })),
            seoTitle: state.draft.seoTitle ?? "",
            seoDescription: state.draft.seoDescription ?? "",
            featuredImageId: state.draft.featuredImageId ?? "",
            featuredImageAlt: state.draft.featuredImageAlt ?? "",
            featuredImageStyle: state.draft.featuredImageStyle,
            faqs: state.draft.faqs,
            articleImageStyle: state.draft.articleImageStyle,
          }),
        );
      }
    }
  }

  useEffect(() => {
    if (state?.redirectTo) router.push(state.redirectTo);
  }, [router, state]);

  useEffect(() => {
    if (!dirty) return;
    const onLeave = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [dirty]);

  const draftInput = {
    title,
    slug,
    excerpt,
    body,
    closing,
    category: category || null,
    subcategoryId: subcategoryId || null,
    subcategoryGroupId: subcategoryGroupId || null,
    topicIds,
    products: productRows.map((row) => ({ productId: row.productId, note: row.note })),
    seoTitle,
    seoDescription,
    featuredImageId: featuredImageId || null,
    featuredImageAlt,
    featuredImageStyle,
    faqs: current.faqs,
    articleImageStyle,
  };
  const topicChoices = subcategoryChoices.find((item) => item.id === subcategoryGroupId)?.topics ?? [];
  const parsed = guideContentSchema.safeParse(draftInput);
  const context: PublishContext = {
    productStatus: new Map(products.map((product) => [product.id, product.status])),
    knownTopicIds: new Set(topics.map((topic) => topic.id)),
    featuredImageExists: featuredImageId ? library.some((asset) => asset.id === featuredImageId) : false,
  };
  const issues = parsed.success ? publishIssues(parsed.data, context) : [];
  const errors = state?.fieldErrors ?? {};
  const featured = library.find((asset) => asset.id === featuredImageId);

  const usedMediaIds = new Set([...bodyMediaIds(body), ...(featuredImageId ? [featuredImageId] : [])]);

  function addToLibrary(asset: PickerAsset) {
    setLibrary((currentAssets) => [asset, ...currentAssets.filter((item) => item.id !== asset.id)]);
  }

  function removeDeletedImage(id: string) {
    setLibrary((currentAssets) => currentAssets.filter((item) => item.id !== id));
    setBody((currentBody) => removeMediaFromBody(currentBody, id));
    if (featuredImageId === id) {
      setFeaturedImageId("");
      setFeaturedImageAlt("");
    }
  }

  return (
    <form action={formAction} className="space-y-8">
      <CsrfField token={csrf} />
      {guideId ? <input type="hidden" name="guideId" value={guideId} /> : null}
      {mode === "edit" ? <input type="hidden" name="version" value={version} /> : null}
      <input type="hidden" name="products" value={JSON.stringify(draftInput.products)} />
      <input type="hidden" name="faqs" value={JSON.stringify(draftInput.faqs)} />
      <input type="hidden" name="articleImageStyle" value={JSON.stringify(articleImageStyle)} />
      <input type="hidden" name="featuredImageStyle" value={JSON.stringify(featuredImageStyle)} />
      <input type="hidden" name="featuredImageId" value={featuredImageId} />
      <input type="hidden" name="body" value={body} />
      {topicIds.map((topicId) => (
        <input key={topicId} type="hidden" name="topicIds" value={topicId} />
      ))}
      <FormMessage state={state} />
      {dirty ? (
        <p className="text-sm text-warning">
          You have unsaved changes. Use Save draft — nothing is published.
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Title" error={errors.title} className="sm:col-span-2">
          {(props) => (
            <input
              {...props}
              name="title"
              value={title}
              maxLength={GUIDE_LIMITS.titleMax}
              required
              className={inputClasses}
              onChange={(event) => {
                const next = event.target.value;
                setTitle(next);
                if (!slugTouched) setSlug(slugify(next));
              }}
            />
          )}
        </Field>
        <Field
          label="Address"
          error={errors.slug}
          hint={
            everPublished
              ? "Filled in from the title. If it changes, the article moves to the new address when you publish again, and old links redirect there."
              : "Filled in from the title. Type here to choose your own; clear it to fill it from the title again."
          }
          className="sm:col-span-2"
        >
          {(props) => (
            <input
              {...props}
              name="slug"
              value={slug}
              required
              className={inputClasses}
              onChange={(event) => {
                setSlugTouched(event.target.value !== "");
                setSlug(event.target.value);
              }}
            />
          )}
        </Field>
        <Field
          label="Summary"
          hint={
            <>
              {excerpt.length} / {GUIDE_LIMITS.excerptMax} characters. Publishing needs{" "}
              {PUBLISH_RULES.excerptMin}–{PUBLISH_RULES.excerptMax}. Summaries over{" "}
              {PUBLISH_RULES.metaDescriptionMax} characters also need a meta description below.
            </>
          }
          error={errors.excerpt}
          className="sm:col-span-2"
        >
          {(props) => (
            <textarea
              {...props}
              name="excerpt"
              value={excerpt}
              maxLength={GUIDE_LIMITS.excerptMax}
              rows={3}
              className={inputClasses}
              onChange={(event) => setExcerpt(event.target.value)}
            />
          )}
        </Field>
        <Field label="Category" error={errors.category}>
          {(props) => (
            <select
              {...props}
              ref={categoryRef}
              name="category"
              value={category}
              className={inputClasses}
              onChange={(event) => {
                const next = event.target.value;
                setCategory(next);
                const stillFits = subcategoryChoices.some(
                  (item) => item.id === subcategoryGroupId && item.category === next,
                );
                if (!stillFits) {
                  setSubcategoryGroupId("");
                  setSubcategoryId("");
                }
              }}
            >
              <option value="">Not chosen yet</option>
              {categoryChoices.map((item) => (
                <option key={item.slug} value={item.slug}>
                  {item.name}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field
          label="Subcategory"
          hint={category ? "Articles are filed under one subcategory." : "Choose a category first."}
          error={errors.subcategoryGroupId}
        >
          {(props) => (
            <select
              {...props}
              ref={subcategoryRef}
              name="subcategoryGroupId"
              value={subcategoryGroupId}
              disabled={!category}
              className={inputClasses}
              onChange={(event) => {
                setSubcategoryGroupId(event.target.value);
                setSubcategoryId("");
              }}
            >
              <option value="">None yet</option>
              {subcategoryChoices
                .filter((item) => item.category === category)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
            </select>
          )}
        </Field>
        <Field
          label="Topic"
          hint={
            !subcategoryGroupId
              ? "Choose a subcategory first."
              : topicChoices.length
                ? "The topic tab this article appears under. Left as automatic, it appears under every topic its title mentions."
                : "This subcategory has no topics."
          }
          error={errors.subcategoryId}
          className="sm:col-span-2"
        >
          {(props) => (
            <select
              {...props}
              ref={topicRef}
              name="subcategoryId"
              value={subcategoryId}
              disabled={!topicChoices.length && !subcategoryId}
              className={inputClasses}
              onChange={(event) => setSubcategoryId(event.target.value)}
            >
              <option value="">Automatic (match by title)</option>
              {subcategoryId && !topicChoices.some((topic) => topic.id === subcategoryId) ? (
                <option value={subcategoryId}>Whole subcategory (earlier filing)</option>
              ) : null}
              {topicChoices.map((topic) => (
                <option key={topic.id} value={topic.id}>
                  {topic.name}
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>

      <section aria-labelledby="body-heading">
        <h2 id="body-heading" className="mb-2 font-sans text-sm font-semibold tracking-normal">
          Body
        </h2>
        {errors.body ? (
          <p role="alert" className="mb-2 text-xs font-medium text-danger">
            {errors.body}
          </p>
        ) : null}
        <RichArticleEditor
          value={body}
          onChange={setBody}
          csrf={csrf}
          onUploaded={addToLibrary}
          invalid={Boolean(errors.body)}
          linkTargets={linkTargets}
        />
        {errors.articleImageStyle ? (
          <p role="alert" className="mt-2 text-xs font-medium text-danger">
            {errors.articleImageStyle}
          </p>
        ) : null}
      </section>

      <section aria-labelledby="closing-heading">
        <div className="mb-2">
          <h2 id="closing-heading" className="font-sans text-sm font-semibold tracking-normal">
            Final thoughts
          </h2>
          <p className="mt-1 text-xs text-muted">
            Shown after the article body, not inside a step or image block. Start with a heading such as{" "}
            <code className="text-[calc(0.7rem*var(--text-scale))]">## Final Thoughts</code>.
          </p>
        </div>
        {errors.closing ? (
          <p role="alert" className="mb-2 text-xs font-medium text-danger">
            {errors.closing}
          </p>
        ) : null}
        <MarkdownEditor
          id="guide-closing"
          name="closing"
          value={closing}
          onChange={setClosing}
          invalid={Boolean(errors.closing)}
          layoutHint="This section always appears below the article steps, on its own — not beside an image."
          linkTargets={linkTargets}
        />
      </section>

      <section aria-labelledby="featured-heading" className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 id="featured-heading" className="font-sans text-sm font-semibold tracking-normal">
            Featured image
          </h2>
          <FeaturedImagePicker
            csrf={csrf}
            media={library}
            currentId={featuredImageId}
            onUploaded={addToLibrary}
            canDelete={canDeleteMedia}
            usedIds={usedMediaIds}
            onDeleted={removeDeletedImage}
            onChoose={(asset) => {
              setFeaturedImageId(asset.id);
              if (!featuredImageAlt.trim()) setFeaturedImageAlt(asset.altText);
            }}
          />
        </div>
        {errors.featuredImageId ? (
          <p role="alert" className="text-xs font-medium text-danger">
            {errors.featuredImageId}
          </p>
        ) : null}
        {featured ? (
          <div className="flex items-start gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={featured.src}
              alt=""
              width={96}
              height={96}
              className="size-24 rounded-lg object-cover"
            />
            <div>
              <p className="text-sm">{featured.altText}</p>
              <button
                type="button"
                className="mt-2 text-sm text-danger"
                onClick={() => setFeaturedImageId("")}
              >
                Remove featured image
              </button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted">
            No featured image. Use “Choose featured image” to upload one or pick one from the library.
          </p>
        )}
        <Field label="Featured image alt text" error={errors.featuredImageAlt}>
          {(props) => (
            <input
              {...props}
              name="featuredImageAlt"
              value={featuredImageAlt}
              maxLength={GUIDE_LIMITS.imageAltMax}
              className={inputClasses}
              onChange={(event) => setFeaturedImageAlt(event.target.value)}
            />
          )}
        </Field>
        <FeaturedImageStyleEditor
          value={featuredImageStyle}
          onChange={setFeaturedImageStyle}
          actionState={state}
          error={errors.featuredImageStyle}
          image={featured ? { src: featured.src, alt: featuredImageAlt || featured.altText } : null}
        />
      </section>

      <section aria-labelledby="products-heading" className="space-y-3">
        <h2 id="products-heading" className="font-sans text-sm font-semibold tracking-normal">
          Products
        </h2>
        <p className="text-xs text-muted">
          Order is the order readers will see. At most {GUIDE_LIMITS.productsMax}.
        </p>
        {errors.products ? (
          <p role="alert" className="text-xs font-medium text-danger">
            {errors.products}
          </p>
        ) : null}
        <ol className="space-y-3">
          {productRows.map((row, index) => {
            const product = products.find((item) => item.id === row.productId);
            return (
              <li key={row.productId} className="rounded-xl border border-line p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">{product?.name ?? "Unknown product"}</p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="text-xs text-oak-deep"
                      disabled={index === 0}
                      onClick={() =>
                        setProductRows((rows) => {
                          const next = [...rows];
                          const previous = next[index - 1];
                          const currentRow = next[index];
                          if (!previous || !currentRow) return rows;
                          next[index - 1] = currentRow;
                          next[index] = previous;
                          return next;
                        })
                      }
                    >
                      Move up
                    </button>
                    <button
                      type="button"
                      className="text-xs text-oak-deep"
                      disabled={index === productRows.length - 1}
                      onClick={() =>
                        setProductRows((rows) => {
                          const next = [...rows];
                          const following = next[index + 1];
                          const currentRow = next[index];
                          if (!following || !currentRow) return rows;
                          next[index + 1] = currentRow;
                          next[index] = following;
                          return next;
                        })
                      }
                    >
                      Move down
                    </button>
                    <button
                      type="button"
                      className="text-xs text-danger"
                      onClick={() =>
                        setProductRows((rows) => rows.filter((item) => item.productId !== row.productId))
                      }
                    >
                      Remove
                    </button>
                  </div>
                </div>
                <label className="mt-2 block text-xs text-muted" htmlFor={`note-${row.productId}`}>
                  Note for {product?.name ?? "this product"}
                </label>
                <input
                  id={`note-${row.productId}`}
                  value={row.note}
                  maxLength={GUIDE_LIMITS.productNoteMax}
                  className={`${inputClasses} mt-1`}
                  onChange={(event) =>
                    setProductRows((rows) =>
                      rows.map((item) =>
                        item.productId === row.productId ? { ...item, note: event.target.value } : item,
                      ),
                    )
                  }
                />
              </li>
            );
          })}
        </ol>
        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="add-product">
            Add a product
          </label>
          <select
            id="add-product"
            ref={productToAddRef}
            value={productToAdd}
            onChange={(event) => setProductToAdd(event.target.value)}
            className="max-w-full rounded-xl border border-line-strong bg-surface px-3 py-2 text-sm"
          >
            <option value="">Select a product</option>
            {products.map((product) => (
              <option
                key={product.id}
                value={product.id}
                disabled={productRows.some((row) => row.productId === product.id)}
              >
                {product.name} ({product.status})
              </option>
            ))}
          </select>
          <button
            type="button"
            className="rounded-full border border-line-strong px-3 py-2 text-sm"
            disabled={!productToAdd || productRows.length >= GUIDE_LIMITS.productsMax}
            onClick={() => {
              if (!productToAdd) return;
              setProductRows((rows) =>
                rows.some((row) => row.productId === productToAdd)
                  ? rows
                  : [...rows, { productId: productToAdd, note: "" }],
              );
              setProductToAdd("");
            }}
          >
            Add product
          </button>
        </div>
      </section>

      <FaqEditor rows={faqs} onChange={setFaqs} error={errors.faqs} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="SEO title"
          error={errors.seoTitle}
          hint="Optional. Leave blank to use the article title."
        >
          {(props) => (
            <input
              {...props}
              name="seoTitle"
              value={seoTitle}
              maxLength={GUIDE_LIMITS.seoTitleMax}
              className={inputClasses}
              onChange={(event) => setSeoTitle(event.target.value)}
            />
          )}
        </Field>
        <Field
          label="Meta description"
          error={errors.seoDescription}
          hint="Optional. Used when the summary is the wrong length."
        >
          {(props) => (
            <textarea
              {...props}
              name="seoDescription"
              value={seoDescription}
              maxLength={GUIDE_LIMITS.seoDescriptionMax}
              rows={3}
              className={inputClasses}
              onChange={(event) => setSeoDescription(event.target.value)}
            />
          )}
        </Field>
      </div>

      <section aria-labelledby="publish-check-heading" className="rounded-xl bg-sand/70 p-4">
        <h2 id="publish-check-heading" className="font-sans text-sm font-semibold tracking-normal">
          {CONTENT_CHECKS_LABEL}
        </h2>
        <p className="mt-1 text-xs text-muted">Advisory only. Saving a draft does not publish it.</p>
        {parsed.success ? (
          issues.length === 0 ? (
            <p className="mt-3 text-sm text-oak-deep">{CONTENT_CHECKS_PASSED}</p>
          ) : (
            <>
              <p className="mt-3 text-sm font-medium">{CONTENT_CHECKS_ISSUES}</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                {issues.map((issue) => (
                  <li key={`${issue.field}-${issue.message}`}>{issue.message}</li>
                ))}
              </ul>
            </>
          )
        ) : (
          <p className="mt-3 text-sm text-muted">{parsed.error.issues[0]?.message}</p>
        )}
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton pendingLabel="Saving…">
          {mode === "create" ? "Create draft" : "Save draft"}
        </SubmitButton>
        <p className="text-xs text-muted">This does not publish the article.</p>
      </div>
    </form>
  );
}
