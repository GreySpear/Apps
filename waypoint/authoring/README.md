# Authoring kit — generate trips with Claude

Set this up once, then plan every future trip in a Claude **Project** that outputs a file Waypoint imports directly.

## Files

- **`PROJECT_INSTRUCTIONS.md`** — paste into your Project's custom instructions.
- **`trip.schema.json`** — the formal schema. Attach as Project knowledge so Claude validates against it (and Waypoint can validate imports too).
- **`TEMPLATE.trip.json`** — an annotated skeleton to eyeball the shape.
- The sample [`../trips/california-2026.json`](../trips/california-2026.json) — a full worked example; attach it as knowledge so Claude matches the house style.

## One-time setup (Claude Projects)

1. In claude.ai, create a **Project** — call it "Waypoint trips".
2. Open **Custom instructions** and paste the body of `PROJECT_INSTRUCTIONS.md`.
3. Add **Project knowledge**: upload `trip.schema.json` and `california-2026.json`.
4. Done.

## Using it

1. Start a chat in the Project and plan the trip normally — routes, food, trade-offs.
2. When you're happy, say **"make the Waypoint file."** Claude outputs a `trip.json` as a code block (and a downloadable file where supported).
3. Get it into Waypoint:
   - **On your phone (easiest):** copy the code block → open Waypoint → **Import trip → paste** → Import.
   - **From a file:** save the `.json` → **Import trip → Choose a .json file**.
4. **Revising a trip you already imported?** Keep the same `trip.id`. Re-importing refreshes the plan but keeps your typed-in confirmation numbers, checklist ticks, and docs.

## Notes

- Claude leaves `confirmation` fields empty on purpose — you fill those in on your device, and they stay there across revisions.
- The plan is the only thing shared. Your confirmations and photos live only on your phone.
