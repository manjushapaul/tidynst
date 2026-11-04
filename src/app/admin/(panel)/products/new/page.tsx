import type { Metadata } from "next";
import Link from "next/link";
import { AccessDenied } from "@/components/admin/access-denied";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { ProductForm } from "@/components/admin/product-form";
import { can } from "@/server/auth/permissions";
import { requireSession } from "@/server/auth/request";
import { createProductAction } from "../actions";

export const metadata: Metadata = { title: "Create product" };

export default async function NewProductPage() {
  const session = await requireSession();
  if (!can(session.user, "product.manage")) return <AccessDenied />;
  return (
    <>
      <AdminPageHeader
        title="Create product"
        description="Describe only what you have checked yourself. Do not add prices, ratings, reviews or stock claims."
        actions={
          <Link href="/admin/products" className="text-sm text-oak-deep underline underline-offset-2">
            All products
          </Link>
        }
      />
      <ProductForm csrf={session.csrfToken} action={createProductAction} mode="create" />
    </>
  );
}
