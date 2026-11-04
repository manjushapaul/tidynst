import type { DiffOp } from "@/lib/content/diff";

const OP_LABEL = { added: "Added", removed: "Removed", context: "Unchanged" } as const;

/** Renders a diff as text. React escapes the line contents; this must not use raw HTML. */
export function DiffBlock({ label, ops }: { label: string; ops: DiffOp[] }) {
  return (
    <section className="mt-6" aria-label={label}>
      <h3 className="font-sans text-sm font-semibold tracking-normal">{label}</h3>
      <ol className="mt-2 overflow-x-auto rounded-xl border border-line bg-sand/60 p-3 font-mono text-xs leading-relaxed">
        {ops.map((op, index) => (
          <li
            key={`${op.type}-${index}`}
            className={
              op.type === "added"
                ? "bg-oak-pale/80 text-oak-deep"
                : op.type === "removed"
                  ? "bg-danger-pale text-danger"
                  : "text-muted"
            }
          >
            <span className="sr-only">{OP_LABEL[op.type]}: </span>
            <span aria-hidden="true">{op.type === "added" ? "+ " : op.type === "removed" ? "- " : "  "}</span>
            {op.text.length > 0 ? op.text : " "}
          </li>
        ))}
      </ol>
    </section>
  );
}
