# pickleranker Website Setup

This app is built to run as a public website:

- Public visitors open the leaderboard and recent results.
- Admins go to `/#/admin`, sign in, and add players or match scores.
- Supabase stores the shared online data.
- Cloudflare Pages hosts the website.

## 1. Create Supabase

1. Go to Supabase and create a new project.
2. Open SQL Editor.
3. Run `supabase/schema.sql`.

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

Deploy from your machine to **Cloudflare Pages** (`dlpickle` project).

1. Put your Supabase values in `.env.local` (same as local dev).
2. Log in to Cloudflare once:

```bash
npx wrangler login
```

3. Build and publish:

```bash
npm run deploy
```

Live URL: `https://dlpickle.pages.dev`

Run `npm run deploy` again whenever you want to push changes live.

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
