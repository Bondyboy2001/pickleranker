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
3. For an existing project, also run `supabase/migration-2026-06-12.sql` for match
   edit timestamps and shared tournament drafts.
4. Create the admin user (email `ben@pickleranker.local`) under Authentication → Users,
   then register its UUID:

   ```sql
   insert into public.admin_users (user_id, email)
   values ('<user-uuid>', 'ben@pickleranker.local');
   ```

## Deploy to Netlify

The app is a static export (`output: 'export'`), so it deploys as plain static
files — no server runtime. Config lives in `netlify.toml`.

1. Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in the
   Netlify site settings (Environment variables).
2. Deploy from the repo root: `netlify deploy --build --prod`.

## Verify scoring

```bash
npm run verify:scoring
```
