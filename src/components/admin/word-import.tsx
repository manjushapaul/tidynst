"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { fileInputClasses } from "@/components/admin/form";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

type PlanItem = {
  number: number;
  title: string;
  action: "create" | "update" | "skip";
  guideId: string | null;
  published: boolean;
  notes: string[];
  problems: string[];
};

type ResultItem = {
  number: number;
  title: string;
  outcome: "created" | "updated" | "unchanged" | "skipped" | "failed";
  guideId: string | null;
  inReview: boolean;
  message: string | null;
  notes: string[];
};

type Response =
  | { ok: true; problems: string[]; plan: PlanItem[] }
  | { ok: true; problems: string[]; results: ResultItem[] }
  | { ok: false; message: string };

const ACTION_LABELS: Record<PlanItem["action"], string> = {
  create: "New draft",
  update: "Update",
  skip: "Skip",
};

const OUTCOME_LABELS: Record<ResultItem["outcome"], string> = {
  created: "Created",
  updated: "Updated",
  unchanged: "No changes",
  skipped: "Skipped",
  failed: "Failed",
};

function Badge({ tone, children }: { tone: "ok" | "info" | "warn"; children: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold",
        tone === "ok" && "bg-oak-pale text-oak-deep",
        tone === "info" && "bg-sand text-ink",
        tone === "warn" && "bg-danger-pale text-danger",
      )}
    >
      {children}
    </span>
  );
}

function Lines({ items, tone }: { items: string[]; tone: "muted" | "danger" }) {
  if (!items.length) return null;
  return (
    <ul className={cn("mt-2 space-y-1 text-sm", tone === "danger" ? "text-danger" : "text-muted")}>
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

export function WordImport({ csrf }: { csrf: string }) {
  const inputId = useId();
  const [file, setFile] = useState<File | null>(null);
  const [submitForReview, setSubmitForReview] = useState(false);
  const [busy, setBusy] = useState<"preview" | "apply" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [plan, setPlan] = useState<PlanItem[] | null>(null);
  const [results, setResults] = useState<ResultItem[] | null>(null);

  function reset() {
    setError(null);
    setProblems([]);
    setPlan(null);
    setResults(null);
  }

  async function send(mode: "preview" | "apply") {
    if (!file) return;
    setBusy(mode);
    setError(null);
    const body = new FormData();
    body.set("csrf", csrf);
    body.set("file", file);
    body.set("mode", mode);
    if (submitForReview) body.set("submitForReview", "on");
    try {
      const response = await fetch("/admin/guides/import/run", { method: "POST", body });
      const data = (await response.json()) as Response;
      if (!data.ok) {
        setError(data.message);
      } else if ("plan" in data) {
        setProblems(data.problems);
        setPlan(data.plan);
        setResults(null);
      } else {
        setProblems(data.problems);
        setResults(data.results);
        setPlan(null);
      }
    } catch {
      setError("The document could not be sent. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  }

  const importable = plan?.filter((item) => item.action !== "skip").length ?? 0;

  return (
    <div className="grid gap-6">
      <section className="rounded-(--radius-card) border border-line bg-surface p-5 sm:p-6">
        <h2 className="font-sans text-base font-semibold tracking-normal">1. Choose the Word document</h2>
        <div className="mt-4 grid gap-4">
          <div className="space-y-1.5">
            <label htmlFor={inputId} className="block text-sm font-medium">
              Word document (.docx)
            </label>
            <input
              id={inputId}
              type="file"
              accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className={fileInputClasses}
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null);
                reset();
              }}
            />
            <p className="text-xs text-muted">
              One document can hold many articles, each between <code>=== ARTICLE START ===</code> and{" "}
              <code>=== ARTICLE END ===</code>. Pictures in the document are ignored; add images in the editor
              afterwards.
            </p>
          </div>
          <label className="flex items-start gap-2.5 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 size-4 accent-oak"
              checked={submitForReview}
              onChange={(event) => {
                setSubmitForReview(event.target.checked);
                setPlan(null);
                setResults(null);
              }}
            />
            <span>
              Submit every imported article for review
              <span className="block text-xs text-muted">
                Otherwise only articles marked <code>submitForReview: true</code> in the document are
                submitted.
              </span>
            </span>
          </label>
          <div>
            <Button size="sm" disabled={!file || busy !== null} onClick={() => send("preview")}>
              {busy === "preview" ? "Reading…" : "Preview import"}
            </Button>
          </div>
          {error ? (
            <p role="alert" className="rounded-xl bg-danger-pale px-4 py-3 text-sm text-danger">
              {error}
            </p>
          ) : null}
        </div>
      </section>

      {problems.length ? (
        <div role="alert" className="rounded-xl bg-danger-pale px-4 py-3 text-sm text-danger">
          {problems.map((problem) => (
            <p key={problem}>{problem}</p>
          ))}
        </div>
      ) : null}

      {plan ? (
        <section className="rounded-(--radius-card) border border-line bg-surface p-5 sm:p-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="font-sans text-base font-semibold tracking-normal">2. Check what will happen</h2>
              <p className="mt-1 text-sm text-muted">
                {plan.filter((item) => item.action === "create").length} new ·{" "}
                {plan.filter((item) => item.action === "update").length} updates ·{" "}
                {plan.filter((item) => item.action === "skip").length} skipped. Nothing has changed yet.
              </p>
            </div>
            <Button size="sm" disabled={importable === 0 || busy !== null} onClick={() => send("apply")}>
              {busy === "apply"
                ? "Importing…"
                : `Import ${importable} ${importable === 1 ? "article" : "articles"}`}
            </Button>
          </div>
          <ol className="mt-5 divide-y divide-line">
            {plan.map((item) => (
              <li key={item.number} className="py-3.5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="font-medium">
                    <span className="text-muted tabular-nums">{item.number}.</span> {item.title}
                  </p>
                  <Badge tone={item.action === "skip" ? "warn" : item.action === "create" ? "ok" : "info"}>
                    {ACTION_LABELS[item.action]}
                  </Badge>
                </div>
                <Lines items={item.problems} tone="danger" />
                <Lines items={item.notes} tone="muted" />
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {results ? (
        <section className="rounded-(--radius-card) border border-line bg-surface p-5 sm:p-6">
          <h2 className="font-sans text-base font-semibold tracking-normal">Import finished</h2>
          <p className="mt-1 text-sm text-muted">
            Imported articles are drafts. Add images, check them and publish from each article’s page.
          </p>
          <ol className="mt-5 divide-y divide-line">
            {results.map((item) => (
              <li key={item.number} className="py-3.5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="font-medium">
                    <span className="text-muted tabular-nums">{item.number}.</span>{" "}
                    {item.guideId && item.outcome !== "skipped" && item.outcome !== "failed" ? (
                      <Link
                        href={`/admin/guides/${item.guideId}`}
                        className="text-oak-deep underline-offset-2 hover:underline"
                      >
                        {item.title}
                      </Link>
                    ) : (
                      item.title
                    )}
                  </p>
                  <span className="flex gap-1.5">
                    {item.inReview ? <Badge tone="info">In review</Badge> : null}
                    <Badge
                      tone={
                        item.outcome === "skipped" || item.outcome === "failed"
                          ? "warn"
                          : item.outcome === "unchanged"
                            ? "info"
                            : "ok"
                      }
                    >
                      {OUTCOME_LABELS[item.outcome]}
                    </Badge>
                  </span>
                </div>
                <Lines
                  items={item.message ? [item.message] : []}
                  tone={item.outcome === "failed" || item.outcome === "skipped" ? "danger" : "muted"}
                />
                {item.outcome !== "skipped" && item.outcome !== "failed" ? (
                  <Lines items={item.notes} tone="muted" />
                ) : null}
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </div>
  );
}
