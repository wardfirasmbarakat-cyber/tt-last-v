const fs = require('fs');
let content = fs.readFileSync('src/components/AiWaiterChat.tsx', 'utf-8');
content = content.replace(/const activeCart = aiOrderItemsRef\.current\.length > 0 \? aiOrderItemsRef\.current : \(cartRef\.current && cartRef\.current\.length > 0 \? cartRef\.current : cart\);/g, 'const activeCart = cart;');
content = content.replace(/aiOrderItemsRef\.current\.length > 0 \? aiOrderItemsRef\.current : \(cartRef\.current && cartRef\.current\.length > 0 \? cartRef\.current : cart\),/g, 'cart,');
content = content.replace(/const displayOrderItems = aiOrderItems\.length > 0 \? aiOrderItems : cart;/g, 'const displayOrderItems = cart;');
fs.writeFileSync('src/components/AiWaiterChat.tsx', content);
