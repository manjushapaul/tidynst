"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  canTransition,
  PRODUCT_LIMITS,
  PRODUCT_STATUS_LABELS,
  PRODUCT_STATUSES,
  type ProductStatus,
  READER_VISIBLE_FIELDS,
} from "@/lib/content/product-schema";
import { slugify } from "@/lib/content/slug";
import type { ActionState } from "@/server/actions";
import {
  ControlledCheckbox,
  CsrfField,
  Field,
  FormMessage,
  inputClasses,
  SubmitButton,
  useControlledSelect,
} from "./form";

export type ProductFormValues = {
  name: string;
  slug: string;
  brand: string;
  summary: string;
  merchantName: string;
  productUrl: string;
  verifiedOn: string;
  status: string;
};

const EMPTY: ProductFormValues = {
  name: "",
  slug: "",
  brand: "",
  summary: "",
  merchantName: "",
  productUrl: "",
  verifiedOn: "",
  status: "draft",
};

type Props = {
  csrf: string;
  action: (previous: ActionState, formData: FormData) => Promise<ActionState>;
  mode: "create" | "edit";
  productId?: string;
  version?: number;
  initial?: ProductFormValues;
  /** Saved status; limits which statuses can be chosen. */
  savedStatus?: ProductStatus;
  /** Published articles that show this product now. */
  publishedUses?: { id: string; title: string }[];
};

export function ProductForm({
  csrf,
  action,
  mode,
  productId,
  version: initialVersion,
  initial = EMPTY,
  savedStatus,
  publishedUses = [],
}: Props) {
  const [state, formAction] = useActionState(action, null);
  const [values, setValues] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [slugEdited, setSlugEdited] = useState(mode === "edit");
  const [version, setVersion] = useState(initialVersion);
  const [currentStatus, setCurrentStatus] = useState(savedStatus);
  const [confirmImpact, setConfirmImpact] = useState(false);
  const [seen, setSeen] = useState<ActionState>(null);
  const router = useRouter();
  const statusRef = useControlledSelect(values.status, state);

  if (state !== seen) {
    setSeen(state);
    if (state?.ok && state.version) {
      setVersion(state.version);
      setCurrentStatus(values.status as ProductStatus);
      setSaved(values);
      setConfirmImpact(false);
    }
  }
  useEffect(() => {
    if (state?.redirectTo) router.push(state.redirectTo);
  }, [router, state]);

  const set = (key: keyof ProductFormValues) => (value: string) =>
    setValues((previous) => {
      const next = { ...previous, [key]: value };
      if (key === "name" && !slugEdited) next.slug = slugify(value);
      return next;
    });
  const errors = state?.fieldErrors ?? {};
  const leavingActive = currentStatus === "active" && values.status !== "active";
  const visibleFieldsChanged =
    currentStatus === "active" &&
    READER_VISIBLE_FIELDS.some((key) => values[key].trim() !== saved[key].trim());
  const showImpact =
    (publishedUses.length > 0 && (leavingActive || visibleFieldsChanged)) || Boolean(errors.confirmImpact);
  const allowed = PRODUCT_STATUSES.filter((status) =>
    mode === "create" ? status !== "retired" : currentStatus ? canTransition(currentStatus, status) : true,
  );

  return (
    <form action={formAction} className="max-w-2xl space-y-5" noValidate>
      <CsrfField token={csrf} />
      {productId ? <input type="hidden" name="productId" value={productId} /> : null}
      {version ? <input type="hidden" name="version" value={version} /> : null}

      <Field label="Name" error={errors.name}>
        {(props) => (
          <input
            {...props}
            name="name"
            required
            maxLength={PRODUCT_LIMITS.nameMax}
            value={values.name}
            onChange={(event) => set("name")(event.target.value)}
            className={inputClasses}
          />
        )}
      </Field>
      <Field label="Address (slug)" hint="Lowercase letters, numbers and hyphens." error={errors.slug}>
        {(props) => (
          <input
            {...props}
            name="slug"
            required
            value={values.slug}
            onChange={(event) => {
              setSlugEdited(true);
              set("slug")(event.target.value);
            }}
            className={inputClasses}
          />
        )}
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Brand (optional)" error={errors.brand}>
          {(props) => (
            <input
              {...props}
              name="brand"
              maxLength={PRODUCT_LIMITS.brandMax}
              value={values.brand}
              onChange={(event) => set("brand")(event.target.value)}
              className={inputClasses}
            />
          )}
        </Field>
        <Field label="Merchant (optional)" hint="Where readers can buy it." error={errors.merchantName}>
          {(props) => (
            <input
              {...props}
              name="merchantName"
              maxLength={PRODUCT_LIMITS.merchantMax}
              value={values.merchantName}
              onChange={(event) => set("merchantName")(event.target.value)}
              className={inputClasses}
            />
          )}
        </Field>
      </div>
      <Field
        label="Summary"
        hint={`Why it is recommended, in your own words (${PRODUCT_LIMITS.summaryMin}–${PRODUCT_LIMITS.summaryMax} characters). No prices or ratings.`}
        error={errors.summary}
      >
        {(props) => (
          <textarea
            {...props}
            name="summary"
            rows={3}
            required
            maxLength={PRODUCT_LIMITS.summaryMax}
            value={values.summary}
            onChange={(event) => set("summary")(event.target.value)}
            className={inputClasses}
          />
        )}
      </Field>
      <Field
        label="Product link (optional)"
        hint="https:// only. Affiliate tracking parameters are rejected while affiliate links are disabled."
        error={errors.productUrl}
      >
        {(props) => (
          <input
            {...props}
            name="productUrl"
            type="url"
            inputMode="url"
            value={values.productUrl}
            onChange={(event) => set("productUrl")(event.target.value)}
            className={inputClasses}
          />
        )}
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          label="Details verified on"
          hint="The date you last checked the product against the seller. Required to make it active."
          error={errors.verifiedOn}
        >
          {(props) => (
            <input
              {...props}
              name="verifiedOn"
              type="date"
              value={values.verifiedOn}
              onChange={(event) => set("verifiedOn")(event.target.value)}
              className={inputClasses}
            />
          )}
        </Field>
        <Field
          label="Status"
          hint={
            currentStatus === "retired"
              ? "Retired products go back to draft before they can be active again."
              : "Only active products appear on published articles."
          }
          error={errors.status}
        >
          {(props) => (
            <select
              {...props}
              ref={statusRef}
              name="status"
              value={values.status}
              onChange={(event) => set("status")(event.target.value)}
              className={inputClasses}
            >
              {allowed.map((status) => (
                <option key={status} value={status}>
                  {PRODUCT_STATUS_LABELS[status]}
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>

      {showImpact ? (
        <div className="rounded-xl border border-danger/40 bg-danger-pale p-4 text-sm">
          <p className="font-medium text-danger">
            {publishedUses.length === 1
              ? "1 published article recommends this product:"
              : `${publishedUses.length} published articles recommend this product:`}
          </p>
          <ul className="mt-2 list-disc space-y-0.5 pl-5 text-ink">
            {publishedUses.map((use) => (
              <li key={use.id}>
                {use.title}
                <input type="hidden" name="impactArticleIds" value={use.id} />
              </li>
            ))}
          </ul>
          <p className="mt-2 text-ink">
            {leavingActive
              ? "It will stop showing on those pages, and they cannot be republished until it is replaced or active again."
              : "Saving changes the product details readers see on those pages immediately. The articles are not reviewed again."}
          </p>
          <label className="mt-3 flex items-start gap-2">
            <ControlledCheckbox
              name="confirmImpact"
              value="yes"
              checked={confirmImpact}
              onChange={(event) => setConfirmImpact(event.target.checked)}
              className="mt-1"
              aria-invalid={errors.confirmImpact ? true : undefined}
            />
            <span>I understand the impact on the published articles listed.</span>
          </label>
        </div>
      ) : null}

      <FormMessage state={state} />
      <SubmitButton pendingLabel="Saving…">
        {mode === "create" ? "Create product" : "Save product"}
      </SubmitButton>
    </form>
  );
}
