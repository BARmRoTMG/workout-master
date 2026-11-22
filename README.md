# Workout Master

A phone-first gym log that installs to your home screen, works offline, and keeps all data on the phone.

- **One button**: Today shows the workout it built for you and a single Start button. Rest days say so.
- **Suggested workout**: a full-body session built from the muscles in your plan, skipping anything still recovering, ordered compounds first, legs and upper body alternating, arms after the lifts they assist, calves and abs last.
- **Focus logging**: one exercise at a time, last session's numbers pre-filled, one big Done per set, rest timer that survives the screen locking, auto-advance to the next lift. Swap, add/drop a set and remove live in one menu.
- **Progression**: double progression. Same weight until every set hits the top of the rep range, then add weight (2.5 kg upper / 5 kg lower barbell and machine, 2 kg dumbbells). Two sessions under the bottom of the range → drop ~10%.
- **Interval timer**: work/rest rounds (Tabata, circuits, planks) with 3-2-1 beeps, pause, and a to-scale timeline. Nothing to log.
- **Notifications**: "rest over" and interval changes on the lock screen when the app isn't open, plus optional weigh-in, workout-day and steps reminders (Settings → Notifications). iPhone only lets web apps notify through a push server, so a small Cloudflare Worker (`server/`) holds the upcoming alerts and sends each at its time. iPhone needs the app on the Home Screen (iOS 16.4+).
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

## Push server

`server/` is a Cloudflare Worker with one Durable Object per phone: it stores that phone's push subscription and pending alerts and wakes itself with an alarm when the next one is due. Web Push encryption (RFC 8291) and VAPID (RFC 8292) are done with WebCrypto in `server/src/webpush.ts`, tested against the RFC's worked example.

It runs at `https://workout-push.barmrotmg.workers.dev`. To deploy changes:

```sh
cd server
npm install
npx wrangler login
npx wrangler deploy
```

The VAPID public key is in `server/wrangler.jsonc` and `src/lib/push.ts` (they must match); the private key exists only as the Worker secret `VAPID_PRIVATE_KEY`. Replacing the key pair means every phone has to turn notifications on again.

For local testing put `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `ALLOWED_ORIGINS` in `server/.dev.vars`, run `npx wrangler dev`, and build the app with `VITE_PUSH_URL` / `VITE_PUSH_KEY` pointing at it (e.g. in `.env.local`).

## Code map

| Path | What |
|---|---|
| `src/lib/engine.ts` | Suggestion, ordering, progression, recovery, volume, PRs, body-weight trend, plates |
| `src/lib/steps.ts` | Health Shortcut bridge: strict clipboard parser for step counts |
| `src/lib/push.ts` | Notifications: subscribe, per-device preferences, handing timer alerts to the server |
| `src/lib/rest.ts`, `src/lib/intervals.ts`, `src/lib/sound.ts` | Rest and interval timers (stored as times, so they survive locking) and their beeps |
| `src/lib/reminders.ts` | Next weigh-in, workout-day and steps reminders |
| `public/push-sw.js` | Service-worker push and notification-tap handlers |
| `server/` | Push server (Cloudflare Worker) |
| `src/data/exercises.ts` | Exercise library and the default pick per muscle |
| `src/db.ts` | IndexedDB schema (Dexie) and settings |
| `src/screens/` | Today, Workout (live focus mode + summary/edit), Timer, Exercise, Progress, Settings |
| `scripts/make-icons.mjs` | Regenerates the app icons |
