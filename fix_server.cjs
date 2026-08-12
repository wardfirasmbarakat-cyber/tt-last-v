const fs = require('fs');
let content = fs.readFileSync('server.ts', 'utf-8');
content = content.replace(
  '- SANDWICH TO MEAL CONVERSION: If the customer has a sandwich in their cart (e.g. Chicken Sandwich) and says "Make it a meal" or "خليها وجبة", locate the sandwich in the cart, remove it, and add the corresponding item from the "Meals" category (e.g. Chicken Escalope Meal / Crispy Chicken Meal) using the real menu item and price.',
  '- SANDWICH TO MEAL CONVERSION: If the customer has a sandwich in their cart and says "Make it a meal", you MUST call remove_item_from_cart on the sandwich, and then call add_items_to_cart for the MEAL version using the correct Meal item or Meal customization. DO NOT just add a note. You MUST replace the item so the price updates.'
);
fs.writeFileSync('server.ts', content);
