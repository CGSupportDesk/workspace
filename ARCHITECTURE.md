# Workspace architecture

## Existing applications

The source folder contains three legacy applications. Their source remains preserved; To-Do now also has a Workspace-native production implementation.

| Application | Folder | Runtime | Local development URL |
| --- | --- | --- | --- |
| To-Do reference | `todo (2)` | Static HTML/CSS/JavaScript with PHP + SQLite API | `http://localhost:8081` |
| CG Studio | `cgstudio` | Pre-built Vite/React static site | `http://localhost:8082` |
| Finora | `Finora` | Static HTML/CSS/JavaScript with PHP + SQLite API | `http://localhost:8083` |

Workspace opens configured production URLs for CG Studio and Finora; it does not imply cross-application SSO for those tools.

## Workspace application

`workspace-shell` is the central application:

- React, TypeScript, and Vite provide the browser interface.
- `api/index.ts` is a Vercel Node.js function and the only public backend entry point.
- `server/db.ts` applies the idempotent Neon Postgres schema and owns users, session versions, Vault metadata, document versions, activity, and login attempts.
- `server/security.ts` signs and validates first-party session cookies and CSRF state.
- `server/blob.ts` writes, copies, reads, and deletes private Vercel Blob objects.
- `server/todo.ts` implements the replicated To-Do API against Neon, including tasks, recurring schedules, checklists, comments, and activity.
- `public/todo/index.html` preserves the existing board/calendar/focus/dashboard interface while replacing its PHP calls with authenticated Workspace API actions. It is presented inside the protected `/todo` route.
- `vercel.json` maps legacy-compatible `/api/index.php` calls to the Node function and provides SPA fallback routing.

## Request and data flow

1. The browser calls `/api/index.php?action=...` on the same origin.
2. Vercel rewrites the request to the TypeScript function.
3. The function validates the signed session, current Postgres session version, CSRF token, role, and resource ownership.
4. Users, tasks, comments, checklists, activity, and Vault metadata are read or written in Neon.
5. Document bytes are written to a private Blob store. Downloads and previews stream back through the authenticated function, so the Blob URL is not exposed to the browser.

## Deployment

The Vercel project is named `workspace`. Its production deployment uses integrated Neon and private Blob resources in `sin1`; the serverless function currently executes in Vercel's configured function region. Environment variables provide the resource credentials and application launch URLs.

`workspace-shell/legacy-php-api` preserves the previous PHP/SQLite Workspace API for rollback analysis. It is not part of the active routing or runtime.
