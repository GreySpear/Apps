/*
 * Tests for the recipe web search scraper (extractSearchResults_), run against
 * the ACTUAL shipped backend code in ../backend.gs.
 *
 *   node kitchen/test/search.test.js
 */
const fs = require('fs');
const path = require('path');

const gs = fs.readFileSync(path.join(__dirname, '..', 'backend.gs'), 'utf8');
const m = gs.match(/function extractSearchResults_[\s\S]*?^}/m);
if (!m) { console.error('Could not find extractSearchResults_ in backend.gs'); process.exit(2); }

const fn = new Function('html', m[0] + '\nreturn extractSearchResults_(html);');

let pass = 0, fail = 0;
const eq = (n, g, w) => {
  const a = JSON.stringify(g), b = JSON.stringify(w);
  if (a === b) pass++; else { fail++; console.log('FAIL', n, '\n  got ', a, '\n  want', b); }
};

// --- basic card extraction ---
eq('single card with img alt+src',
  fn(`<a href="https://www.allrecipes.com/recipe/12345/chicken-tikka/">
        <img alt="Chicken Tikka Masala" src="https://cdn.allrecipes.com/img/12345.jpg">
      </a>`),
  [{ title: 'Chicken Tikka Masala', url: 'https://www.allrecipes.com/recipe/12345/chicken-tikka/', image: 'https://cdn.allrecipes.com/img/12345.jpg' }]
);

eq('deduplicates same recipe ID',
  fn(`<a href="https://www.allrecipes.com/recipe/99/pasta/"><img alt="Pasta" src="https://cdn.example.com/1.jpg"></a>
      <a href="https://www.allrecipes.com/recipe/99/pasta/"><img alt="Pasta" src="https://cdn.example.com/1.jpg"></a>`),
  [{ title: 'Pasta', url: 'https://www.allrecipes.com/recipe/99/pasta/', image: 'https://cdn.example.com/1.jpg' }]
);

eq('multiple cards',
  fn(`<a href="https://www.allrecipes.com/recipe/1/aaa/"><img alt="Recipe A" src="https://cdn.example.com/a.jpg"></a>
      <a href="https://www.allrecipes.com/recipe/2/bbb/"><img alt="Recipe B" src="https://cdn.example.com/b.jpg"></a>`),
  [
    { title: 'Recipe A', url: 'https://www.allrecipes.com/recipe/1/aaa/', image: 'https://cdn.example.com/a.jpg' },
    { title: 'Recipe B', url: 'https://www.allrecipes.com/recipe/2/bbb/', image: 'https://cdn.example.com/b.jpg' }
  ]
);

// --- normalizes trailing slashes ---
eq('adds trailing slash',
  fn(`<a href="https://www.allrecipes.com/recipe/55/soup"><img alt="Soup" src="https://cdn.example.com/s.jpg"></a>`),
  [{ title: 'Soup', url: 'https://www.allrecipes.com/recipe/55/soup/', image: 'https://cdn.example.com/s.jpg' }]
);

// --- skips logo/icon alt text ---
eq('skips logo images',
  fn(`<a href="https://www.allrecipes.com/recipe/77/cake/">
        <img alt="AllRecipes Logo" src="https://cdn.example.com/logo.png">
        <img alt="Chocolate Cake" src="https://cdn.example.com/cake.jpg">
      </a>`),
  [{ title: 'Chocolate Cake', url: 'https://www.allrecipes.com/recipe/77/cake/', image: 'https://cdn.example.com/cake.jpg' }]
);

// --- HTML entity decoding ---
eq('decodes HTML entities',
  fn(`<a href="https://www.allrecipes.com/recipe/88/mac/">
        <img alt="Mac &amp; Cheese" src="https://cdn.example.com/mac.jpg">
      </a>`),
  [{ title: 'Mac & Cheese', url: 'https://www.allrecipes.com/recipe/88/mac/', image: 'https://cdn.example.com/mac.jpg' }]
);

// --- fallback to class-based title ---
eq('fallback to card__title class',
  fn(`<a href="https://www.allrecipes.com/recipe/42/stew/">
        <span class="card__title">Beef Stew</span>
      </a>`),
  [{ title: 'Beef Stew', url: 'https://www.allrecipes.com/recipe/42/stew/', image: '' }]
);

// --- no title, skips ---
eq('skips cards with no title',
  fn(`<a href="https://www.allrecipes.com/recipe/11/x/"></a>`),
  []
);

// --- empty HTML ---
eq('empty HTML', fn(''), []);

// --- caps at 12 results ---
const many = Array.from({length: 20}, (_, i) =>
  `<a href="https://www.allrecipes.com/recipe/${i}/r${i}/"><img alt="Recipe ${i}" src="https://cdn.example.com/${i}.jpg"></a>`
).join('\n');
eq('caps at 12', fn(many).length, 12);

// --- data-src fallback ---
eq('uses data-src when src missing',
  fn(`<a href="https://www.allrecipes.com/recipe/33/pie/">
        <img alt="Apple Pie" data-src="https://cdn.example.com/pie.jpg">
      </a>`),
  [{ title: 'Apple Pie', url: 'https://www.allrecipes.com/recipe/33/pie/', image: 'https://cdn.example.com/pie.jpg' }]
);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
