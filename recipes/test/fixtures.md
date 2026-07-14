# Parser test fixtures

The three pure functions that power import & sorting — `parseCaption`,
`parseRecipeFromLdjson` (with its `parseInstructions` / `parseDuration` /
`parseImage` / `parseYield` helpers), and `categorize` — live inline in
`../index.html`. They were developed and exercised with Node before being
embedded, and the embedded copies were re-extracted from `index.html` and
re-run to confirm they behave identically. All cases below pass.

Duration formatting: `PT1H30M → "1 hr 30 min"`, `PT20M → "20 min"`,
`PT2H → "2 hr"`, `P0DT0H15M → "15 min"`, `"" → ""`.

---

## Caption fixtures (Instagram-style text paste)

### Caption 1 — emoji headings, mixed fractions, numbered steps, trailing hashtags

Input:

```
Creamy Garlic Tuscan Chicken 🍗😋 the BEST weeknight dinner!

🛒 Ingredients:
- 2 chicken breasts
- 1 tbsp olive oil
- ½ cup heavy cream
- 3 cloves garlic, minced
- 1/2 cup sun-dried tomatoes
- 2 cups spinach
- salt & pepper to taste

👩‍🍳 Instructions:
1. Season chicken and sear 5 min per side.
2. Add garlic and sun-dried tomatoes, cook 1 min.
3. Pour in cream, simmer until thick.
4. Stir in spinach until wilted. Serve!

Save this for later! 😍
#dinner #chickenrecipe #easyrecipes
```

Parsed:

- **title:** `Creamy Garlic Tuscan Chicken  the BEST weeknight dinner!`
- **ingredients:** `2 chicken breasts` · `1 tbsp olive oil` · `½ cup heavy cream` · `3 cloves garlic, minced` · `1/2 cup sun-dried tomatoes` · `2 cups spinach` · `salt & pepper to taste`
- **steps:** `Season chicken and sear 5 min per side.` · `Add garlic and sun-dried tomatoes, cook 1 min.` · `Pour in cream, simmer until thick.` · `Stir in spinach until wilted. Serve!` · `Save this for later!`
- **category →** `poultry`

Notes: the emoji "🛒 Ingredients:" / "👩‍🍳 Instructions:" lines are recognized
as headings (emoji-tolerant). The pure-hashtag last line is dropped as noise.
The "Save this for later!" sign-off is a known false-positive step — trivially
removed by the user on the always-shown edit screen.

### Caption 2 — no explicit headings, bullet-free ingredient lines, unicode fractions

Input:

```
Chewy Double Chocolate Cookies

½ cup butter
1 cup sugar
2 eggs
1 ¾ cups flour
⅓ cup cocoa powder
1 tsp baking soda
1 cup chocolate chips

Cream butter and sugar together.
Beat in eggs one at a time.
Fold in dry ingredients then the chocolate chips.
Bake at 350F for 11 minutes.
#baking #cookies #dessert 🍪
```

Parsed:

- **title:** `Chewy Double Chocolate Cookies`
- **ingredients:** `½ cup butter` · `1 cup sugar` · `2 eggs` · `1 ¾ cups flour` · `⅓ cup cocoa powder` · `1 tsp baking soda` · `1 cup chocolate chips`
- **steps:** `Cream butter and sugar together.` · `Beat in eggs one at a time.` · `Fold in dry ingredients then the chocolate chips.` · `Bake at 350F for 11 minutes.`
- **category →** `dessert`

Notes: with no headings, lines that start with a quantity/fraction/unit are
classified as ingredients and the remaining sentence-like lines become steps.
First short non-list line becomes the title.

---

## JSON-LD fixtures (URL import)

The backend (`../backend.gs`) returns raw `ld+json` block strings plus `og:`
meta. `parseRecipeFromLdjson(ldjsonStrings, og)` produces the recipe.

### JSON-LD 1 — plain `@type: "Recipe"`, HowToStep list

Input (one ld+json string): a `Recipe` named "Classic Beef Chili",
`recipeYield:"6 servings"`, `prepTime:"PT20M"`, `cookTime:"PT1H30M"`, 5
`recipeIngredient` strings, 3 `HowToStep` instructions.

Parsed:

- **title:** `Classic Beef Chili`
- **imageUrl:** `https://example.com/chili.jpg`
- **servings:** `6` · **prepTime:** `20 min` · **cookTime:** `1 hr 30 min`
- **ingredients:** 5 lines (`1 lb ground beef` … `1 can crushed tomatoes`)
- **steps:** `Brown the beef with onion.` · `Add spices and tomatoes.` · `Simmer 90 minutes.`
- **sourceFound:** `true` · **category →** `beef`

### JSON-LD 2 — `@graph`-wrapped, array `@type`, ImageObject image, HowToSection steps

Input: a `{"@graph":[…]}` document whose Recipe node has
`@type:["Recipe","NewsArticle"]`, `image` as an `ImageObject` (`.url`),
`recipeYield:["4"]`, and `recipeInstructions` composed of two `HowToSection`
blocks each containing `HowToStep` items.

Parsed:

- **title:** `Shrimp Scampi Linguine`
- **imageUrl:** `https://example.com/scampi.jpg` (unwrapped from ImageObject)
- **servings:** `4` (unwrapped from array) · **prepTime:** `10 min` · **cookTime:** `15 min`
- **ingredients:** 5 lines
- **steps:** flattened across both sections → `Boil the linguine.` · `Peel and devein the shrimp.` · `Saute garlic in butter.` · `Add shrimp and wine, cook until pink.` · `Toss with pasta.`
- **sourceFound:** `true` · **category →** `seafood`

### JSON-LD 3 — no Recipe node → og fallback

Input: only a `{"@type":"WebPage"}` block, with `og = {title:'Grandma Pie',
image:'https://x/pie.jpg', description:'A pie'}`.

Parsed: `title:"Grandma Pie"`, `imageUrl:"https://x/pie.jpg"`, empty
ingredients/steps, `notes:"A pie"`, **sourceFound:** `false`. The app lands on
the edit screen with these prefilled so the user can finish manually.

---

## Categorizer sanity (14/14)

Title matches weigh 3×, each ingredient match 1×. Dish-type categories
(dessert, soup) win over proteins; among proteins the highest score wins
(ties break beef > pork so e.g. a bacon cheeseburger reads as beef);
vegetables when only produce/tofu/beans/eggs hit; else others.

| Title | Ingredients | → Category |
|---|---|---|
| Chicken Soup | — | soup |
| Beef Pho | — | soup |
| Shrimp Tacos | — | seafood |
| Pork Belly Ramen | — | soup |
| Chocolate Cake | — | dessert |
| Chicken Wings | — | poultry |
| Veggie Stir Fry | tofu, broccoli, carrot | vegetables |
| Classic Beef Chili | ground beef, beans | beef |
| Salmon Fillet | — | seafood |
| Bacon Cheeseburger | — | beef |
| Mushroom Risotto | mushroom, rice | vegetables |
| Apple Pie | — | dessert |
| Turkey Chili | — | poultry |
| Lentil Curry | lentil, onion | vegetables |

Fix applied during testing: added `cheeseburger`/`hamburger` to the beef
keyword list (bare `burger` doesn't word-boundary-match inside "cheeseburger"),
and ordered protein tie-breaks beef-before-pork.
