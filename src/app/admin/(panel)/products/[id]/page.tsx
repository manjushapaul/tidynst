import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AccessDenied } from "@/components/admin/access-denied";
import { AdminCard, AdminPageHeader } from "@/components/admin/admin-page-header";
import { ProductForm } from "@/components/admin/product-form";
import { PRODUCT_STATUS_LABELS } from "@/lib/content/product-schema";
import { formatDateTime } from "@/lib/format";
import { can } from "@/server/auth/permissions";
import { requireSession } from "@/server/auth/request";
import { getDb } from "@/server/db";
import { getProduct } from "@/server/products";
import { updateProductAction } from "../actions";

export const metadata: Metadata = { title: "Edit product" };

type Props = { params: Promise<{ id: string }> };

export default async function EditProductPage({ params }: Props) {
  const { id } = await params;
  const session = await requireSession();
  if (!can(session.user, "product.manage")) return <AccessDenied />;
  const product = await getProduct(getDb(), session.user, id);
  if (!product) notFound();

  return (
    <>
      <AdminPageHeader
        title={product.input.name}
        description={`${PRODUCT_STATUS_LABELS[product.status]} · version ${product.version} · updated ${formatDateTime(product.updatedAt)}${product.updatedByName ? ` by ${product.updatedByName}` : ""}`}
        actions={
          <Link href="/admin/products" className="text-sm text-oak-deep underline underline-offset-2">
            All products
          </Link>
        }
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <ProductForm
          csrf={session.csrfToken}
          action={updateProductAction}
          mode="edit"
          productId={product.id}
          version={product.version}
          initial={product.input}
          savedStatus={product.status}
          publishedUses={product.publishedUses.map((use) => ({ id: use.id, title: use.title }))}
        />
        <AdminCard title="Where it is used">
          <p className="text-sm text-muted">
            {product.draftUses === 1
              ? "1 working copy references this product."
              : `${product.draftUses} working copies reference this product.`}{" "}
            Products are never deleted; retire them instead.
          </p>
          {product.publishedUses.length > 0 ? (
            <>
              <h3 className="mt-4 text-xs font-medium text-muted">Live on published articles</h3>
              <ul className="mt-2 space-y-1 text-sm">
                {product.publishedUses.map((use) => (
                  <li key={use.id}>
                    <Link href={`/admin/guides/${use.id}`} className="underline underline-offset-2">
                      {use.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="mt-3 text-sm text-muted">No published article shows this product.</p>
          )}
          {can(session.user, "audit.view") ? (
            <p className="mt-4 text-sm">
              <Link
                href={`/admin/audit?entityType=product&entityId=${product.id}`}
                className="text-oak-deep underline underline-offset-2"
              >
                Product activity in the audit log
              </Link>
            </p>
          ) : null}
        </AdminCard>
      </div>
    </>
  );
}
