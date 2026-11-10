# RCB vs CSK

A 3D cricket game for the browser. You play as Royal Challengers Bengaluru. The computer plays as Chennai Super Kings.
It works with touch (phone) and with mouse and keyboard (desktop). There is no backend.

Built with Vite, TypeScript and Three.js.

## Run

```
npm install
npm run dev        # open the URL that Vite prints (use the Network URL on a phone)
npm run build      # production build in dist/
npm run preview    # serve the production build
```

## Tests

```
npm test           # unit tests for the simulation (57 tests)
npm run balance    # balance check: a bot plays many matches and prints runs per over
npm run e2e        # headless browser test: plays a full 2-over match
npm run screenshots  # saves screenshots at 390 x 780 and 1280 x 720 in e2e/out
```

The browser tests need Playwright with Chromium (`npx playwright install chromium`).

## Controls

Batting
- Tap when the ball is in the lit zone on the pitch (after the bounce, about 2 m in front of the bat).
- The place you tap around the batter is the direction. For a right-hander: left = off side, right = leg side,
  below = straight, above = behind. This is mirrored for a left-hander. You can also put a finger on the batter and swipe.
- Select Defend, Ground or Loft before the ball. A tap on the batter is a defensive block.
- Early timing sends the ball to the leg side. Late timing sends it to the off side.
- Press RUN to run. Green = safe, amber = tight, red = danger.
- Keyboard: arrows aim, Space swings, Z / X / C select the shot type, R runs.

Bowling
- Select the bowler for each over.
- Select a variation, tap the pitch for line and length (or use the arrows), press BOWL, then stop the meter.
- The dark red end of the meter is a no-ball.

Other: P or Esc = pause, M = sound.

## Structure

```
src/sim/     Match simulation. No rendering or DOM code. Fully unit-tested.
  match.ts     T20 rules: scoring, overs, strike, quotas, free hits, chase
  delivery.ts  Ball flight
  shot.ts      Timing, direction, edges, misses
  fielding.ts  Ball path after the bat, fielders, catches, throws
  ballsim.ts   Real-time simulation of one ball (also running and run outs)
  ai.ts        Computer batting, bowling and captaincy
  field.ts     Ground geometry and field settings
  squads.ts    IPL 2026 squads
  autoplay.ts  Bot player for tests and the balance check
src/render/  Three.js scene: stadium, player figures, poses, effects, cameras, replays
src/game/    Game flow, input and sound
src/ui/      HUD, menus, scorecards, wagon wheel
tests/       Unit tests
e2e/         Headless browser test and screenshot script
```

## Notes

- Player ratings are for game balance only.
- Kits use team colours only. There are no logos, sponsor marks or brand names.
