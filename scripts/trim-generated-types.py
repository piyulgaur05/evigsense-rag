#!/usr/bin/env python3
"""Reduce a freshly generated Supabase types file to the shape this app uses.

The CLI emits graphql_public and storage alongside public, and omits the
__InternalSupabase marker that pins the PostgREST version. Everything in the
app is typed against `public`, so the extra schemas only add churn to the diff.
"""
import sys

POSTGREST_VERSION = "14.5"


def block(lines, start):
    """Inclusive [start, end] for a `  key: {` block closed at the same indent."""
    depth = 0
    for i in range(start, len(lines)):
        depth += lines[i].count("{") - lines[i].count("}")
        if depth == 0:
            return start, i
    raise SystemExit("unbalanced braces in generated types")


def main(src_path: str, out_path: str) -> None:
    gen = open(src_path).read().split("\n")

    db_start = next(i for i, l in enumerate(gen) if l.startswith("export type Database = {"))
    _, db_end = block(gen, db_start)

    pub_start = next(i for i, l in enumerate(gen) if l == "  public: {")
    pub_start, pub_end = block(gen, pub_start)

    const_start = next(i for i, l in enumerate(gen) if l.startswith("export const Constants = {"))
    cpub_start = next(i for i in range(const_start, len(gen)) if gen[i] == "  public: {")
    cpub_start, cpub_end = block(gen, cpub_start)

    out = gen[:db_start]
    out += [
        "export type Database = {",
        "  // Allows to automatically instantiate createClient with right options",
        "  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)",
        "  __InternalSupabase: {",
        f'    PostgrestVersion: "{POSTGREST_VERSION}"',
        "  }",
    ]
    out += gen[pub_start : pub_end + 1]
    out.append("}")
    out += gen[db_end + 1 : const_start]
    out.append("export const Constants = {")
    out += gen[cpub_start : cpub_end + 1]
    out += ["} as const", ""]

    open(out_path, "w").write("\n".join(out))


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("usage: trim-generated-types.py <generated.ts> <out.ts>")
    main(sys.argv[1], sys.argv[2])
