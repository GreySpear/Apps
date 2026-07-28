/*
 * Tests for the smart-aggregation engine, run against the ACTUAL shipped code:
 * it extracts the block between the KITCHEN-ENGINE-START / -END markers in
 * ../index.html and evaluates it, so the test can never drift from what ships.
 *
 *   node kitchen/test/engine.test.js
 */
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
// Grab the code between the end of the START comment and the START of the END
// comment, so the surrounding /* … */ markers aren't captured.
const m = html.match(/KITCHEN-ENGINE-START[^\n]*?\*\/([\s\S]*?)\/\*\s*KITCHEN-ENGINE-END/);
if (!m) { console.error('Could not find engine markers in index.html'); process.exit(2); }

// Evaluate the engine block and capture its top-level functions.
const src = m[1] +
  '\n;return {parseQty,normalizeUnit,parseIngredient,canonicalName,aggregate,aisleFor,fmtQty,depluralize,roundQty};';
const E = new Function(src)();

let pass = 0, fail = 0;
const eq = (n, g, w) => {
  const a = JSON.stringify(g), b = JSON.stringify(w);
  if (a === b) pass++; else { fail++; console.log('FAIL', n, '\n  got ', a, '\n  want', b); }
};
const near = (n, g, w) => {
  if (Math.abs(g - w) < 1e-6) pass++; else { fail++; console.log('FAIL', n, 'got', g, 'want', w); }
};

// --- parseQty: every quantity form ---
near('int',      E.parseQty('2 cups').value, 2);
near('decimal',  E.parseQty('1.5 lb').value, 1.5);
near('fraction', E.parseQty('1/2 cup').value, 0.5);
near('mixed',    E.parseQty('1 1/2 cups').value, 1.5);
near('unicode',  E.parseQty('½ cup').value, 0.5);
near('mixedUni', E.parseQty('1½ cup').value, 1.5);
near('range',    E.parseQty('2-3 cloves').value, 3);   // upper bound
near('rangeEn',  E.parseQty('2–3 cloves').value, 3);
eq  ('noQty',    E.parseQty('salt to taste').value, null);

// --- units ---
eq('unit syn',   E.normalizeUnit('tablespoons'), 'tbsp');
eq('unit case',  E.normalizeUnit('Cups'), 'cup');
eq('non-unit',   E.normalizeUnit('chicken'), null);

// --- parseIngredient ---
eq('lead unit',  E.parseIngredient('2 cloves garlic, minced'), {qty:2,unit:'clove',name:'garlic',note:'minced',raw:'2 cloves garlic, minced'});
eq('trail unit', E.parseIngredient('3 garlic cloves'),         {qty:3,unit:'clove',name:'garlic',note:'',raw:'3 garlic cloves'});
eq('no unit',    E.parseIngredient('2 chicken breasts'),       {qty:2,unit:'',name:'chicken breasts',note:'',raw:'2 chicken breasts'});
eq('parenthetical', E.parseIngredient('1 (14 oz) can diced tomatoes'), {qty:1,unit:'can',name:'diced tomatoes',note:'14 oz',raw:'1 (14 oz) can diced tomatoes'});

// --- canonicalName merges phrasings ---
eq('desc strip', E.canonicalName('garlic, minced'), 'garlic');
eq('size strip', E.canonicalName('large eggs'), 'egg');
eq('identity kept', E.canonicalName('ground beef'), 'ground beef');
eq('lead==trail', E.canonicalName(E.parseIngredient('2 cloves garlic').name),
                  E.canonicalName(E.parseIngredient('2 garlic cloves').name));

// --- aisles ---
eq('a produce', E.aisleFor('garlic'), 'Produce');
eq('a meat',    E.aisleFor('chicken breast'), 'Meat & Seafood');
eq('a dairy',   E.aisleFor('heavy cream'), 'Dairy & Eggs');
eq('a bakery',  E.aisleFor('bread'), 'Bakery');
eq('a pantry',  E.aisleFor('flour'), 'Pantry & Dry');
eq('a spice',   E.aisleFor('salt'), 'Spices');

// --- fmtQty ---
eq('f half',  E.fmtQty(0.5), '½');
eq('f 1.5',   E.fmtQty(1.5), '1 ½');
eq('f whole', E.fmtQty(2), '2');
eq('f third', E.fmtQty(1/3), '⅓');
eq('f null',  E.fmtQty(null), '');

// --- aggregate: merge + scale + staples + aisle order + existing-list flag ---
const agg = E.aggregate([
  { ingredient: '3 cloves garlic, minced', scale: 1 },
  { ingredient: '½ cup heavy cream',        scale: 1 },
  { ingredient: '2 chicken breasts',        scale: 1 },
  { ingredient: '2 garlic cloves',          scale: 1 },   // different phrasing -> merges
  { ingredient: '1 loaf bread',             scale: 1 },
  { ingredient: '2 tbsp butter',            scale: 1 }
], { staples: [{ name: 'butter' }], existingItems: [{ name: 'heavy cream', unit: 'cup' }] });

const byKey = Object.fromEntries(agg.map(a => [a.name + '|' + a.unit, a]));
near('merge garlic qty', byKey['garlic|clove'].qty, 5);
eq  ('merge garlic src', byKey['garlic|clove'].sourceCount, 2);
eq  ('garlic aisle',     byKey['garlic|clove'].aisle, 'Produce');
eq  ('butter staple',    byKey['butter|tbsp'].isStaple, true);
eq  ('cream inList',     byKey['heavy cream|cup'].inList, true);
eq  ('chicken aisle',    byKey['chicken breast|'].aisle, 'Meat & Seafood');
eq  ('sorted produce 1st', agg[0].aisle, 'Produce');

const scaled = E.aggregate([{ ingredient: '1 lb beef', scale: 2 }], {});
near('serving scale', scaled[0].qty, 2);

const noqty = E.aggregate([{ ingredient: 'salt and pepper to taste', scale: 1 }], {});
eq('qtyless present', noqty.length >= 1, true);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
