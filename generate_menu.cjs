const fs = require('fs');

let content = fs.readFileSync('src/data/menu.ts', 'utf8');

// The file has export const MENU_ITEMS: MenuItem[] = [ ... ];
// We can use a regex to replace the array, but it's hard.
// Let's just use string replace.

// Let's replace the whole Snacks items with Sandwich and Meal variants.
const fileLines = content.split('\n');
let insideSnacks = false;
let currentItem = '';
let newItems = [];

// Actually, the easiest way to modify TS data reliably is to compile it, process the array in Node, and then generate TS code. But we might lose comments.
