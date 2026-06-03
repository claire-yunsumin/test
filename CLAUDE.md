# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A **habit tracker** built as a zero-dependency Progressive Web App (PWA). It is designed to be installed to an iPhone home screen from Safari ("Add to Home Screen") and run offline. There is **no build step, no framework, no server, and no package.json** — the source files are the deployment artifact, served as-is by GitHub Pages.

Live URL: `https://claire-yunsumin.github.io/test/`

## Architecture

```
index.html   Markup skeleton + PWA/iOS meta tags + inline theme-before-paint script
styles.css   All styling, driven by CSS custom properties (theming)
app.js       All logic: state, rendering, interaction (no modules, plain <script>)
sw.js        Service worker — network-first cache for offline support
manifest.webmanifest   App name, icons, display:standalone
icons/       Home-screen icons (180/192/512 px)
tools/make_icons.py    Regenerates icons (pure-stdlib PNG encoder, no Pillow)
```

**Data layer.** All state lives in `localStorage` under a single key `habits.v1` as a JSON array. There is no server/DB — the phone is the store. A habit:

```js
{ id, name, emoji, color, createdAt,
  history: { "YYYY-MM-DD": true, ... },   // completion per day
  reminder: "HH:MM" | null, lastNotified: "YYYY-MM-DD" }
```

Derived values (streaks, monthly completion %, the calendar heatmap) are **computed on the fly from `history`** — never stored. Keep it that way; it keeps persisted data simple and resilient.

**UI pattern.** Framework-free unidirectional flow, hand-rolled:

```
user action → mutate `habits` → save() → rerender() → DOM rebuilt via innerHTML
```

- `save()` is the single persistence point (`localStorage.setItem`).
- Three tabs (`calendar` / `today` / `stats`) are toggled by `setTab()` via the `hidden` attribute; `rerender()` dispatches to `renderCalendarView()`, `renderToday()`, or `renderStats()` based on `activeTab`.
- Calendar is the default/home tab.
- Overlays: `#detail` (full-screen per-habit view with month calendar + reminder + reorder), `#daySheet` (tap a calendar day to toggle that day's habits), `#sheet` (add/edit habit).
- Rendering is `innerHTML` templates + re-bound event handlers. Fine at this scale.

**Theming.** Monochrome "Moleskine diary" look (white paper / black-leather), typewriter (monospace) type. All colors are CSS variables on `:root` (dark default) and `:root[data-theme="light"]`. Theme toggle just flips `document.documentElement.dataset.theme` and persists to `localStorage` (`habits.theme`). An inline script in `index.html`'s `<head>` applies the theme **before first paint** to avoid a flash — keep it there. Emoji are desaturated with `filter: grayscale(1)` to stay monochrome; the habit `color` field is retained in data but visually unused (color picker is hidden via `#colorField`).

## Working in this repo

- **No build / no install.** Edit the files directly. To preview locally: `python3 -m http.server 8000` then open `http://localhost:8000`.
- **Validate before pushing:** `node --check app.js && node --check sw.js`.
- **Deploy = push to `main`.** GitHub Pages auto-builds (`pages-build-deployment` workflow); the site updates ~1–2 min later. Do not open PRs unless asked.
- **Bump the service worker cache version** (`CACHE = "habit-tracker-vN"` in `sw.js`) on every change to static assets. The SW is network-first, so users get updates on a single refresh — but bumping clears stale precache. This is currently at v10.
- **Icons:** regenerate with `python3 tools/make_icons.py` after editing that script. The script encodes PNGs with stdlib `zlib`/`struct` (no Pillow/ImageMagick available in this env).

## iOS PWA constraints (important, non-obvious)

- **Home-screen icon is cached at install time.** Changing `icons/` requires the user to delete and re-add the app to see the new icon; an in-app refresh is not enough. App *content* (HTML/CSS/JS) does update on refresh.
- **Reminders are best-effort only.** iOS web apps cannot schedule background notifications at a fixed time. The reminder fires via a `setInterval` check **only while the app is open**, and only after the user installed to home screen and granted notification permission. Don't promise true scheduled push without a server.
- HTML5 drag-and-drop does not work from touch on iOS — habit reordering is done via ▲/▼ buttons in the detail view (drag is a desktop-only bonus).

## Intentional non-goals / trade-offs

No accounts or cross-device sync (data is local-only: free, instant, private). No framework (innerHTML rendering is simplest at this size). If extending: natural path is JSON backup/restore → optional cloud sync (add a server) → swap in a light render library only if it outgrows this. The `history` date-map data model supports all of these unchanged.
