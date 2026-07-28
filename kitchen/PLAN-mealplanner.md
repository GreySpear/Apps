# Kitchen — Meal Planner + Smart Aggregation

Follow-up to the Recipes+Groceries consolidation. Connects the two halves: plan
a week of recipes, then build one smart, de-duplicated, aisle-grouped shopping
list from it.

## Decisions (agreed 2026-07-28)

| Decision | Choice |
|---|---|
| Meal slots | **None.** A day just holds recipes. (Workflow: cook for dinner, leftovers for lunch — slots add no value.) |
| Week | Calendar week, **Monday start**, prev/next nav, defaults to the week containing today. |
| Range quantities (`2–3`) | Round **up** — better to over-buy than run short. |
| Staples in results | **Shown, pre-unchecked** (transparent), never silently dropped. |
| Plan placement | **Third top-level tab** (🍳 Recipes · 📅 Plan · 🧺 Groceries), indigo accent. |
| Unit merging | **Same-unit summing** in v1 (honest, no fragile conversions). Cross-unit convertible summing is a future refinement. |

## Data model

One new Sheet tab, same full-replace sync pattern as `items`/`staples`:

```
plan:  id | date (YYYY-MM-DD) | recipeId | servings | createdAt
```

- Multiple entries per date allowed.
- `servings` defaults to the recipe's own servings; used to scale quantities in
  aggregation.

Client state: `plan = [{id, date, recipeId, servings}]`.

## Backend delta

- Add `plan` to the sheet-addressed save map (headers above).
- `GET ?action=read` → returns `plan` too: `{recipes, items, staples, plan}`.
- `POST {sheet:'plan', rows}` → reuses the existing full-replace path.

That's the whole backend change — one tab, no new dispatch logic.

## Smart aggregation engine (pure functions, node-tested)

Input: ingredient lines, each with an optional scale factor. Output: merged,
staples-aware, aisle-grouped grocery rows.

1. **`parseQty(str)`** — leading number in any form: integer, decimal, `1/2`,
   mixed `1 1/2`, unicode `½ ¼ ¾ ⅓ ⅔ ⅛`, range `2-3` (→ upper bound).
2. **`normalizeUnit(word)`** — synonym-fold (`tablespoon`/`T`/`tbs` → `tbsp`)
   against a known unit set; words that aren't units stay part of the name
   (`2 chicken breasts` → qty 2, no unit, name `chicken breasts`).
3. **`parseIngredient(line)`** → `{qty, unit, name, note}`. Note split at the
   first comma/parenthetical (`2 cloves garlic, minced` → name `garlic`,
   note `minced`).
4. **`canonicalName(name)`** — lowercase, drop the note, strip a conservative
   prep-descriptor stoplist (`minced, chopped, diced, sliced, fresh, to taste,
   optional, divided, large, small, medium…`) but keep identity words
   (`ground`, `smoked`, `boneless`). Light de-pluralize. → `garlic`.
5. **`aggregate(entries, {staples, existingItems})`** — group by
   `canonicalName + '|' + unit`; sum quantities within a key; tag each with
   `aisle` (keyword scorer: Produce · Meat & Seafood · Dairy & Eggs · Bakery ·
   Pantry & Dry · Spices · Frozen · Other), `isStaple` (canonical match against
   staples), and `sourceCount`. Merge into existing grocery items on the same
   key rather than duplicating.

The single-ingredient parser is also what serving-size scaling (a separate Tier
2 feature) will reuse.

## UI flows — one shared review modal

The aisle-grouped **review modal** (checkboxes, staples pre-unchecked, merged
quantities, per-item source count) is the single UI for:

- **Build week list:** Plan → “🧺 Build grocery list” → aggregate the visible
  week (each recipe scaled by its plan-entry servings) → review → add → jump to
  Groceries.
- **Single recipe → list:** the existing “To grocery list” routes through the
  same engine (dedupe within the recipe, skip staples, aisle labels).

## Plan UI

- Third mode tab, indigo accent.
- Week header with `‹ prev / next ›` nav, defaulting to this week (Mon start).
- Seven day cards; each lists assigned recipes (thumbnail, title, servings, ✕
  remove) and a **+ Add** that opens a recipe picker.
- Sticky **Build grocery list** button.
- Recipe detail gains **📅 Add to plan** → date picker.

## Build order

1. Pure engine (parser, canonicalizer, unit/aisle tables, aggregate) + fixtures
   under `kitchen/test/`.
2. Backend: add `plan` tab to read/save.
3. Plan UI (third mode, week nav, add/remove, picker, add-to-plan from detail).
4. Wire “Build grocery list” + refactor the send-to-grocery modal into the
   shared aisle-grouped review modal.
5. Node tests + end-to-end walkthrough.

## Out of scope for v1 (later)

- Cross-unit convertible summing (1 tbsp + 1 tsp → 4 tsp).
- Serving-size scaling on the recipe detail view (engine will already support it).
- Auto-marking planned recipes as "cooked" when their day passes.
- Drag-to-reorder / copy a day / duplicate last week.
