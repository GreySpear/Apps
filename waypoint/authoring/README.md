# Authoring kit — generate trips with Claude

Set this up once, then plan every future trip in a Claude **Project** that outputs a file Waypoint imports directly.

## Files

- **`PROJECT_INSTRUCTIONS.md`** — paste into your Project's custom instructions.
- **`trip.schema.json`** — the formal schema. Attach as Project knowledge so Claude validates against it (and Waypoint can validate imports too).
- **`TEMPLATE.trip.json`** — an annotated skeleton to eyeball the shape.
- **`lmstudio-system-prompt.txt`** — a self-contained system prompt for a local model in LM Studio (see below).
- The sample [`../trips/california-2027.json`](../trips/california-2027.json) — a full worked example; attach it as knowledge so Claude matches the house style.

## One-time setup (Claude Projects)

1. In claude.ai, create a **Project** — call it "Waypoint trips".
2. Open **Custom instructions** and paste the body of `PROJECT_INSTRUCTIONS.md`.
3. Add **Project knowledge**: upload `trip.schema.json` and `california-2027.json`.
4. Done.

## Using it

1. Start a chat in the Project and plan the trip normally — routes, food, trade-offs.
2. When you're happy, say **"make the Waypoint file."** Claude outputs a `trip.json` as a code block (and a downloadable file where supported).
3. Get it into Waypoint:
   - **On your phone (easiest):** copy the code block → open Waypoint → **Import trip → paste** → Import.
   - **From a file:** save the `.json` → **Import trip → Choose a .json file**.
4. **Revising a trip you already imported?** Keep the same `trip.id`. Re-importing refreshes the plan but keeps your typed-in confirmation numbers, checklist ticks, and docs.

## Local models (LM Studio)

`lmstudio-system-prompt.txt` is a standalone version of these instructions for a local model. The schema essentials, rules, house style and your defaults are all written into the prompt, because a local model can't reliably use attached files and can't check anything on the web.

1. Load a model and open a chat. Paste the whole file into the **System Prompt** box in the chat's right-hand settings panel. You can save it as a preset (e.g. "Waypoint trips") to reuse it.
2. Set **Context Length** to at least **16k**: the prompt is ~2k tokens and a 9-day trip file is ~6k, and the model has to hold the plan plus the file.
3. Use a capable instruction-tuned model, roughly 14B+ parameters. Smaller ones tend to break JSON or lose track of dates on long files. Keep **temperature** around 0.3–0.5 for the export step.
4. Plan in the chat, then say **"make the Waypoint file"** and paste the code block into **Import trip → paste**. Waypoint's import check catches broken JSON, missing fields and bad dates with specific messages; paste those back to the model to fix.

Local models don't know about restaurants that opened, moved or closed after their training cutoff. The prompt tells the model not to invent addresses, phone numbers or opening hours and to add a "Confirm hours" item instead. Still, check the dinners and anything time-sensitive before booking.

Don't turn on LM Studio's **Structured Output** for this chat: it forces every reply to be JSON, which breaks the planning conversation.

## Notes

- **The app double-checks on import.** Waypoint validates every file against the schema as you import it: it blocks a genuinely broken file with field-level messages (e.g. "trip.id: required"), and imports a mostly-fine file while flagging soft issues (bad dates, an odd reservation type) as dismissible notes. So a small slip in a pasted file is caught, not silently carried.
- Claude leaves `confirmation` fields empty on purpose — you fill those in on your device, and they stay there across revisions.
- The plan is the only thing shared. Your confirmations and photos live only on your phone.
