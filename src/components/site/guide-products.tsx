import Link from "next/link";
import { affiliateLinksEnabled, productLinkRel } from "@/lib/affiliate";
import { site } from "@/lib/site";
import type { PublicProduct } from "@/server/public-content";

export function GuideProducts({ products, siteName = site.name }: { products: readonly PublicProduct[]; siteName?: string }) {
  if (products.length === 0) return null;
  const affiliate = affiliateLinksEnabled();
  return (
    <section aria-labelledby="products-heading" className="mt-14 border-t border-line pt-10">
      <h2 id="products-heading" className="text-2xl">
        Products mentioned in this guide
      </h2>
      <p className="mt-3 rounded-xl bg-oak-pale/70 px-4 py-3 text-sm text-ink">
        {affiliate ? (
          <>
            Some links below are affiliate links: if you buy through them, {siteName} may earn a commission
            at no extra cost to you. This never affects what we recommend.{" "}
          </>
        ) : (
          <>We do not earn commission from these links. </>
        )}
        Details come from the manufacturer or seller; please check the listing before you buy.{" "}
        <Link href="/affiliate-disclosure" className="underline underline-offset-2">
          Our disclosure
        </Link>
      </p>
      <ol className="mt-6 grid gap-4">
        {products.map((product) => (
          <li key={product.id} className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="max-w-xl">
                <h3 className="text-lg">{product.name}</h3>
                {product.brand ? <p className="mt-0.5 text-sm text-muted">By {product.brand}</p> : null}
                <p className="mt-3 leading-relaxed">{product.summary}</p>
                {product.note ? (
                  <p className="mt-2 text-sm leading-relaxed text-muted">{product.note}</p>
                ) : null}
              </div>
              {product.productUrl ? (
                <a
                  href={product.productUrl}
                  rel={productLinkRel()}
                  className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-full border border-line-strong px-4 py-2 text-sm font-medium transition-colors hover:border-oak hover:text-oak-deep"
                >
                  View{product.merchantName ? ` at ${product.merchantName}` : " product"}
                  <span aria-hidden="true">↗</span>
                </a>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
