# Closing Gap Workspace

A central React/TypeScript workspace with a Vercel Node.js API, Neon Postgres persistence, private Vercel Blob document storage, user administration, an integrated Vault, and environment-driven launch links for the existing Closing Gap applications.

## Requirements

- Node.js 20 or newer
- npm 10 or newer
- A Neon Postgres connection string
- A private Vercel Blob store token
- Vercel CLI for local full-stack development and deployment

## Configuration

Copy `.env.example` to `.env.local`, then replace every placeholder. Server-only values must never use a `VITE_` prefix because Vite embeds those variables in browser JavaScript.

The first API request applies the idempotent Postgres schema and creates the bootstrap administrator when no users exist. Changing the `WORKSPACE_ADMIN_*` variables later does not overwrite an existing account.

Important server variables:

- `DATABASE_URL`: pooled Neon connection string.
- `BLOB_READ_WRITE_TOKEN`: token for a Blob store configured with private access.
- `WORKSPACE_SESSION_SECRET`: random value of at least 32 characters used to sign session cookies.
- `WORKSPACE_ADMIN_*`: one-time administrator bootstrap values.
- `WORKSPACE_MAX_UPLOAD_MB`: upload limit; defaults to 20.

## Development

From `workspace-shell`:

```powershell
npm install
npx vercel link
npx vercel env pull .env.local
npx vercel dev
```

`vercel dev` runs the Vite frontend and the TypeScript function together, including the compatibility route at `/api/index.php`. The standalone To-Do, CG Studio, and Finora applications retain their own runtimes, databases, and authentication.

## Validation

```powershell
npm run lint
npm run build
npm audit --omit=dev
```

To exercise a deployed environment end to end without retaining test data:

```powershell
$env:WORKSPACE_SMOKE_URL='https://your-workspace-domain.example'
$env:WORKSPACE_ADMIN_USERNAME='your-admin'
$env:WORKSPACE_ADMIN_PASSWORD='your-password'
npm run smoke:production
```

The smoke test covers authentication, CSRF protection, folder and document writes, private Blob preview/copy/version/delete, search, user administration, cleanup, logout, and session revocation.

## Deployment

The project is linked to the Vercel project `workspace`. Neon and private Blob integrations inject their credentials into Vercel environments. Deploy production with:

```powershell
npx vercel deploy --prod
```

Frontend launch URLs are build-time values and require a new deployment after they change. The Vercel rewrite in `vercel.json` preserves the frontend's existing `/api/index.php` calls while routing them to `api/index.ts`; all other non-file routes fall back to the Vite SPA.

The former PHP/SQLite Workspace API is retained in `legacy-php-api` as a rollback reference only. It is not routed or deployed by the current Vercel configuration.

## Security model

- Bcrypt password hashes; plaintext passwords are never stored.
- HMAC-signed, `HttpOnly`, `Secure`, `SameSite=Strict` session cookies.
- Postgres-backed session-version checks and logout/password-change revocation.
- CSRF tokens on every authenticated mutation.
- Login rate limiting and generic invalid-credential errors.
- Active-account, role, visibility, and ownership checks on every protected operation.
- Allowlisted upload types, filename sanitization, size limits, and private Blob objects.
- Vault metadata and version history in Neon; document bytes are streamed through authenticated API routes and are never exposed through public Blob URLs.

