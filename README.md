# pickleranker

pickleranker is a public pickleball ranking website using 4DR scoring.

The app has two views:

- Public leaderboard: `/#/`
- Admin score entry: `/#/admin`

Admins sign in with Supabase email/password auth. Public visitors do not need an account.

## Local Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Add your Supabase values to `.env.local`:

```bash
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
```

Without Supabase env vars, the app runs in local-only mode using browser storage.

## Admin screen (easiest way to enter scores)

Open `/#/admin` in the app. No extra admin app is needed.

- **Local only (simplest):** run `npm run dev`, open `http://127.0.0.1:5173/#/admin`. Scores save in this browser only — no Supabase or hosting required.
- **Shared public website:** use Supabase for the database and Cloudflare Pages for hosting.

## Online Setup

See [DEPLOY.md](./DEPLOY.md) for the full website setup:

1. Create a Supabase project.
2. Run `supabase/schema.sql`.
3. Create an auth user for the admin (`ben@pickleranker.local`).
4. Add that user to `public.admin_users`.
5. Add GitHub secrets and deploy to Cloudflare Pages (`CLOUDFLARE_API_TOKEN` is required or the live site will not update).

## Scripts

```bash
npm run dev
npm run build
npm run lint
npm run verify:scoring
```
