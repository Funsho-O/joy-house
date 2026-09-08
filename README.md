# Joy House

Private community discussion platform for **House of Joy Youth · RCCG Pretoria**. Members post, comment, and pray together in one place — like a small, moderated Reddit.

This app is separate from ODIN Insights. Stack: **Next.js (React)** + **Supabase** (auth, Postgres, RLS) + **Vercel** + **Cloudflare**.

## Features

- Email/password signup with verification before access, plus Google sign-in
- Feed sorted by newest, category filters, and Trending (most likes in the last 24 hours)
- Optional profile photos on the Profile page; initials are used if someone skips it
- Optional photo on each community post (one image, up to 5MB)
- Anonymous posts: public name is “Member”; author ID stays in the database for admins
- Private groups (Youth Leadership and Choir) with their own feeds; admins add members
- Nested comments, likes (one per member per post), report queue
- Emoji picker on post and comment composers
- Authors can edit their own posts, group posts, comments, and group comments for 15 minutes; edited items show an Edited label
- Leaderboard (This Week / All Time): 1 point per named post, comment, and like received on a named post; anonymous posts do not count
- Profile badges for First Post, Prayer Warrior, Encourager, Trending, Faithful, and Most Loved
- Admins get an activity dashboard with weekly engagement, quiet-member follow-up flags, and CSV export
- Admins can pin up to 3 posts, delete any post/comment, unmask anonymous authors, review reports, and open edit history
- Rate limit: 5 posts per member per hour
- Basic profanity filter on posts, comments, and reports
- PWA: Add to Home Screen using the Joy House logo
- Web Push on Android: notify members when someone replies to their post or comment

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
6. If this project already existed before groups, also run `supabase/groups.sql`.
7. If this project already existed before post photos, also run `supabase/post-images.sql`.
8. If this project already existed before Web Push, also run `supabase/push-notifications.sql`.
9. If this project already existed before post/comment edits, also run `supabase/edit-posts.sql`.
10. If this project already existed before admin edit history, also run `supabase/edit-history.sql`.
11. If this project already existed before group post edits, also run `supabase/edit-group-posts.sql`.
12. If this project already existed before group comment edits, also run `supabase/edit-group-comments.sql`.
13. If this project already existed before the leaderboard and badges, also run `supabase/activity.sql`.
14. After you sign up, promote yourself:

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
NEXT_PUBLIC_VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:you@example.com
```

Generate VAPID keys once and reuse the same pair in every environment (changing them invalidates existing subscriptions):

```bash
npx web-push generate-vapid-keys
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
3. Add the same environment variables, including the VAPID keys. Set `NEXT_PUBLIC_SITE_URL` to `https://<your-domain>`.
4. In Supabase, add the production Site URL and `/auth/callback` redirect.
5. Point the Cloudflare domain to Vercel (CNAME to `cname.vercel-dns.com`, or Cloudflare for SaaS). HTTPS is automatic on Vercel.

## Security model

Row Level Security is on for `profiles`, `posts`, `comments`, `likes`, `reports`, `groups`, `group_members`, `group_posts`, `group_comments`, `group_likes`, `push_subscriptions`, `post_revisions`, `comment_revisions`, `group_post_revisions`, `group_comment_revisions`, and `badge_awards`.

- Only verified members (confirmed email) can read or write community content.
- Members can edit/delete only their own posts and comments.
- `is_admin()` is checked in Postgres before pin, report-queue, and admin delete actions. The Next.js server actions also re-check the profile role.
- Anonymous `author_id` is redacted in the `posts_visible` view for non-admins.
- Group content is only readable by people listed in `group_members` for that group. Admins manage membership.

Do not put the Supabase **service role** key in this app. The anon key plus RLS is enough.

## PWA

`public/manifest.json` and `public/sw.js` are registered on load. On iPhone: Share → Add to Home Screen. On Android: Chrome menu → Install app / Add to Home Screen.

Signed-in members are asked for notification permission on first visit. They can change that later on the Profile page. Replies to a post or comment send a Web Push to the author’s subscribed Android devices. Keep the VAPID private key on the server only.

## Project layout

```
app/            Routes, server actions
components/     Feed, composer, comments, auth UI
lib/            Supabase clients, RLS-aware queries, profanity filter
supabase/       Postgres schema + policies
public/         Logo, PWA icons, service worker
```

Visual design matches `joyhouse_mockup_final.html`: navy top bar, `#0155CF` blue, `#FE9901` orange likes, and the category tag colours.
