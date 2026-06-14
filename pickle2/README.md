# pickle2 — Next.js port

A faithful port of the David Lloyd Cardiff pickleball leaderboard from Vite + React
to **Next.js (App Router)**. The original Vite app in the repo root is left untouched
as a backup.

## What changed vs. the Vite app

- **Framework**: Vite SPA → Next.js App Router (`app/`).
- **Rendering**: the app is hash-routed and browser-only, so the entire UI is loaded
  client-side via `dynamic(() => import('../src/App'), { ssr: false })` in
  `app/page.tsx`. Behavior is identical to the original SPA.
- **Source**: all components and lib code live unchanged under `src/`
  (`src/App.tsx`, `src/components/`, `src/lib/`, `src/data/`).
- **Env vars**: `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` →
  `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- **Metadata**: `index.html` `<head>` → `metadata` / `viewport` in `app/layout.tsx`.
- **PWA**: `vite-plugin-pwa` → `@ducanh2912/next-pwa` (service worker generated on
  `next build`, disabled in dev).
- **Global CSS / fonts**: imported once in `app/layout.tsx`.

## Develop

```bash
cd pickle2
npm install
npm run dev      # http://localhost:3000
```

## Build & run

```bash
npm run build
npm run start
```

## Environment

Copy `.env.example` to `.env.local` and fill in your Supabase project values
(already populated locally in `.env.local`).

## Deploy to Vercel

1. Push the repo and import it in Vercel, setting the **Root Directory** to `pickle2`.
2. Add the env vars `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   in the Vercel project settings (Production + Preview).
3. Deploy — the framework preset auto-detects Next.js.
