# Closing Gap Workspace

A mobile-first React/TypeScript operations hub with a Vercel Node.js API, Neon Postgres persistence, a native team To-Do board, private Vercel Blob document storage, user administration, an integrated Vault, and a searchable directory for Closing Gap tools, brands, and websites.

Workspace includes persistent per-device application favourites and recents, a mobile bottom navigation, an installable PWA shell, and connected launch entries for Prospector, CW Watch, MitDir, Crestfield, and the Closing Gap website. External applications open in a separate browser tab so their independent authentication and security policies continue to work correctly. Vault also includes an administrator-only Asset Register for SIMs, devices, software and other company property, including assignment, registration, provider, status, recurring cost and renewal metadata.

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
- `WORKSPACE_VAULT_ENCRYPTION_KEY`: base64-encoded 32-byte key used for authenticated encryption of stored credentials. Back it up securely; losing it makes the encrypted records unrecoverable.
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

`vercel dev` runs the Vite frontend and the TypeScript function together, including the compatibility route at `/api/index.php`. To-Do is available at `/todo` and shares Workspace authentication and Neon persistence. The original PHP/SQLite To-Do folder remains unchanged as the interface reference. CG Studio and Finora retain their own runtimes, databases, and authentication.

The legacy To-Do records have been imported into Neon. A guarded migration utility remains available for disaster recovery; it refuses to run against a non-empty task table unless the operator explicitly acknowledges possible ID conflicts:

```powershell
npm run migrate:todo
```

The utility reads `todo (2)/api/database/tasks.db`, requires Python's standard `sqlite3` module, and uses `DATABASE_URL` for the destination.

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

The smoke test covers authentication, CSRF protection, To-Do CRUD/checklists/comments/recurrence, folder and document writes, private Blob preview/copy/version/delete, search, user administration, cleanup, logout, and session revocation.

## Deployment

The project is linked to the Vercel project `workspace`. Neon and private Blob integrations inject their credentials into Vercel environments. Deploy production with:

```powershell
npx vercel deploy --prod
```

Frontend launch URLs are build-time values and require a new deployment after they change. The application registry is organized into Workspace, business operations, and brands/websites groups in `src/config/apps.ts`. The Vercel rewrite in `vercel.json` preserves the frontend's existing `/api/index.php` calls while routing them to `api/index.ts`; all other non-file routes fall back to the Vite SPA.

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
- Team tasks, checklists, comments, recurring schedules, and To-Do activity are stored in Neon and are accessible only through authenticated Workspace API calls.
- Tool credentials are administrator-only. Usernames, emails, passwords, and secure notes use AES-256-GCM application-level encryption; passwords are omitted from lists and require Workspace-password re-authentication before a time-limited reveal.
- Company assets are maintained in an administrator-only register. Asset creation, changes, and deletion are recorded in Workspace activity, while unique identifiers prevent duplicate SIMs or serial numbers.
