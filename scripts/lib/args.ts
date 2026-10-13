/** Parses `--key=value` and `--flag` arguments. */
export function parseArgs(argv: readonly string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (const arg of argv) {
    const match = /^--([a-z][a-z0-9-]*)(?:=(.*))?$/.exec(arg);
    if (match?.[1]) args[match[1]] = match[2] ?? "true";
  }
  return args;
}
