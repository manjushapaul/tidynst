"use client";

import Image from "next/image";
import { useActionState, useState } from "react";
import { FeaturedImagePicker } from "@/components/admin/featured-image-picker";
import { CsrfField, Field, FormMessage, inputClasses, SubmitButton } from "@/components/admin/form";
import { AdminCard } from "@/components/admin/admin-page-header";
import type { PickerAsset } from "@/components/admin/upload-image";
import { HOMEPAGE_LIMITS, type HomepageContent } from "@/lib/content/homepage-schema";
import { saveHomepageAction } from "./actions";

function TextField({
  label,
  name,
  defaultValue,
  error,
  hint,
  min,
  max,
  rows,
}: {
  label: string;
  name: string;
  defaultValue: string;
  error?: string;
  hint?: string;
  min?: number;
  max?: number;
  rows?: number;
}) {
  return (
    <Field label={label} error={error} hint={hint}>
      {(props) =>
        rows ? (
          <textarea
            {...props}
            name={name}
            defaultValue={defaultValue}
            required
            minLength={min}
            maxLength={max}
            rows={rows}
            className={inputClasses}
          />
        ) : (
          <input
            {...props}
            name={name}
            defaultValue={defaultValue}
            required
            minLength={min}
            maxLength={max}
            className={inputClasses}
          />
        )
      }
    </Field>
  );
}

function ImageChoice({
  name,
  imageId,
  assets,
  csrf,
  canDelete,
  usedIds,
  buttonLabel,
  hint,
  onChange,
  onUploaded,
  onDeleted,
}: {
  name: string;
  imageId: string;
  assets: PickerAsset[];
  csrf: string;
  canDelete: boolean;
  usedIds: ReadonlySet<string>;
  buttonLabel: string;
  hint: string;
  onChange: (id: string) => void;
  onUploaded: (asset: PickerAsset) => void;
  onDeleted: (id: string) => void;
}) {
  const current = assets.find((asset) => asset.id === imageId);
  return (
    <div className="flex flex-wrap items-center gap-4">
      <input type="hidden" name={name} value={imageId} />
      {current ? (
        <Image
          src={current.src}
          alt=""
          width={72}
          height={72}
          className="size-16 rounded-xl border border-line object-cover"
        />
      ) : (
        <p className="text-sm text-muted">Using the built-in image.</p>
      )}
      <div className="flex flex-col items-start gap-2">
        <FeaturedImagePicker
          csrf={csrf}
          media={assets}
          currentId={imageId}
          align="start"
          buttonLabel={imageId ? "Change image" : buttonLabel}
          hint={hint}
          canDelete={canDelete}
          usedIds={usedIds}
          onChoose={(asset) => onChange(asset.id)}
          onUploaded={(asset) => {
            onUploaded(asset);
            onChange(asset.id);
          }}
          onDeleted={(id) => {
            onDeleted(id);
            if (id === imageId) onChange("");
          }}
        />
        {imageId ? (
          <button
            type="button"
            className="text-sm text-oak-deep underline-offset-2 hover:underline"
            onClick={() => onChange("")}
          >
            Use the built-in image
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function HomepageEditor({
  csrf,
  content,
  media,
  canDelete,
}: {
  csrf: string;
  content: HomepageContent;
  media: PickerAsset[];
  canDelete: boolean;
}) {
  const [state, formAction] = useActionState(saveHomepageAction, null);
  const errors = state?.fieldErrors ?? {};
  const [assets, setAssets] = useState(media);
  const [logoId, setLogoId] = useState(content.brand.logoMediaId ?? "");
  const [heroId, setHeroId] = useState(content.hero.imageMediaId ?? "");
  const [categoryImages, setCategoryImages] = useState<Record<string, string>>(() =>
    Object.fromEntries(content.categories.map((category) => [category.slug, category.imageMediaId ?? ""])),
  );
  const [principles, setPrinciples] = useState(() =>
    content.principles.items.map((item, index) => ({ ...item, key: `point-${index}` })),
  );
  const usedIds = new Set([logoId, heroId, ...Object.values(categoryImages)].filter(Boolean));

  function addAsset(asset: PickerAsset) {
    setAssets((current) => (current.some((item) => item.id === asset.id) ? current : [asset, ...current]));
  }

  return (
    <form action={formAction} className="grid max-w-3xl gap-8">
      <CsrfField token={csrf} />
      <FormMessage state={state} />

      <AdminCard title="Logo and name">
        <div className="grid gap-4">
          <ImageChoice
            name="logoMediaId"
            imageId={logoId}
            assets={assets}
            csrf={csrf}
            canDelete={canDelete}
            usedIds={usedIds}
            buttonLabel="Choose a logo"
            hint="Square image, at least 64 × 64 px. Shown beside the site name. Leave empty to keep the built-in mark."
            onChange={setLogoId}
            onUploaded={addAsset}
            onDeleted={(id) => setAssets((current) => current.filter((asset) => asset.id !== id))}
          />
          {errors["brand.logoMediaId"] ? (
            <p className="text-xs font-medium text-danger">{errors["brand.logoMediaId"]}</p>
          ) : null}
          <TextField
            label="Site name"
            name="name"
            defaultValue={content.brand.name}
            error={errors["brand.name"]}
            min={HOMEPAGE_LIMITS.nameMin}
            max={HOMEPAGE_LIMITS.nameMax}
          />
          <TextField
            label="Tagline"
            name="tagline"
            defaultValue={content.brand.tagline}
            error={errors["brand.tagline"]}
            hint="Shown under the logo in the footer, and in the browser title."
            min={HOMEPAGE_LIMITS.taglineMin}
            max={HOMEPAGE_LIMITS.taglineMax}
          />
          <TextField
            label="Short description"
            name="description"
            defaultValue={content.brand.description}
            error={errors["brand.description"]}
            hint="The paragraph under the homepage heading, and the description search engines see."
            min={HOMEPAGE_LIMITS.descriptionMin}
            max={HOMEPAGE_LIMITS.descriptionMax}
            rows={4}
          />
        </div>
      </AdminCard>

      <AdminCard title="Opening section">
        <div className="grid gap-4">
          <TextField
            label="Small label"
            name="heroEyebrow"
            defaultValue={content.hero.eyebrow}
            error={errors["hero.eyebrow"]}
            max={HOMEPAGE_LIMITS.eyebrowMax}
          />
          <TextField
            label="Heading"
            name="heroTitle"
            defaultValue={content.hero.title}
            error={errors["hero.title"]}
            hint="First line of the main heading."
            max={HOMEPAGE_LIMITS.titleMax}
          />
          <TextField
            label="Emphasised line"
            name="heroEmphasis"
            defaultValue={content.hero.emphasis}
            error={errors["hero.emphasis"]}
            hint="Second line, shown in italic."
            max={HOMEPAGE_LIMITS.titleMax}
          />
          <TextField
            label="Button label"
            name="heroCtaLabel"
            defaultValue={content.hero.ctaLabel}
            error={errors["hero.ctaLabel"]}
            max={HOMEPAGE_LIMITS.ctaMax}
          />
          <TextField
            label="Button address"
            name="heroCtaHref"
            defaultValue={content.hero.ctaHref}
            error={errors["hero.ctaHref"]}
            hint="A page on this site, such as /categories/renters."
            max={HOMEPAGE_LIMITS.pathMax}
          />
          <ImageChoice
            name="heroImageMediaId"
            imageId={heroId}
            assets={assets}
            csrf={csrf}
            canDelete={canDelete}
            usedIds={usedIds}
            buttonLabel="Choose a photo"
            hint="Portrait photo, about 900 × 1200 px. Leave empty to keep the built-in picture."
            onChange={setHeroId}
            onUploaded={addAsset}
            onDeleted={(id) => setAssets((current) => current.filter((asset) => asset.id !== id))}
          />
          {errors["hero.imageMediaId"] ? (
            <p className="text-xs font-medium text-danger">{errors["hero.imageMediaId"]}</p>
          ) : null}
        </div>
      </AdminCard>

      <AdminCard title="Rooms">
        <div className="grid gap-4">
          <TextField
            label="Small label"
            name="roomsEyebrow"
            defaultValue={content.rooms.eyebrow}
            error={errors["rooms.eyebrow"]}
            max={HOMEPAGE_LIMITS.eyebrowMax}
          />
          <TextField
            label="Heading"
            name="roomsTitle"
            defaultValue={content.rooms.title}
            error={errors["rooms.title"]}
            max={HOMEPAGE_LIMITS.titleMax}
          />
          <TextField
            label="Introduction"
            name="roomsLead"
            defaultValue={content.rooms.lead}
            error={errors["rooms.lead"]}
            max={HOMEPAGE_LIMITS.leadMax}
            rows={3}
          />
          <TextField
            label="Card link"
            name="roomsCardLinkLabel"
            defaultValue={content.rooms.cardLinkLabel}
            error={errors["rooms.cardLinkLabel"]}
            max={HOMEPAGE_LIMITS.cardLinkMax}
          />
          {content.categories.map((category) => (
            <fieldset key={category.slug} className="grid gap-4 rounded-xl border border-line p-4">
              <legend className="px-1 font-sans text-sm font-semibold tracking-normal">
                {category.name}
                <span className="ml-2 font-normal text-muted">/{category.slug}</span>
              </legend>
              <ImageChoice
                name={`category.${category.slug}.imageMediaId`}
                imageId={categoryImages[category.slug] ?? ""}
                assets={assets}
                csrf={csrf}
                canDelete={canDelete}
                usedIds={usedIds}
                buttonLabel="Choose a card image"
                hint="Shown on the homepage card. Leave empty to keep the built-in drawing."
                onChange={(id) => setCategoryImages((current) => ({ ...current, [category.slug]: id }))}
                onUploaded={addAsset}
                onDeleted={(id) => setAssets((current) => current.filter((asset) => asset.id !== id))}
              />
              <TextField
                label="Name"
                name={`category.${category.slug}.name`}
                defaultValue={category.name}
                error={errors[`categories.${category.slug}.name`]}
                max={HOMEPAGE_LIMITS.categoryNameMax}
              />
              <TextField
                label="Navigation label"
                name={`category.${category.slug}.navLabel`}
                defaultValue={category.navLabel}
                error={errors[`categories.${category.slug}.navLabel`]}
                hint="Short name in the header and footer."
                max={HOMEPAGE_LIMITS.navLabelMax}
              />
              <TextField
                label="Description"
                name={`category.${category.slug}.description`}
                defaultValue={category.description}
                error={errors[`categories.${category.slug}.description`]}
                hint="Search description for the category page."
                min={40}
                max={HOMEPAGE_LIMITS.categoryDescriptionMax}
                rows={3}
              />
              <TextField
                label="Introduction"
                name={`category.${category.slug}.intro`}
                defaultValue={category.intro}
                error={errors[`categories.${category.slug}.intro`]}
                hint="Opening paragraph on the category page."
                min={40}
                max={HOMEPAGE_LIMITS.introMax}
                rows={4}
              />
              <TextField
                label="What it covers"
                name={`category.${category.slug}.covers`}
                defaultValue={category.covers.join("\n")}
                error={
                  errors[`categories.${category.slug}.covers`] ??
                  errors[`categories.${category.slug}.covers.0`]
                }
                hint="One line each. The homepage card shows the first two."
                rows={4}
              />
            </fieldset>
          ))}
        </div>
      </AdminCard>

      <AdminCard title="Latest guides">
        <div className="grid gap-4">
          <p className="text-sm text-muted">
            The guides themselves come from published articles. These fields are only the heading around them.
          </p>
          <TextField
            label="Small label"
            name="latestEyebrow"
            defaultValue={content.latest.eyebrow}
            error={errors["latest.eyebrow"]}
            max={HOMEPAGE_LIMITS.eyebrowMax}
          />
          <TextField
            label="Heading"
            name="latestTitle"
            defaultValue={content.latest.title}
            error={errors["latest.title"]}
            max={HOMEPAGE_LIMITS.titleMax}
          />
          <TextField
            label="Link label"
            name="latestLinkLabel"
            defaultValue={content.latest.linkLabel}
            error={errors["latest.linkLabel"]}
            max={HOMEPAGE_LIMITS.ctaMax}
          />
          <TextField
            label="Empty heading"
            name="latestEmptyTitle"
            defaultValue={content.latest.emptyTitle}
            error={errors["latest.emptyTitle"]}
            hint="Shown when nothing is published yet."
            max={HOMEPAGE_LIMITS.titleMax}
          />
          <TextField
            label="Empty message"
            name="latestEmptyBody"
            defaultValue={content.latest.emptyBody}
            error={errors["latest.emptyBody"]}
            max={HOMEPAGE_LIMITS.leadMax}
            rows={3}
          />
        </div>
      </AdminCard>

      <AdminCard title="Approach">
        <div className="grid gap-4">
          <TextField
            label="Small label"
            name="principlesEyebrow"
            defaultValue={content.principles.eyebrow}
            error={errors["principles.eyebrow"]}
            max={HOMEPAGE_LIMITS.eyebrowMax}
          />
          <TextField
            label="Heading"
            name="principlesTitle"
            defaultValue={content.principles.title}
            error={errors["principles.title"]}
            max={HOMEPAGE_LIMITS.titleMax}
          />
          {principles.map((item, index) => (
            <fieldset key={item.key} className="grid gap-3 rounded-xl border border-line p-4">
              <legend className="px-1 font-sans text-sm font-semibold tracking-normal">
                Point {index + 1}
              </legend>
              <Field label="Title" error={errors[`principles.items.${index}.title`]}>
                {(props) => (
                  <input
                    {...props}
                    name={`principleTitle.${index}`}
                    value={item.title}
                    required
                    maxLength={HOMEPAGE_LIMITS.titleMax}
                    className={inputClasses}
                    onChange={(event) =>
                      setPrinciples((current) =>
                        current.map((point) =>
                          point.key === item.key ? { ...point, title: event.target.value } : point,
                        ),
                      )
                    }
                  />
                )}
              </Field>
              <Field label="Text" error={errors[`principles.items.${index}.body`]}>
                {(props) => (
                  <textarea
                    {...props}
                    name={`principleBody.${index}`}
                    value={item.body}
                    required
                    minLength={20}
                    maxLength={HOMEPAGE_LIMITS.principleBodyMax}
                    rows={3}
                    className={inputClasses}
                    onChange={(event) =>
                      setPrinciples((current) =>
                        current.map((point) =>
                          point.key === item.key ? { ...point, body: event.target.value } : point,
                        ),
                      )
                    }
                  />
                )}
              </Field>
              {principles.length > 1 ? (
                <button
                  type="button"
                  className="justify-self-start text-sm text-oak-deep underline-offset-2 hover:underline"
                  onClick={() =>
                    setPrinciples((current) => current.filter((point) => point.key !== item.key))
                  }
                >
                  Remove this point
                </button>
              ) : null}
            </fieldset>
          ))}
          {errors["principles.items"] ? (
            <p className="text-xs font-medium text-danger">{errors["principles.items"]}</p>
          ) : null}
          {principles.length < HOMEPAGE_LIMITS.principleMax ? (
            <button
              type="button"
              className="justify-self-start text-sm font-medium text-oak-deep underline-offset-2 hover:underline"
              onClick={() =>
                setPrinciples((current) => [...current, { key: `point-${Date.now()}`, title: "", body: "" }])
              }
            >
              Add a point
            </button>
          ) : null}
        </div>
      </AdminCard>

      <AdminCard title="Footer">
        <TextField
          label="Line beside the copyright"
          name="footerNote"
          defaultValue={content.footerNote}
          error={errors.footerNote}
          max={HOMEPAGE_LIMITS.footerNoteMax}
        />
        <p className="mt-3 text-sm text-muted">
          The category links use the navigation labels above. About, editorial policy, contact, privacy and
          the affiliate disclosure stay as their own pages. The commission sentence follows whether affiliate
          links are turned on.
        </p>
      </AdminCard>

      <div className="flex items-center gap-4">
        <SubmitButton pendingLabel="Saving…">Save homepage</SubmitButton>
      </div>
    </form>
  );
}
