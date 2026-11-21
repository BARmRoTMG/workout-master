# Workout Master

A phone-first gym log that installs to your home screen, works offline, and keeps all data on the phone.

- **One button**: Today shows the workout it built for you and a single Start button. Rest days say so.
- **Suggested workout**: a full-body session built from the muscles in your plan, skipping anything still recovering, ordered compounds first, legs and upper body alternating, arms after the lifts they assist, calves and abs last.
- **Focus logging**: one exercise at a time, last session's numbers pre-filled, one big Done per set, rest timer that survives the screen locking, auto-advance to the next lift. Swap, add/drop a set and remove live in one menu.
- **Progression**: double progression. Same weight until every set hits the top of the rep range, then add weight (2.5 kg upper / 5 kg lower barbell and machine, 2 kg dumbbells). Two sessions under the bottom of the range → drop ~10%.
- **Steps**: daily steps against a goal. Web apps can't read Apple Health, so an iPhone Shortcut copies today's total and a tap on the steps tile pastes it (setup steps are in the app). Typing works too.
- **Progress**: body weight trend with weekly rate, steps, estimated 1-rep max per lift, weekly sets per muscle, workout history, and back-dated logging.
- **Your data**: JSON backup and restore, kg/lb conversion. Everything stays on the phone.

## Develop

```sh
npm install
npm run dev        # http://localhost:5173
npm test           # engine unit tests
npm run build      # production build in dist/
```

To try it on your phone over Wi-Fi: `npm run dev -- --host`, then open the printed network address. Data stored that way belongs to that address, so use a real deploy for day-to-day logging.

## Install on the phone

`dist/` is a static site. Host it anywhere with HTTPS (GitHub Pages, Netlify, Cloudflare Pages), open it on the phone, then:

- **iPhone (Safari):** Share → Add to Home Screen
- **Android (Chrome):** ⋮ → Install app

## Code map

| Path | What |
|---|---|
| `src/lib/engine.ts` | Suggestion, ordering, progression, recovery, volume, PRs, body-weight trend, plates |
| `src/lib/steps.ts` | Health Shortcut bridge: strict clipboard parser for step counts |
| `src/data/exercises.ts` | Exercise library and the default pick per muscle |
| `src/db.ts` | IndexedDB schema (Dexie) and settings |
| `src/screens/` | Today, Workout (live focus mode + summary/edit), Exercise, Progress, Settings |
| `scripts/make-icons.mjs` | Regenerates the app icons |
