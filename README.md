# pickleranker

The David Lloyd Cardiff pickleball leaderboard, built with **Next.js (App Router)**.

- Public visitors open the leaderboard and recent results.
- Admins go to `/#/manage` (or `/#/admin`), sign in, and add players or match scores.
- Supabase stores the shared online data.

## Architecture

- **Framework**: Next.js App Router (`app/`).
- **Rendering**: the UI is hash-routed and browser-only, so the whole app is loaded
  client-side via `dynamic(() => import('../src/App'), { ssr: false })` in `app/page.tsx`.
- **Source**: components and lib code live under `src/` (`src/App.tsx`,
  `src/components/`, `src/lib/`, `src/data/`).
- **Env vars**: `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- **Metadata**: defined as `metadata` / `viewport` in `app/layout.tsx`.
- **PWA**: service worker generated on `next build` via `@ducanh2912/next-pwa`
  (disabled in dev).
- **Global CSS / fonts**: imported once in `app/layout.tsx`.

## Develop

```bash
npm install
npm run dev      # http://localhost:3000
```

## Build & run

```bash
npm run build
npm run start
```

## Environment

Copy `.env.example` to `.env.local` and fill in your Supabase project values.

## Supabase setup

1. Create a Supabase project and open the SQL Editor.
2. Run `supabase/schema.sql`.
3. For an existing project, also run `supabase/migration-2026-06-12.sql` (match
   edit timestamps and shared tournament drafts),
   `supabase/migration-2026-06-17.sql` (round/court), and
   `supabase/migration-2026-09-03.sql` (score cap, name bounds,
   `source` column, `weekly_snapshots`, draft size limit).
4. In Supabase Auth settings: disable public signup and require a 12+ char
   password. Create admin users under Authentication → Users, then register
   each UUID:

   ```sql
   insert into public.admin_users (user_id, email)
   values ('<user-uuid>', 'ben@pickleranker.local');
   ```

## Deploy to Cloudflare Pages

The app is a static export (`output: 'export'`), so it deploys as plain static
files — no server runtime.

### Option 1: GitHub Integration (Recommended)

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com) → Pages → Create a project
2. Connect your GitHub repository (`Bondyboy2001/pickleranker`)
3. Configure build settings:
   - **Build command**: `npm run build`
   - **Build output directory**: `out`
   - **Root directory**: (leave empty)
4. Add environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_SITE_URL=https://dlpickle.pages.dev`
5. Save and deploy

### Option 2: Wrangler CLI

```bash
npm run deploy   # builds, then uploads out/ to the dlpickle project (main)
```

Equivalent to running the two steps by hand:

```bash
npm run build
npx wrangler pages deploy out --project-name=dlpickle --branch=main
```

## Tests

The 4DR scoring engine and standings are covered by unit tests:

```bash
npm test
```
