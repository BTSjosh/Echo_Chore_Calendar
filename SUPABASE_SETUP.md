# Supabase Cloud Sync Setup

This guide walks you through setting up Supabase so your Echo Show can read chores from the cloud.

## Step 1: Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and sign up (free tier is fine).
2. Click **"New Project"**.
3. Choose an organization, give your project a name (e.g., `echo-chore-calendar`), set a database password (save it!), and pick a region.
4. Wait ~2 minutes for the project to provision.

## Step 2: Create the `chore_snapshots` Table

1. In your Supabase project dashboard, click **"SQL Editor"** in the left sidebar.
2. Click **"New Query"** and paste this SQL:

```sql
create table if not exists public.chore_snapshots (
  id text primary key,
  payload jsonb not null,
  updated_at timestamptz default now()
);
```

3. Click **"Run"** (or press Ctrl/Cmd+Enter).
4. You should see "Success. No rows returned" — the table is created.

## Step 3: Insert Your Initial Snapshot

1. Still in the SQL Editor, create a new query and paste:

```sql
insert into public.chore_snapshots (id, payload)
values (
  'current',
  '{
    "chores": [],
    "progress": {},
    "postponedOverrides": []
  }'::jsonb
)
on conflict (id) do update set
  payload = excluded.payload,
  updated_at = now();
```

2. Click **"Run"**. This creates a row with `id = 'current'` and an empty chore list.

## Step 4: Get Your Supabase Credentials

1. In the left sidebar, click **"Project Settings"** (gear icon at bottom).
2. Click **"API"** under Configuration.
3. Copy these two values:
   - **Project URL** (e.g., `https://abcdefgh.supabase.co`)
   - **anon / public key** (starts with `eyJ...`)

## Step 5: Configure Your App

1. In your project root (`Echo_Chore_Calendar`), create a file named `.env`:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
VITE_SUPABASE_TABLE=chore_snapshots
VITE_CHORE_REMOTE_ID=current
VITE_CHORE_ACCESS_CODE=mySecretCode123
```

Replace:
- `YOUR_PROJECT_ID` with your actual Supabase URL
- The `anon key` with your actual key
- `mySecretCode123` with any passcode you want (used to unlock the app)

2. **Important:** Add `.env` to your `.gitignore` so your keys stay private.

## Step 6: Test Locally

1. Run your dev server:
```bash
npm run dev
```

2. Open the app with the access code in the URL:
```
http://localhost:5173/?code=mySecretCode123
```

3. The app should load chores from Supabase. Check the browser console for any errors.

## Step 7: Deploy to GitHub Pages (GitHub Actions)

This repo already includes a GitHub Actions workflow that builds and deploys on every push to `main`.

1. Push your repo to GitHub (if you have not already).
2. In GitHub, go to **Settings -> Pages** and set **Source** to **GitHub Actions**.
3. Add these **Repository secrets** (Settings -> Secrets and variables -> Actions):
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
  - `VITE_SUPABASE_TABLE`
  - `VITE_CHORE_REMOTE_ID`
  - `VITE_CHORE_ACCESS_CODE`
4. Commit and push to `main`. The **Deploy to GitHub Pages** workflow will run.
5. Open your deployed site with the code parameter:
```
https://YOUR_GITHUB_USERNAME.github.io/Echo_Chore_Calendar/?code=mySecretCode123
```

The passcode gets saved to localStorage, so you only need `?code=...` once per device/browser.

## Updating Chores in Supabase

### Option 1: Admin Upload Page (Recommended)

1. Navigate to the admin page:
```
https://YOUR_GITHUB_USERNAME.github.io/Echo_Chore_Calendar/admin?code=mySecretCode123
```
(or `http://localhost:5173/admin?code=...` when developing locally)

2. Click **"Select JSON File"** and upload your chore JSON from your local app.

3. The app validates and uploads the file to Supabase automatically.

4. Refresh any open chore app instances to see the changes.

**Expected JSON format:**
```json
{
  "chores": [
    {
      "subject": "Take out trash",
      "description": "Bins on Tuesday night",
      "assigned": ["Josh"],
      "recurrence": {
        "frequency": "weekly",
        "interval": 1,
        "dayOfWeek": 2
      },
      "startDate": "2025-01-01"
    }
  ],
  "progress": {},
  "postponedOverrides": []
}
```

### Option 2: Manual SQL Update

To add or change chores directly via SQL, go to the SQL Editor and run:

```sql
update public.chore_snapshots
set 
  payload = '{
    "chores": [
      {
        "subject": "Take out trash",
        "description": "Bins on Tuesday night",
        "assigned": ["Josh"],
        "recurrence": {
          "frequency": "weekly",
          "interval": 1,
          "dayOfWeek": 2
        },
        "startDate": "2025-01-01"
      },
      {
        "subject": "Vacuum living room",
        "description": "Weekly deep clean",
        "assigned": ["Mindy"],
        "recurrence": {
          "frequency": "weekly",
          "interval": 1,
          "dayOfWeek": 5
        },
        "startDate": "2025-01-01"
      }
    ],
    "progress": {},
    "postponedOverrides": []
  }'::jsonb,
  updated_at = now()
where id = 'current';
```

Reload your app to see the changes.

## Security Notes

- The passcode (`VITE_CHORE_ACCESS_CODE`) is checked **client-side only**. Anyone who views your site's JavaScript can find it.
- For true privacy, consider:
  - Supabase Row Level Security (RLS) with email auth
  - A Supabase Edge Function that checks a server-side secret
- The `anon` key is public and safe to expose; Supabase uses RLS to protect data.

## Troubleshooting

**App doesn't load chores:**
- Check browser console for errors
- Verify your `.env` file has the correct URL and anon key
- Make sure you visited the site with `?code=...` at least once
- Check the `chore_snapshots` table has a row with `id = 'current'`

**"Failed to load cloud snapshot":**
- Your Supabase project might be paused (free tier auto-pauses after 1 week of inactivity)
- Go to your Supabase dashboard and click "Restore" if needed

**Changes not appearing:**
- The app loads from Supabase on initial page load only
- Refresh the page (Ctrl/Cmd+R) to pull the latest snapshot
