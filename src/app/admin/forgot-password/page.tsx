import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LogoMark } from "@/components/site/logo";
import { getSession } from "@/server/auth/request";
import { ForgotPasswordForm } from "./forgot-form";

export const metadata: Metadata = { title: "Forgot password" };

export default async function ForgotPasswordPage() {
  if (await getSession()) redirect("/admin/account");

  return (
    <main className="flex flex-1 items-center justify-center px-5 py-16">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <LogoMark className="size-11" />
          <h1 className="mt-5 text-3xl">Forgot password</h1>
          <p className="mt-2 text-sm text-muted">
            Enter your admin email and we will send a one-hour reset link.
          </p>
        </div>
        <div className="rounded-(--radius-card) border border-line bg-surface p-6 shadow-(--shadow-card) sm:p-8">
          <ForgotPasswordForm />
        </div>
        <p className="mt-6 text-center text-xs text-muted">
          Remembered it?{" "}
          <Link href="/admin/login" className="text-oak-deep underline-offset-2 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
