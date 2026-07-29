/*
 * Tests for the Instagram / link-following import helpers, run against the
 * ACTUAL shipped code: it extracts the block between the KITCHEN-IMPORT-START /
 * -END markers in ../index.html and evaluates it, so the test can never drift
 * from what ships.
 *
 *   node kitchen/test/import.test.js
 */
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const m = html.match(/KITCHEN-IMPORT-START[\s\S]*?\*\/([\s\S]*?)\/\*\s*KITCHEN-IMPORT-END/);
if (!m) { console.error('Could not find import markers in index.html'); process.exit(2); }

const src = m[1] +
  '\n;return {extractUrls,urlHost,classifyLink,isInstagramUrl,instagramKind,' +
  'extractInstagramCaption,usableCaptionFromOg,AGGREGATOR_HOSTS,SOCIAL_HOSTS};';
const E = new Function(src)();

let pass = 0, fail = 0;
const eq = (n, g, w) => {
  const a = JSON.stringify(g), b = JSON.stringify(w);
  if (a === b) pass++; else { fail++; console.log('FAIL', n, '\n  got ', a, '\n  want', b); }
};

// --- extractUrls: find links in free-text captions ---
eq('one url', E.extractUrls('full recipe: https://food.com/tuscan-chicken yum'),
   ['https://food.com/tuscan-chicken']);
eq('trailing punct trimmed', E.extractUrls('see https://food.com/x.'),
   ['https://food.com/x']);
eq('paren trimmed', E.extractUrls('(https://food.com/x)'), ['https://food.com/x']);
eq('two urls dedup', E.extractUrls('a https://a.com/1 b https://a.com/1 c https://b.com/2'),
   ['https://a.com/1', 'https://b.com/2']);
eq('no url', E.extractUrls('just a caption, no links here'), []);

// --- urlHost: bare host, www./m. stripped ---
eq('host www',   E.urlHost('https://www.allrecipes.com/recipe/123'), 'allrecipes.com');
eq('host m',     E.urlHost('https://m.instagram.com/reel/abc'), 'instagram.com');
eq('host plain', E.urlHost('http://food.com/x?y=1#z'), 'food.com');

// --- classifyLink: recipe vs aggregator vs social ---
eq('c recipe',     E.classifyLink('https://www.allrecipes.com/recipe/123'), 'recipe');
eq('c blog',       E.classifyLink('https://halfbakedharvest.com/tuscan-chicken/'), 'recipe');
eq('c aggregator', E.classifyLink('https://linktr.ee/somecook'), 'aggregator');
eq('c beacons',    E.classifyLink('https://beacons.ai/somecook'), 'aggregator');
eq('c biolink',    E.classifyLink('https://bio.link/somecook'), 'aggregator');
eq('c instagram',  E.classifyLink('https://www.instagram.com/reel/abc/'), 'social');
eq('c tiktok',     E.classifyLink('https://www.tiktok.com/@x/video/1'), 'social');
eq('c youtube',    E.classifyLink('https://youtu.be/abc'), 'social');

// --- isInstagramUrl / instagramKind ---
eq('ig reel',    E.isInstagramUrl('https://www.instagram.com/reel/abc/'), true);
eq('ig short',   E.isInstagramUrl('https://instagr.am/p/abc/'), true);
eq('ig no',      E.isInstagramUrl('https://food.com/x'), false);
eq('kind reel',  E.instagramKind('https://www.instagram.com/reel/Cabc123/'), 'reel');
eq('kind reels', E.instagramKind('https://www.instagram.com/reels/Cabc123/'), 'reels');
eq('kind p',     E.instagramKind('https://www.instagram.com/p/Cabc123/'), 'p');
eq('kind tv',    E.instagramKind('https://www.instagram.com/tv/Cabc123/'), 'tv');
eq('kind share', E.instagramKind('https://www.instagram.com/share/_Cabc123/'), 'share');
eq('kind share-reel', E.instagramKind('https://www.instagram.com/share/reel/Cabc123/'), 'reel');
eq('kind user-prefixed', E.instagramKind('https://www.instagram.com/somecook/reel/Cabc/'), 'reel');
eq('kind profile', E.instagramKind('https://www.instagram.com/somecook/'), 'profile');
eq('kind not-ig', E.instagramKind('https://food.com/x'), null);

// --- extractInstagramCaption: lift caption out of og:description ---
eq('cap stats prefix',
   E.extractInstagramCaption({ description: '1,234 likes, 56 comments - chef.jo on July 1, 2024: "Creamy Tuscan Chicken 🍗 Full recipe below"' }),
   'Creamy Tuscan Chicken 🍗 Full recipe below');
eq('cap no prefix',
   E.extractInstagramCaption({ description: 'Just a plain description with no stats' }),
   'Just a plain description with no stats');
eq('cap empty', E.extractInstagramCaption({ description: '' }), '');
eq('cap missing', E.extractInstagramCaption({}), '');

// --- usableCaptionFromOg: login wall => '' ---
eq('usable ok',
   E.usableCaptionFromOg({ description: '10 likes, 2 comments - x on May 1, 2024: "Garlic butter shrimp pasta recipe"' }),
   'Garlic butter shrimp pasta recipe');
eq('usable walled short', E.usableCaptionFromOg({ description: 'Instagram' }), '');
eq('usable walled empty', E.usableCaptionFromOg({ description: '' }), '');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
