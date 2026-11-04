import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { AccessDenied } from "@/components/admin/access-denied";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { Pagination } from "@/components/admin/pagination";
import { ButtonLink } from "@/components/ui/button";
import { PRODUCT_STATUS_LABELS, PRODUCT_STATUSES } from "@/lib/content/product-schema";
import { formatDate, formatDateTime } from "@/lib/format";
import { can } from "@/server/auth/permissions";
import { requireSession } from "@/server/auth/request";
import { getDb } from "@/server/db";
import { listProducts, normaliseProductQuery, type ProductQuery } from "@/server/products";

export const metadata: Metadata = { title: "Products" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

function hrefFor(query: ProductQuery, page: number): string {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.status) params.set("status", query.status);
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `/admin/products?${qs}` : "/admin/products";
}

const fieldClass = "w-full rounded-xl border border-line-strong bg-surface px-3 py-2 text-sm";

export default async function ProductsPage({ searchParams }: Props) {
  const session = await requireSession();
  if (!can(session.user, "product.manage")) return <AccessDenied />;
  const query = normaliseProductQuery(await searchParams);
  const result = await listProducts(getDb(), session.user, query);
  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));

  return (
    <>
      <AdminPageHeader
        title="Products"
        description="Editorial recommendations used in articles. No prices, ratings or stock levels are stored. Only active products appear on published articles."
        actions={<ButtonLink href="/admin/products/new">Create product</ButtonLink>}
      />
      <Form action="/admin/products" className="mb-6 grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem_auto]">
        <div>
          <label htmlFor="product-q" className="mb-1 block text-sm font-medium">
            Search name, brand or address
          </label>
          <input
            id="product-q"
            name="q"
            type="search"
            defaultValue={query.q ?? ""}
            maxLength={100}
            className={fieldClass}
          />
        </div>
        <div>
          <label htmlFor="product-status" className="mb-1 block text-sm font-medium">
            Status
          </label>
          <select id="product-status" name="status" defaultValue={query.status ?? ""} className={fieldClass}>
            <option value="">Any status</option>
            {PRODUCT_STATUSES.map((status) => (
              <option key={status} value={status}>
                {PRODUCT_STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          <button type="submit" className="rounded-full bg-oak px-4 py-2 text-sm font-medium text-white">
            Apply filters
          </button>
        </div>
      </Form>
      <p className="mb-4 text-sm text-muted">
        {result.total} {result.total === 1 ? "product" : "products"}
      </p>
      {result.items.length === 0 ? (
        <p className="rounded-xl border border-line bg-surface px-4 py-8 text-sm text-muted">
          No products match these filters.
        </p>
      ) : (
        <ul className="grid gap-3">
          {result.items.map((product) => (
            <li key={product.id} className="rounded-xl border border-line bg-surface p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="font-sans text-base font-semibold tracking-normal">
                    <Link
                      href={`/admin/products/${product.id}`}
                      className="underline-offset-2 hover:underline"
                    >
                      {product.name}
                    </Link>
                  </h2>
                  <p className="mt-1 truncate text-xs text-muted">
                    {product.brand ? `${product.brand} · ` : ""}
                    {product.slug}
                  </p>
                </div>
                <span className="rounded-full bg-sand px-2 py-0.5 text-xs font-medium">
                  {PRODUCT_STATUS_LABELS[product.status]}
                </span>
              </div>
              <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-xs text-muted">Verified</dt>
                  <dd>
                    {product.verifiedOn ? formatDate(new Date(`${product.verifiedOn}T00:00:00Z`)) : "Not yet"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Used in</dt>
                  <dd>
                    {product.publishedUses} published · {product.draftUses} working{" "}
                    {product.draftUses === 1 ? "copy" : "copies"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Updated</dt>
                  <dd>
                    <time dateTime={product.updatedAt.toISOString()}>
                      {formatDateTime(product.updatedAt)}
                    </time>
                  </dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
      )}
      <Pagination page={result.page} totalPages={totalPages} hrefFor={(page) => hrefFor(query, page)} />
    </>
  );
}
