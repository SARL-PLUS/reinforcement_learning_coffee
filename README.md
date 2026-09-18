# Reinforcement Learning Coffee

Website of the monthly **Reinforcement Learning Coffee**, hosted by the Smart Analytics & Reinforcement Learning (SARL) team at the IDA Lab, Paris Lodron University of Salzburg (PLUS).
Live at <https://idalab.at/reinforcement_learning_coffee/>.

## How it works

- **Schedule source of truth:** the public Google Sheet (`1d9mY-…`). The page renders a bundled snapshot (`js/talks.js`) instantly, then fetches the sheet in the background and re-renders only if something changed. The last good sheet response is cached in `localStorage`. A sheet that suddenly returns fewer than 10 rows is ignored, so an accidental wipe never empties the archive.
- **Refresh the snapshot** after editing the sheet: `python3 tools/update_snapshot.py`.
- **Next session:** the nearest upcoming row in the sheet. If there is none, the card shows the next first Friday as "speaker to be announced" with a call for talks.
- **Calendar export:** RFC 5545 `.ics`, all-day, because session times vary and come with the mailing-list reminder.
- **Hero:** value iteration on a random gridworld, drawn on a canvas. It pauses offscreen and in background tabs, and shows a static converged frame under `prefers-reduced-motion`.
- **Preview another date:** append `?today=2026-08-01` to the URL.

## Security & performance

- Strict Content-Security-Policy: no inline scripts or styles; the only third-party request is the sheet (`connect-src https://docs.google.com`).
- No `innerHTML` with sheet data: rendering uses `<template>` + `textContent`; only `https:` links are rendered.
- No external fonts, CDNs or trackers. Fonts (Fraunces, Inter; SIL OFL) are self-hosted Latin subsets, preloaded.
- About 150 KB total over the wire, fonts included. Light and dark themes follow the system setting, with a manual toggle.

## Structure

```
index.html              page
events/2025-10-03.html  talk detail page
css/style.css           all styles (tokens, light/dark)
js/theme.js             applies a stored theme choice before first paint
js/talks.js             generated schedule snapshot, do not edit by hand
js/app.js               rendering, sheet sync, search/filter, .ics, gridworld
assets/                 icon, social preview image, fonts
tools/                  snapshot generator and sources for og.png / apple-touch-icon.png
```

## Local preview

```bash
python3 -m http.server 8000   # then open http://localhost:8000
```

Opening `index.html` straight from disk also works, but it skips the live sheet sync, and Chrome falls back to system fonts on `file://`. Use the server for a faithful preview.
