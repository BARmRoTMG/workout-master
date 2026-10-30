# Workout Master

A phone-first gym log that installs to your home screen, works offline, and keeps all data on the phone.

- **Suggested workout**: a full-body session built from the muscles in your plan, skipping anything still recovering, ordered compounds first, legs and upper body alternating, arms after the lifts they assist, calves and abs last.
- **Progression**: double progression. Same weight until every set hits the top of the rep range, then add weight (2.5 kg upper / 5 kg lower barbell and machine, 2 kg dumbbells). Two sessions under the bottom of the range → drop ~10%.
- **Logging**: last session's numbers pre-filled, one tap per set, rest timer that survives the screen locking, screen kept awake during a workout, plate loading shown for barbell lifts.
- **Progress**: estimated 1-rep max per exercise, new-best detection, weekly sets per muscle, body weight with a 7-day average and weekly rate.
- **Your data**: JSON backup and restore, CSV export, kg/lb conversion.

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
| `src/data/exercises.ts` | Exercise library and the default pick per muscle |
| `src/db.ts` | IndexedDB schema (Dexie) and settings |
| `src/screens/` | Today, Workout, History, Exercise, Progress, Settings |
| `scripts/make-icons.mjs` | Regenerates the app icons |
