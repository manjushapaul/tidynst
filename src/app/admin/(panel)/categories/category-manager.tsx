"use client";

import Link from "next/link";
import { type ReactNode, useActionState, useEffect, useId, useRef } from "react";
import { ActionForm } from "@/components/admin/action-form";
import { CsrfField, Field, FormMessage, inputClasses, SubmitButton } from "@/components/admin/form";
import { SubcategoryIconUpload } from "@/components/admin/subcategory-icon-upload";
import { categoryPath, subcategoryPath, type CategorySlug } from "@/content/categories";
import { cn } from "@/lib/cn";
import { HOMEPAGE_LIMITS } from "@/lib/content/homepage-schema";
import { SUBCATEGORY_LIMITS } from "@/lib/content/subcategory-schema";
import type { ActionState } from "@/server/actions";
import type { AdminSubcategoryGroup } from "@/server/subcategories";
import {
  createGroupAction,
  createSubcategoryAction,
  deleteGroupAction,
  deleteSubcategoryAction,
  updateCategoryIntroAction,
  updateGroupAction,
  updateSubcategoryAction,
} from "./actions";

type Section = {
  slug: CategorySlug;
  name: string;
  intro: string;
  groups: readonly AdminSubcategoryGroup[];
};

function SavedForm({
  action,
  csrf,
  className,
  resetOnSuccess = false,
  children,
}: {
  action: (previous: ActionState, formData: FormData) => Promise<ActionState>;
  csrf: string;
  className?: string;
  resetOnSuccess?: boolean;
  children: (state: ActionState) => ReactNode;
}) {
  const [state, formAction] = useActionState(action, null);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (resetOnSuccess && state?.ok) formRef.current?.reset();
  }, [resetOnSuccess, state]);
  return (
    <form ref={formRef} action={formAction} className={className}>
      <CsrfField token={csrf} />
      <FormMessage state={state} />
      {children(state)}
    </form>
  );
}

function topicsOf(group: AdminSubcategoryGroup) {
  return group.subcategories.filter((item) => item.slug !== group.slug);
}

const cardClasses = "rounded-2xl border border-line bg-surface p-5";
const cardHeadingClasses = "font-sans text-sm font-semibold tracking-normal";

/** One topic on a single line: its name with Save, and Delete beside it. */
function TopicRow({
  csrf,
  category,
  item,
}: {
  csrf: string;
  category: CategorySlug;
  item: AdminSubcategoryGroup["subcategories"][number];
}) {
  const id = useId();
  return (
    <li className="grid gap-2 rounded-xl border border-line bg-canvas/60 px-3 py-2.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
      <SavedForm
        action={updateSubcategoryAction}
        csrf={csrf}
        className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1"
      >
        {(state) => (
          <>
            <input type="hidden" name="id" value={item.id} />
            <label htmlFor={id} className="sr-only">
              Topic
            </label>
            <input
              id={id}
              name="name"
              required
              minLength={SUBCATEGORY_LIMITS.nameMin}
              maxLength={SUBCATEGORY_LIMITS.nameMax}
              defaultValue={item.name}
              aria-describedby={`${id}-hint${state?.fieldErrors?.name ? ` ${id}-error` : ""}`}
              aria-invalid={state?.fieldErrors?.name ? true : undefined}
              className={cn(inputClasses, "py-2")}
            />
            <SubmitButton size="sm" variant="secondary" pendingLabel="Saving…">
              Save
            </SubmitButton>
            <p id={`${id}-hint`} className="col-span-full truncate text-xs text-muted">
              {subcategoryPath(category, item.slug)}
            </p>
            {state?.fieldErrors?.name ? (
              <p id={`${id}-error`} className="col-span-full text-xs font-medium text-danger">
                {state.fieldErrors.name}
              </p>
            ) : null}
          </>
        )}
      </SavedForm>
      <ActionForm
        action={deleteSubcategoryAction}
        csrf={csrf}
        hidden={{ id: item.id }}
        label="Delete topic"
        pendingLabel="Deleting…"
        variant="ghost"
        className="sm:pt-1"
        confirm={`Delete “${item.name}”? This only works when no article uses it.`}
      />
    </li>
  );
}

function SubcategoryCard({
  csrf,
  category,
  group,
}: {
  csrf: string;
  category: CategorySlug;
  group: AdminSubcategoryGroup;
}) {
  const topics = topicsOf(group);
  return (
    <details className="group rounded-2xl border border-line bg-surface transition-shadow open:shadow-(--shadow-card)">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-2xl px-5 py-4 hover:bg-canvas/60 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">
          <span className="block font-medium text-ink">{group.name}</span>
          <span className="mt-0.5 block truncate text-xs text-muted">
            {topics.length} {topics.length === 1 ? "topic" : "topics"} ·{" "}
            {subcategoryPath(category, group.slug)}
          </span>
        </span>
        <span
          aria-hidden="true"
          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-sand text-oak-deep transition-transform group-open:rotate-180"
        >
          <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="m5 8 5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </summary>

      <div className="grid gap-6 border-t border-line px-5 py-5">
        <SavedForm
          key={`${group.id}:${group.name}:${group.description}:${group.iconMediaId ?? ""}`}
          action={updateGroupAction}
          csrf={csrf}
          className="grid gap-3"
        >
          {(state) => (
            <>
              <input type="hidden" name="id" value={group.id} />
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_13rem] sm:items-end">
                <Field
                  label="Subcategory name"
                  error={state?.fieldErrors?.name}
                  hint={subcategoryPath(category, group.slug)}
                >
                  {(props) => (
                    <input
                      {...props}
                      name="name"
                      required
                      minLength={SUBCATEGORY_LIMITS.nameMin}
                      maxLength={SUBCATEGORY_LIMITS.nameMax}
                      defaultValue={group.name}
                      className={inputClasses}
                    />
                  )}
                </Field>
                <SubcategoryIconUpload
                  csrf={csrf}
                  defaultId={group.iconMediaId}
                  defaultSrc={group.iconSrc}
                  altText={group.name}
                />
              </div>
              <Field label="Description" error={state?.fieldErrors?.description}>
                {(props) => (
                  <textarea
                    {...props}
                    name="description"
                    required
                    minLength={SUBCATEGORY_LIMITS.descriptionMin}
                    maxLength={SUBCATEGORY_LIMITS.descriptionMax}
                    rows={2}
                    defaultValue={group.description}
                    className={inputClasses}
                  />
                )}
              </Field>
              <div>
                <SubmitButton size="sm" ripple pendingLabel="Saving…">
                  Save subcategory
                </SubmitButton>
              </div>
            </>
          )}
        </SavedForm>

        <div className="rounded-xl bg-sand/50 p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <h4 className={cardHeadingClasses}>Topics ({topics.length})</h4>
            <p className="text-xs text-muted">Shown as labels on this subcategory’s public page.</p>
          </div>
          {topics.length ? (
            <ul className="mt-3 grid gap-2">
              {topics.map((item) => (
                <TopicRow key={`${item.id}:${item.name}`} csrf={csrf} category={category} item={item} />
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted">No topics yet.</p>
          )}
          <SavedForm
            action={createSubcategoryAction}
            csrf={csrf}
            resetOnSuccess
            className="mt-4 grid gap-3 border-t border-line pt-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start"
          >
            {(state) => (
              <>
                <input type="hidden" name="groupId" value={group.id} />
                <Field
                  label="Add a topic"
                  error={state?.fieldErrors?.name}
                  hint="The address is taken from the name and does not change if you rename it later."
                >
                  {(props) => (
                    <input
                      {...props}
                      name="name"
                      required
                      minLength={SUBCATEGORY_LIMITS.nameMin}
                      maxLength={SUBCATEGORY_LIMITS.nameMax}
                      autoComplete="off"
                      className={inputClasses}
                    />
                  )}
                </Field>
                <SubmitButton size="sm" ripple pendingLabel="Adding…" className="sm:mt-[1.9rem]">
                  Add topic
                </SubmitButton>
              </>
            )}
          </SavedForm>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
          <p className="text-xs text-muted">
            Deleting only works when no article is filed under this subcategory.
          </p>
          <ActionForm
            action={deleteGroupAction}
            csrf={csrf}
            hidden={{ id: group.id }}
            label="Delete subcategory"
            pendingLabel="Deleting…"
            variant="danger"
            confirm={`Delete “${group.name}”? This only works when no article is filed under it.`}
          />
        </div>
      </div>
    </details>
  );
}

function CategoryPanel({ csrf, section }: { csrf: string; section: Section }) {
  return (
    <section
      aria-labelledby={`category-${section.slug}`}
      className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:items-start"
    >
      <div className="grid gap-6 lg:sticky lg:top-6">
        <div className={cardClasses}>
          <h2 id={`category-${section.slug}`} className="text-2xl">
            {section.name}
          </h2>
          <Link
            href={categoryPath(section.slug)}
            target="_blank"
            className="mt-1 inline-block text-xs text-muted underline-offset-2 hover:text-oak-deep hover:underline"
          >
            {categoryPath(section.slug)} ↗
          </Link>
          <SavedForm
            key={`${section.slug}:${section.intro}`}
            action={updateCategoryIntroAction}
            csrf={csrf}
            className="mt-5 grid gap-3"
          >
            {(state) => (
              <>
                <input type="hidden" name="category" value={section.slug} />
                <Field
                  label="Description"
                  error={state?.fieldErrors?.intro}
                  hint="The paragraph under the category name on the public page."
                >
                  {(props) => (
                    <textarea
                      {...props}
                      name="intro"
                      required
                      minLength={40}
                      maxLength={HOMEPAGE_LIMITS.introMax}
                      rows={5}
                      defaultValue={section.intro}
                      className={inputClasses}
                    />
                  )}
                </Field>
                <div>
                  <SubmitButton size="sm" pendingLabel="Saving…">
                    Save category
                  </SubmitButton>
                </div>
              </>
            )}
          </SavedForm>
        </div>

        <SavedForm
          action={createGroupAction}
          csrf={csrf}
          resetOnSuccess
          className="grid gap-3 rounded-2xl border border-dashed border-line-strong bg-surface/60 p-5"
        >
          {(state) => (
            <>
              <input type="hidden" name="category" value={section.slug} />
              <h3 className={cardHeadingClasses}>Add a subcategory to {section.name}</h3>
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_13rem] sm:items-end">
                <Field label="Subcategory name" error={state?.fieldErrors?.name}>
                  {(props) => (
                    <input
                      {...props}
                      name="name"
                      required
                      minLength={SUBCATEGORY_LIMITS.nameMin}
                      maxLength={SUBCATEGORY_LIMITS.nameMax}
                      autoComplete="off"
                      className={inputClasses}
                    />
                  )}
                </Field>
                <SubcategoryIconUpload
                  csrf={csrf}
                  defaultId={null}
                  defaultSrc={null}
                  altText={`${section.name} subcategory`}
                />
              </div>
              <Field label="Description" error={state?.fieldErrors?.description}>
                {(props) => (
                  <textarea
                    {...props}
                    name="description"
                    required
                    minLength={SUBCATEGORY_LIMITS.descriptionMin}
                    maxLength={SUBCATEGORY_LIMITS.descriptionMax}
                    rows={2}
                    className={inputClasses}
                  />
                )}
              </Field>
              <div>
                <SubmitButton size="sm" ripple pendingLabel="Adding…">
                  Add subcategory
                </SubmitButton>
              </div>
            </>
          )}
        </SavedForm>
      </div>

      <div className="grid gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h3 className="font-sans text-base font-semibold tracking-normal">
            Subcategories ({section.groups.length})
          </h3>
          {section.groups.length ? (
            <p className="text-xs text-muted">Open one to edit its name, description and topics.</p>
          ) : null}
        </div>
        {section.groups.length === 0 ? (
          <p className="rounded-2xl border border-line bg-surface px-5 py-8 text-sm text-muted">
            No subcategories yet. The public page keeps its short cover list until you add one.
          </p>
        ) : (
          section.groups.map((group) => (
            <SubcategoryCard key={group.id} csrf={csrf} category={section.slug} group={group} />
          ))
        )}
      </div>
    </section>
  );
}

export function CategoryManager({
  csrf,
  sections,
  active,
}: {
  csrf: string;
  sections: readonly Section[];
  active: CategorySlug;
}) {
  const current = sections.find((section) => section.slug === active) ?? sections[0];
  return (
    <div className="grid gap-6">
      <nav aria-label="Categories" className="flex flex-wrap gap-2">
        {sections.map((section) => {
          const selected = section.slug === current?.slug;
          return (
            <Link
              key={section.slug}
              href={`/admin/categories?category=${section.slug}`}
              scroll={false}
              aria-current={selected ? "page" : undefined}
              className={cn(
                "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition-colors",
                selected
                  ? "border-oak bg-oak-pale font-medium text-oak-deep"
                  : "border-line-strong bg-surface text-muted hover:text-ink",
              )}
            >
              {section.name}
              <span
                className={cn(
                  "rounded-full px-1.5 py-px text-xs tabular-nums",
                  selected ? "bg-oak text-white" : "bg-sand text-muted",
                )}
              >
                {section.groups.length}
              </span>
            </Link>
          );
        })}
      </nav>
      {current ? <CategoryPanel key={current.slug} csrf={csrf} section={current} /> : null}
    </div>
  );
}
