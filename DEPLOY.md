# pickleranker Website Setup

This app is already built to run as a public website:

- Public visitors open the leaderboard and recent results.
- Admins go to `/#/admin`, sign in, and add players or match scores.
- Supabase stores the shared online data.
- Vercel or Netlify hosts the website.

## 1. Create Supabase

1. Go to Supabase and create a new project.
2. Open SQL Editor.
3. Run `supabase/schema.sql`.
4. Run `supabase/seed-cardiff.sql` once to load the current Cardiff players and matches.

## 2. Create The Admin Login

1. In Supabase, open Authentication -> Users.
2. Click Add user.
3. Create your admin user with email and password.
4. Copy the user's UUID from the user details page.
5. In SQL Editor, run this with your real admin email and UUID:

```sql
insert into public.admin_users (user_id, email)
values ('00000000-0000-0000-0000-000000000000', 'admin@example.com')
on conflict (user_id) do update set email = excluded.email;
```

Only users listed in `public.admin_users` can update scores, even if another person manages to create a Supabase account.

Recommended Supabase auth settings:

- Authentication -> Providers -> Email: enabled
- Authentication -> URL Configuration -> Site URL: your deployed website URL
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

### Vercel

1. Push this folder to a GitHub repo.
2. In Vercel, import the repo.
3. Framework preset: Vite.
4. Build command: `npm run build`.
5. Output directory: `dist`.
6. Add environment variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
7. Deploy.

### Netlify

1. Push this folder to a GitHub repo.
2. In Netlify, import the repo.
3. Build command: `npm run build`.
4. Publish directory: `dist`.
5. Add environment variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
6. Deploy.

## 5. Use The Website

- Share the deployed URL with anyone who should view the leaderboard.
- Use `https://your-site.com/#/admin` to sign in as admin.
- Add weekly games from the admin page.
- The leaderboard recalculates from saved games automatically.

## Useful Commands

Refresh scraped Cardiff seed:

```bash
npm run scrape:cardiff
npm run export:supabase-seed
```

Verify scoring:

```bash
npm run verify:scoring
```
