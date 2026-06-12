# pickleranker Website Setup

This app is built to run as a public website:

- Public visitors open the leaderboard and recent results.
- Admins go to `/#/admin`, sign in, and add players or match scores.
- Supabase stores the shared online data.
- Vercel or Netlify hosts the website.

## 1. Create Supabase

1. Go to Supabase and create a new project.
2. Open SQL Editor.
3. Run `supabase/schema.sql`.

If you already deployed an older schema with `imported_*` columns, you can drop them:

```sql
alter table public.players
  drop column if exists imported_rating,
  drop column if exists imported_rank,
  drop column if exists imported_movement;

alter table public.matches
  drop column if exists imported;
```

## 2. Create The Admin Login

The app signs in with username `ben`, which maps to this auth email in code:

`ben@pickleranker.local`

1. In Supabase, open Authentication -> Users.
2. Click Add user.
3. Create the admin user with email `ben@pickleranker.local` and your chosen password.
4. Copy the user's UUID from the user details page.
5. In SQL Editor, run this with the real UUID:

```sql
insert into public.admin_users (user_id, email)
values ('00000000-0000-0000-0000-000000000000', 'ben@pickleranker.local')
on conflict (user_id) do update set email = excluded.email;
```

Only users listed in `public.admin_users` can update scores, even if another person manages to create a Supabase account.

Recommended Supabase auth settings:

- Authentication -> Providers -> Email: enabled
- Authentication -> URL Configuration -> Site URL: `https://dlpickle.pages.dev` (or your custom domain)
- Authentication -> URL Configuration -> Redirect URLs: add `https://dlpickle.pages.dev/**` and your local dev URL
- Authentication -> Providers -> Email -> Confirm email: optional for manually created admin users
- Authentication -> User Signups: disabled if your Supabase plan/settings expose that toggle

## 3. Configure Local Development

Copy the example env file:

```bash
cp .env.example .env.local
```

Fill in the values from Supabase Project Settings -> API:

```bash
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
```

Run locally:

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:5173/` for the public site and `http://127.0.0.1:5173/#/admin` for the admin page.

## 4. Deploy It

This repo deploys through GitHub Actions to **Cloudflare Pages** (`dlpickle` project).
A Vercel project is also linked locally if you prefer that host.

### GitHub Actions (Cloudflare Pages)

Required GitHub repository secrets:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN` (create in Cloudflare → My Profile → API Tokens → Edit Cloudflare Workers template, with **Account / Cloudflare Pages / Edit** permission)

If `CLOUDFLARE_API_TOKEN` is missing, the workflow still builds but **skips upload**, and the live site keeps an old bundle without Supabase configured.

After adding the token, push to `main` or run the **Deploy website** workflow manually.

Live URL: `https://dlpickle.pages.dev`

### Vercel (optional)

1. Import the GitHub repo in Vercel.
2. Framework preset: Vite.
3. Build command: `npm run build`.
4. Output directory: `dist`.
5. Add environment variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
6. Redeploy after saving env vars.

Live URL: `https://pickleranker.vercel.app`

### Enable live refresh

In Supabase → Database → Publications, ensure `supabase_realtime` includes the `players` and `matches` tables.

## 5. Use The Website

- Share the deployed URL with anyone who should view the leaderboard.
- Use `https://your-site.com/#/admin` to sign in as admin.
- Add players, then add weekly games from the admin page.
- Edit or delete recent games from the admin page if needed.
- The leaderboard recalculates from saved games automatically.

## Useful Commands

Verify scoring:

```bash
npm run verify:scoring
```
