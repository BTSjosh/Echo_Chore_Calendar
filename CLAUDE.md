# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

- `npm run dev` — Start Vite dev server (binds to 0.0.0.0:5178)
- `npm run build` — Production build (output to `dist/`)
- `npm run preview` — Preview production build locally
- `npm run lint` — Run ESLint

No test framework is configured. There are no automated tests.

## Architecture

This is a **React 19 + Vite + Tailwind CSS v4** household chore management app optimized for display on Amazon Echo Show devices (Silk browser). It uses a local-first data model with optional Supabase cloud sync.

### Routing & Deployment

- **HashRouter** (`/#/`) for GitHub Pages SPA compatibility
- Deployed via GitHub Actions to GitHub Pages at `/Echo_Chore_Calendar/`
- Vite `base` is set to `/Echo_Chore_Calendar/` — all asset paths are relative to this
- Asset filenames use content hashes for cache busting

### Application Structure

Nearly all application logic lives in **`src/App.jsx`** (~1800 lines) — a single large component containing:
- State management (useState/useRef/useMemo/useEffect)
- All chore scheduling, rotation, and completion logic
- Date utility functions (`toDateOnly`, `isDueOnDate`, `getNextDueDate`, etc.)
- localStorage persistence and Supabase sync
- Tab-based views: Yesterday / Today / This Week / This Month

**`src/AdminUpload.jsx`** handles backup/restore and Supabase sync management.

**`src/data/initialChores.json`** defines household members and seed chore data.

### Data Model

Chores have two separately-persisted layers:
- **Definitions** (structure, schedule, assignments) → `echo-chore-definitions` in localStorage
- **Progress** (completion state, rotation index) → `echo-chore-schedule` in localStorage
- **Postponements** → `echo-chore-postpones` in localStorage

Chore assignment supports two modes: `"fixed"` (static assignees) or `"rotating"` (cycles through members on a configurable schedule — daily/weekly/monthly/every-x-days).

Recurrence uses `frequency` (daily/once/weekly/monthly) with `interval`, `dayOfWeek`, and `dayOfMonth` fields.

### Supabase Sync (Optional)

Cloud sync is opt-in via environment variables. The app fetches/pushes snapshots to a `chore_snapshots` table. Merge logic combines remote and local state — postpones are merged (union), chores are matched by subject with ID fallback.

Required env vars (see `.env.example`): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_SUPABASE_TABLE`, `VITE_CHORE_REMOTE_ID`, `VITE_CHORE_ACCESS_CODE`.

### Echo Show / Silk Browser Considerations

- Tailwind `scale-x-` transforms compensate for the Echo Show's narrow viewport rendering
- Large touch targets (min-w-[11rem]) — no hover-dependent interactions
- Silent audio loop (`public/silent-loop.mp3`) in an iframe keeps the browser alive
- Cache-control meta tags + no-store fetch headers prevent stale UI on the device

### Styling

Tailwind CSS v4 with `@tailwindcss/vite` plugin. Dark theme throughout: `bg-[#121212]`, `text-slate-100`. Minimal custom CSS in `src/index.css` and `src/App.css`.
