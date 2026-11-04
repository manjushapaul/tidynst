# TidyNest

An editorial website about organising small Indian homes and apartments, with a database-backed CMS at `/admin`.

Stack: Next.js (App Router), React, strict TypeScript, Tailwind CSS v4, PostgreSQL (Neon in hosted environments) and Drizzle ORM.

## Scripts

| Command                      | What it does                                                   |
| ---------------------------- | -------------------------------------------------------------- |
| `npm run dev`                | Local development server                                       |
| `npm run build`              | Production build                                               |
| `npm run check`              | Typecheck, lint, formatting check and all tests                |
| `npm test`                   | Automated tests (Vitest)                                       |
| `npm run format`             | Format every file with Prettier                                |
| `npm run db:migrate`         | Apply migrations to an explicitly named target (`--target=…`)  |
| `npm run admin:create-owner` | Create the first owner account (refuses if one already exists) |
| `npm run qa:db`              | Start, stop or destroy the disposable local QA PostgreSQL      |
| `npm run qa:seed`            | Seed synthetic QA content into the local QA database only      |

## Admin accounts

There is no public registration. The first owner is created from a terminal:

```sh
npm run db:migrate -- --target=development
npm run admin:create-owner -- --target=development --email=you@example.com --name="Your Name"
```

The password is read from a hidden prompt (or `--password-stdin`) and is never accepted as a command-line
argument. Every other account is created by an owner under **Admin → Users**.

Roles:

- **Owner** — everything, including user management. The owner may approve and publish their own articles;
  each self-approval is recorded in the audit log.
- **Editor** — create and edit any article, review, publish, manage products and media, and view the audit
  log. Editors cannot approve an article they wrote or submitted.
- **Author** — create and edit their own articles and submit them for review.

The admin calls content items "articles". Internally (database tables, permission keys, code) and in public
URLs they are still `guides`, so `/guides/<slug>` addresses do not change.

Publishing workflow: save → submit for review → approve (or request changes) → publish. An approval covers
one exact saved revision and content hash; any later saved change makes it stale and the article must be
submitted again. Publishing re-checks the approval, the publication rules, linked products (must be active),
topics and images inside one database transaction. Unpublishing needs a confirmation and a reason, keeps the
address, revisions and review history, and makes the public page return 404.

Sessions last at most 24 hours and end after 4 hours of inactivity. Changing a password, changing a role or
disabling a user signs that user out everywhere. Sign-in is rate limited per account (5 attempts per 15 minutes)
and per IP address (30 attempts per 15 minutes).

## Media storage (Vercel Blob)

Article images are inspected and optimised with Sharp (resize without upscaling, WebP conversion,
optional responsive widths), then stored in a **private** Vercel Blob store. Neon holds metadata
only (URLs/keys, dimensions, alt text, SHA-256). Public and staff access still go through
`/media/[id]/[filename]` so draft images are never exposed via raw object URLs.

Required environment variable (server-only):

```sh
BLOB_READ_WRITE_TOKEN=
```

Create a private Blob store in the Vercel dashboard (or `vercel blob create-store --access private`),
link it to the project, and copy the read-write token into `.env.local` for development/QA. Without
the token, new uploads fall back to legacy Postgres `bytea` so local work still functions; production
should always configure Blob.

Apply the media migration before relying on object-backed rows:

```sh
npm run db:migrate -- --target=development
# or --target=qa  (do not migrate production from this workflow unless explicitly requested)
```

Further documentation lives in `docs/`.
