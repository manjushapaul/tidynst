"use client";

import { createContext, type ReactNode, use, useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

type Result = { ok: boolean; message: string | null } | null;
export type Announcement = { id: number; ok: boolean; message: string };

type Context = { announcement: Announcement | null; announce: (result: Result) => void };

const WorkflowStatusContext = createContext<Context | null>(null);

/** The next announcement for an action result, or null when there is nothing to say. */
export function nextAnnouncement(previous: Announcement | null, result: Result): Announcement | null {
  if (!result?.message) return null;
  return { id: (previous?.id ?? 0) + 1, ok: result.ok, message: result.message };
}

/**
 * Holds the outcome of review and publishing actions above the forms that trigger them. Those forms
 * disappear when the workflow state changes, so their own messages would vanish with them.
 * `resetKey` clears a stale outcome when the content changes (for example after a save).
 */
export function WorkflowStatusProvider({ resetKey, children }: { resetKey: string; children: ReactNode }) {
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const [seenKey, setSeenKey] = useState(resetKey);
  if (seenKey !== resetKey) {
    setSeenKey(resetKey);
    setAnnouncement(null);
  }
  const announce = useCallback((result: Result) => {
    setAnnouncement((previous) => nextAnnouncement(previous, result) ?? previous);
  }, []);
  return <WorkflowStatusContext value={{ announcement, announce }}>{children}</WorkflowStatusContext>;
}

/** Reports an action result to the surrounding provider, if there is one. */
export function useWorkflowAnnounce(): ((result: Result) => void) | null {
  return use(WorkflowStatusContext)?.announce ?? null;
}

/**
 * Live regions that stay mounted, so screen readers announce each new outcome. After a success,
 * focus moves to the message because the button that was pressed has usually gone.
 */
export function WorkflowStatusRegion({ className }: { className?: string }) {
  const announcement = use(WorkflowStatusContext)?.announcement ?? null;
  const successRef = useRef<HTMLParagraphElement>(null);
  const success = announcement?.ok ? announcement : null;
  const failure = announcement && !announcement.ok ? announcement : null;

  useEffect(() => {
    if (success) successRef.current?.focus();
  }, [success]);

  return (
    <div className={cn(announcement ? "mb-4" : null, className)}>
      <div role="status" aria-live="polite" aria-atomic="true">
        {success ? (
          <p
            key={success.id}
            ref={successRef}
            tabIndex={-1}
            className="rounded-xl bg-oak-pale px-4 py-3 text-sm text-oak-deep focus:outline-2 focus:outline-oak"
          >
            {success.message}
          </p>
        ) : null}
      </div>
      <div role="alert" aria-atomic="true">
        {failure ? (
          <p key={failure.id} className="rounded-xl bg-danger-pale px-4 py-3 text-sm text-danger">
            {failure.message}
          </p>
        ) : null}
      </div>
    </div>
  );
}
