# Joy House

Private community discussion platform for **House of Joy Youth · RCCG Pretoria**. Members post, comment, and pray together in one place — like a small, moderated Reddit.

This app is separate from ODIN Insights. Stack: **Next.js (React)** + **Supabase** (auth, Postgres, RLS) + **Vercel** + **Cloudflare**.

## Features

- Email/password signup with verification before access, plus Google sign-in
- Feed sorted by newest, category filters, and Trending (most likes in the last 24 hours)
- Optional profile photos on the Profile page; initials are used if someone skips it
- Anonymous posts: public name is “Member”; author ID stays in the database for admins
- Nested comments, likes (one per member per post), report queue
- Admins can pin up to 3 posts, delete any post/comment, and review reports
- Rate limit: 5 posts per member per hour
- Basic profanity filter on posts, comments, and reports
- PWA: Add to Home Screen using the Joy House logo

## 1. Create a Supabase project

1. Create a project at [supabase.com](https://supabase.com).
2. In **Authentication → Providers**:
   - Enable **Email** with **Confirm email** turned on.
   - Enable **Google** and add the client ID/secret from Google Cloud.
3. Authentication → URL configuration:
   - Site URL: `http://localhost:3000` locally, then your Vercel domain in production.
   - Redirect URLs: `http://localhost:3000/auth/callback` and `https://<your-domain>/auth/callback`.
4. SQL editor: paste and run `supabase/schema.sql`.
5. If this project already existed before profile photos, also run `supabase/avatars.sql`.
6. After you sign up, promote yourself:

```sql
update public.profiles
set role = 'admin'
where id = '<your-user-uuid>';
```

Passwords are hashed by Supabase Auth (bcrypt). You never store plaintext passwords.

## 2. Run locally

```bash
cd d:\joy-house
copy .env.local.example .env.local
```

Fill in:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

Then:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## 3. Deploy on Vercel

1. Push this folder to a Git repository.
2. Import the repo in Vercel. Framework preset: Next.js.
3. Add the same three environment variables. Set `NEXT_PUBLIC_SITE_URL` to `https://<your-domain>`.
4. In Supabase, add the production Site URL and `/auth/callback` redirect.
5. Point the Cloudflare domain to Vercel (CNAME to `cname.vercel-dns.com`, or Cloudflare for SaaS). HTTPS is automatic on Vercel.

## Security model

Row Level Security is on for `profiles`, `posts`, `comments`, `likes`, and `reports`.

- Only verified members (confirmed email) can read or write community content.
- Members can edit/delete only their own posts and comments.
- `is_admin()` is checked in Postgres before pin, report-queue, and admin delete actions. The Next.js server actions also re-check the profile role.
- Anonymous `author_id` is redacted in the `posts_visible` view for non-admins.

Do not put the Supabase **service role** key in this app. The anon key plus RLS is enough.

## PWA

`public/manifest.json` and `public/sw.js` are registered on load. On iPhone: Share → Add to Home Screen. On Android: Chrome menu → Install app / Add to Home Screen.

## Project layout

```
app/            Routes, server actions
components/     Feed, composer, comments, auth UI
lib/            Supabase clients, RLS-aware queries, profanity filter
supabase/       Postgres schema + policies
public/         Logo, PWA icons, service worker
```

Visual design matches `joyhouse_mockup_final.html`: navy top bar, `#0155CF` blue, `#FE9901` orange likes, and the category tag colours.
