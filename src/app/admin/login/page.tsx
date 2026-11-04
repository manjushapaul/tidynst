import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LogoMark } from "@/components/site/logo";
import { getSession } from "@/server/auth/request";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

type Props = { searchParams: Promise<{ reset?: string }> };

export default async function LoginPage({ searchParams }: Props) {
  if (await getSession()) redirect("/admin");
  const { reset } = await searchParams;

  return (
    <main className="flex flex-1 items-center justify-center px-5 py-16">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <LogoMark className="size-11" />
          <h1 className="mt-5 text-3xl">Sign in</h1>
          <p className="mt-2 text-sm text-muted">TidyNest editorial admin</p>
        </div>
        {reset === "1" ? (
          <p
            role="status"
            className="mb-4 rounded-(--radius-card) border border-line bg-oak-pale px-4 py-3 text-sm text-oak-deep"
          >
            Your password was updated. Sign in with your new password.
          </p>
        ) : null}
        <div className="rounded-(--radius-card) border border-line bg-surface p-6 shadow-(--shadow-card) sm:p-8">
          <LoginForm />
          <p className="mt-4 text-center text-sm">
            <Link href="/admin/forgot-password" className="text-oak-deep underline-offset-2 hover:underline">
              Forgot password?
            </Link>
          </p>
        </div>
        <p className="mt-6 text-center text-xs text-muted">
          Accounts are created by the site owner. There is no public registration.
        </p>
      </div>
    </main>
  );
}
