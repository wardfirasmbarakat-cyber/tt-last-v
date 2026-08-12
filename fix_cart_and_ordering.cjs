const fs = require('fs');
let content = fs.readFileSync('src/components/CartAndOrdering.tsx', 'utf-8');
content = content.replace(
  '      customizations: item.customizations',
  '      customizations: item.customizations,\n      note: item.note || "",\n      notes: item.note || ""'
);
fs.writeFileSync('src/components/CartAndOrdering.tsx', content);
