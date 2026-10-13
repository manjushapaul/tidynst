import Link from "next/link";
import { type AdminNavItem, AdminNav } from "@/components/admin/admin-nav";
import { CsrfField } from "@/components/admin/form";
import { LogoMark } from "@/components/site/logo";
import { can, ROLE_LABELS } from "@/server/auth/permissions";
import { requireSession } from "@/server/auth/request";
import { logoutAction } from "./actions";

export default async function AdminPanelLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const { user } = session;

  const items: AdminNavItem[] = [
    { href: "/admin", label: "Dashboard" },
    { href: "/admin/account", label: "Account" },
    ...(can(user, "user.manage") ? [{ href: "/admin/users", label: "Users" }] : []),
  ];

  return (
    <div className="flex flex-1 flex-col lg:flex-row">
      <aside className="border-b border-line bg-surface lg:sticky lg:top-0 lg:flex lg:h-dvh lg:w-60 lg:shrink-0 lg:flex-col lg:border-r lg:border-b-0">
        <div className="flex items-center justify-between gap-4 px-5 pt-4 lg:block lg:px-5 lg:pt-6">
          <Link href="/admin" className="inline-flex items-center gap-2 rounded-lg">
            <LogoMark className="size-7" />
            <span className="font-serif text-lg">TidyNest</span>
            <span className="rounded-full bg-sand px-2 py-0.5 text-[0.7rem] font-medium text-muted">
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
            <button type="submit" className="text-sm text-sage-deep underline-offset-2 hover:underline">
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
            <button type="submit" className="text-sage-deep underline-offset-2 hover:underline">
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
