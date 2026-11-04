import Link from "next/link";
import Image from "next/image";
import { type AdminNavItem, AdminNav } from "@/components/admin/admin-nav";
import { CsrfField } from "@/components/admin/form";
import { LogoMark } from "@/components/site/logo";
import { can, ROLE_LABELS } from "@/server/auth/permissions";
import { requireSession } from "@/server/auth/request";
import { countUnreadMessages } from "@/server/contact-messages";
import { getDb } from "@/server/db";
import { getPublicHomepage } from "@/server/homepage";
import { site } from "@/lib/site";
import { logoutAction } from "./actions";

export default async function AdminPanelLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const { user } = session;
  let brandName: string = site.name;
  let brandLogo: { src: string; alt: string; width: number; height: number } | null = null;
  try {
    const home = await getPublicHomepage(getDb());
    brandName = home.name;
    brandLogo = home.logo;
  } catch {
    brandName = site.name;
  }
  const unreadMessages = can(user, "message.manage") ? await countUnreadMessages(getDb()).catch(() => 0) : 0;

  const items: AdminNavItem[] = [
    { href: "/admin", label: "Dashboard" },
    ...(can(user, "site.manage") ? [{ href: "/admin/homepage", label: "Homepage" }] : []),
    ...(can(user, "site.manage") ? [{ href: "/admin/categories", label: "Categories" }] : []),
    ...(can(user, "analytics.view") ? [{ href: "/admin/traffic", label: "Traffic" }] : []),
    { href: "/admin/guides", label: "Articles" },
    ...(can(user, "guide.editAny") ? [{ href: "/admin/seo", label: "SEO health" }] : []),
    ...(can(user, "guide.review") ? [{ href: "/admin/reviews", label: "Content review" }] : []),
    ...(can(user, "message.manage")
      ? [{ href: "/admin/messages", label: "Messages", count: unreadMessages }]
      : []),
    ...(can(user, "topic.manage") ? [{ href: "/admin/topics", label: "Topics" }] : []),
    ...(can(user, "product.manage") ? [{ href: "/admin/products", label: "Products" }] : []),
    ...(can(user, "media.upload") ? [{ href: "/admin/media", label: "Media" }] : []),
    ...(can(user, "audit.view") ? [{ href: "/admin/audit", label: "Audit Log" }] : []),
    { href: "/admin/account", label: "Account" },
    ...(can(user, "user.manage") ? [{ href: "/admin/users", label: "Users" }] : []),
  ];

  return (
    <div className="flex flex-1 flex-col lg:flex-row">
      <aside className="border-b border-line bg-surface lg:sticky lg:top-0 lg:flex lg:h-dvh lg:w-60 lg:shrink-0 lg:flex-col lg:border-r lg:border-b-0">
        <div className="flex items-center justify-between gap-4 px-5 pt-4 lg:block lg:px-5 lg:pt-6">
          <Link href="/admin" className="inline-flex items-center gap-2 rounded-lg">
            {brandLogo ? (
              <Image
                src={brandLogo.src}
                alt=""
                width={28}
                height={28}
                className="size-7 rounded-lg object-cover"
              />
            ) : (
              <LogoMark className="size-7" />
            )}
            <span className="font-serif text-lg">{brandName}</span>
            <span className="rounded-full bg-sand px-2 py-0.5 text-[calc(0.7rem*var(--text-scale))] font-medium text-muted">
              Admin
            </span>
          </Link>
          <Link href="/" className="text-xs text-muted underline-offset-2 hover:underline lg:mt-3 lg:block">
            View site
          </Link>
        </div>
        <div className="px-4 py-3 lg:mt-6 lg:flex-1">
          <AdminNav items={items} />
        </div>
        <div className="hidden border-t border-line px-5 py-4 lg:block">
          <p className="truncate text-sm font-medium">{user.name}</p>
          <p className="truncate text-xs text-muted">
            {ROLE_LABELS[user.role]} · {user.email}
          </p>
          <form action={logoutAction} className="mt-3">
            <CsrfField token={session.csrfToken} />
            <button type="submit" className="text-sm text-oak-deep underline-offset-2 hover:underline">
              Sign out
            </button>
          </form>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between border-b border-line px-5 py-2.5 text-sm lg:hidden">
          <span className="truncate text-muted">
            {user.name} · {ROLE_LABELS[user.role]}
          </span>
          <form action={logoutAction}>
            <CsrfField token={session.csrfToken} />
            <button type="submit" className="text-oak-deep underline-offset-2 hover:underline">
              Sign out
            </button>
          </form>
        </div>
        <main id="main" className="flex-1 px-5 py-8 sm:px-8 lg:px-12 lg:py-10">
          {children}
        </main>
      </div>
    </div>
  );
}
