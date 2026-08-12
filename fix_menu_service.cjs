const fs = require('fs');
let content = fs.readFileSync('src/services/voice/menuService.ts', 'utf-8');
content = content.replace(
  'this.normalizeDishQuery(item.name).includes(normName) &&',
  '(this.normalizeDishQuery(item.name).includes(normName) || normName.includes(this.normalizeDishQuery(item.name))) &&'
);
fs.writeFileSync('src/services/voice/menuService.ts', content);
