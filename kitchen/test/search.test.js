/*
 * Tests for the recipe web search scraper (extractSearchResults_), run against
 * the ACTUAL shipped backend code in ../backend.gs. The scraper parses
 * DuckDuckGo HTML search results.
 *
 *   node kitchen/test/search.test.js
 */
const fs = require('fs');
const path = require('path');

const gs = fs.readFileSync(path.join(__dirname, '..', 'backend.gs'), 'utf8');

// Extract extractSearchResults_, extractDdgUrl_, and decodeEntities_ together.
const fnBlock = gs.match(/function extractSearchResults_[\s\S]*?^}/m);
const ddgBlock = gs.match(/function extractDdgUrl_[\s\S]*?^}/m);
const decBlock = gs.match(/function decodeEntities_[\s\S]*?^}/m);
if (!fnBlock || !ddgBlock || !decBlock) {
  console.error('Could not find scraper functions in backend.gs');
  process.exit(2);
}

const src = fnBlock[0] + '\n' + ddgBlock[0] + '\n' + decBlock[0] +
  '\nreturn extractSearchResults_(html);';
const fn = new Function('html', src);

let pass = 0, fail = 0;
const eq = (n, g, w) => {
  const a = JSON.stringify(g), b = JSON.stringify(w);
  if (a === b) pass++; else { fail++; console.log('FAIL', n, '\n  got ', a, '\n  want', b); }
};

// Helper: build a DuckDuckGo-style result link
const ddgResult = (title, url) =>
  `<a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=${encodeURIComponent(url)}&rut=abc">${title}</a>`;

// --- basic extraction ---
eq('single result',
  fn(ddgResult('Chicken Tikka Masala', 'https://www.allrecipes.com/recipe/12345/chicken-tikka/')),
  [{ title: 'Chicken Tikka Masala', url: 'https://www.allrecipes.com/recipe/12345/chicken-tikka/', image: '', domain: 'allrecipes.com' }]
);

// --- deduplicates same URL ---
eq('deduplicates same URL',
  fn(ddgResult('Pasta', 'https://food.com/recipe/pasta') + ddgResult('Pasta Again', 'https://food.com/recipe/pasta')),
  [{ title: 'Pasta', url: 'https://food.com/recipe/pasta', image: '', domain: 'food.com' }]
);

// --- multiple results ---
eq('multiple results',
  fn(ddgResult('Recipe A', 'https://a.com/r1') + ddgResult('Recipe B', 'https://b.com/r2')),
  [
    { title: 'Recipe A', url: 'https://a.com/r1', image: '', domain: 'a.com' },
    { title: 'Recipe B', url: 'https://b.com/r2', image: '', domain: 'b.com' }
  ]
);

// --- HTML entity decoding ---
eq('decodes HTML entities',
  fn(ddgResult('Mac &amp; Cheese', 'https://food.com/mac')),
  [{ title: 'Mac & Cheese', url: 'https://food.com/mac', image: '', domain: 'food.com' }]
);

eq('decodes &#39; apostrophe',
  fn(ddgResult('Grandma&#39;s Pie', 'https://food.com/pie')),
  [{ title: "Grandma's Pie", url: 'https://food.com/pie', image: '', domain: 'food.com' }]
);

// --- strips www. from domain ---
eq('strips www from domain',
  fn(ddgResult('Soup', 'https://www.example.com/soup')),
  [{ title: 'Soup', url: 'https://www.example.com/soup', image: '', domain: 'example.com' }]
);

// --- skips non-http hrefs ---
eq('skips non-http href',
  fn(`<a class="result__a" href="javascript:void(0)">Bad</a>`),
  []
);

// --- skips very short titles ---
eq('skips short title',
  fn(ddgResult('AB', 'https://x.com/y')),
  []
);

// --- empty HTML ---
eq('empty HTML', fn(''), []);

// --- caps at 12 results ---
const many = Array.from({length: 20}, (_, i) =>
  ddgResult('Recipe ' + i, 'https://example.com/r' + i)
).join('\n');
eq('caps at 12', fn(many).length, 12);

// --- handles direct http href (no uddg redirect) ---
eq('direct http href',
  fn(`<a class="result__a" href="https://food.com/direct-recipe">Direct Recipe</a>`),
  [{ title: 'Direct Recipe', url: 'https://food.com/direct-recipe', image: '', domain: 'food.com' }]
);

// --- strips inner HTML tags from title ---
eq('strips inner tags',
  fn(`<a class="result__a" href="//duckduckgo.com/l/?uddg=${encodeURIComponent('https://food.com/x')}"><b>Bold</b> Title</a>`),
  [{ title: 'Bold Title', url: 'https://food.com/x', image: '', domain: 'food.com' }]
);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
