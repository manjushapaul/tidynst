import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LogoMark } from "@/components/site/logo";
import { passwordResetTokenIsValid } from "@/server/auth/password-reset";
import { getSession } from "@/server/auth/request";
import { getDb } from "@/server/db";
import { ResetPasswordForm } from "./reset-form";

export const metadata: Metadata = { title: "Reset password" };

type Props = { searchParams: Promise<{ token?: string }> };

export default async function ResetPasswordPage({ searchParams }: Props) {
  if (await getSession()) redirect("/admin/account");

  const { token } = await searchParams;
  const valid = typeof token === "string" && (await passwordResetTokenIsValid(getDb(), token));

  return (
    <main className="flex flex-1 items-center justify-center px-5 py-16">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <LogoMark className="size-11" />
          <h1 className="mt-5 text-3xl">Reset password</h1>
          <p className="mt-2 text-sm text-muted">
            {valid ? "Choose a new password for your admin account." : "This reset link is not valid."}
          </p>
        </div>
        <div className="rounded-(--radius-card) border border-line bg-surface p-6 shadow-(--shadow-card) sm:p-8">
          {valid && token ? (
            <ResetPasswordForm token={token} />
          ) : (
            <p className="text-sm text-muted">
              The link may have expired or already been used.{" "}
              <Link href="/admin/forgot-password" className="text-oak-deep underline-offset-2 hover:underline">
                Request a new one
              </Link>
              .
            </p>
          )}
        </div>
        <p className="mt-6 text-center text-xs text-muted">
          <Link href="/admin/login" className="text-oak-deep underline-offset-2 hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
