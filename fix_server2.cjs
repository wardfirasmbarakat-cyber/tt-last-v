const fs = require('fs');
let content = fs.readFileSync('server.ts', 'utf-8');
content = content.replace(
  '   - Ask: "Do you have any special instructions for the kitchen?" / "هل لديك أي تعليمات خاصة للمطبخ؟"',
  '   - Before final order confirmation, if appropriate, ask ONCE: "Any special notes for the order?" / "هل لديك أي تعليمات خاصة للطلب؟". DO NOT repeatedly ask this after every item unless clarification is required.'
);
fs.writeFileSync('server.ts', content);
