# pickleranker

David Lloyd Cardiff pickleball leaderboard (Next.js App Router, static export).

- Public: overall and weekly standings, player profiles, 4DR explainer.
- Admins: `/manage` (sign in, add players/scores, run tournaments).
- Data: Supabase (shared online state, realtime sync, offline outbox).

## Develop

```bash
npm install
npm run dev      # http://localhost:3000
```

Copy `.env.example` to `.env.local` and fill in the Supabase values.

## Checks

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## Supabase setup

1. SQL Editor → run `supabase/schema.sql`.
2. Existing projects: also run `supabase/migration-2026-06-12.sql`,
   `supabase/migration-2026-06-17.sql`, `supabase/migration-2026-09-03.sql`.
3. Auth: disable public signup, require a 12+ char password, create admin
   users, then register each UUID:

   ```sql
   insert into public.admin_users (user_id, email)
   values ('<user-uuid>', 'ben@pickleranker.local');
   ```

## Deploy

Push to `main` → GitHub Actions builds and deploys to Cloudflare Pages
(`https://dlpickle.pages.dev`). Needs repo secrets: `CLOUDFLARE_API_TOKEN`,
`CLOUDFLARE_ACCOUNT_ID`, `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`.

Manual alternative:

```bash
npm run deploy
```
