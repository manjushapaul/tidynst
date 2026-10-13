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

- **Owner** — everything, including user management and the audit log.
- **Editor** — create and edit any guide, review, publish, manage products and media.
- **Author** — create and edit their own guides and submit them for review.

Sessions last at most 24 hours and end after 4 hours of inactivity. Changing a password, changing a role or
disabling a user signs that user out everywhere. Sign-in is rate limited per account (5 attempts per 15 minutes)
and per IP address (30 attempts per 15 minutes).

Further documentation lives in `docs/`.
