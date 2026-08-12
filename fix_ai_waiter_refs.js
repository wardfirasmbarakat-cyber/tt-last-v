import fs from 'fs';

let content = fs.readFileSync('src/components/AiWaiterChat.tsx', 'utf8');

// 1. handleModifyCart
content = content.replace(
  "const handleModifyCart = (action: { action: 'remove' | 'update_quantity'; itemId: string; quantity?: number }) => {\n    let updatedCart = cart;\n    if (action.action === 'remove') {",
  "const handleModifyCart = (action: { action: 'remove' | 'update_quantity'; itemId: string; quantity?: number }) => {\n    let updatedCart = cartRef.current;\n    if (action.action === 'remove') {"
);

content = content.replace(
  "    liveVoiceRef.current?.updateActiveOrderState(updatedCart, orderNotes);\n    return updatedCart;\n  };",
  "    cartRef.current = updatedCart;\n    liveVoiceRef.current?.updateActiveOrderState(updatedCart, orderNotes);\n    return updatedCart;\n  };"
);

// 2. handleNoteAction
content = content.replace(
  "const handleNoteAction = (note: { type: 'item' | 'order'; itemId?: string; note: string }) => {\n    let updatedCart = cart;",
  "const handleNoteAction = (note: { type: 'item' | 'order'; itemId?: string; note: string }) => {\n    let updatedCart = cartRef.current;"
);
content = content.replace(
  "          if (onUpdateItemNote) {\n            updatedCart = onUpdateItemNote(match.id, note.note) || updatedCart;\n          }\n        }\n      }\n    }\n\n    liveVoiceRef.current?.updateActiveOrderState(updatedCart, orderNotes);\n    return updatedCart;\n  };",
  "          if (onUpdateItemNote) {\n            updatedCart = onUpdateItemNote(match.id, note.note) || updatedCart;\n          }\n        }\n      }\n    }\n\n    cartRef.current = updatedCart;\n    liveVoiceRef.current?.updateActiveOrderState(updatedCart, orderNotes);\n    return updatedCart;\n  };"
);

// 3. handleAddToCartWrapper
content = content.replace(
  "    let updatedCart = cart;\n    if (onAddToCart) {\n      updatedCart = onAddToCart(items) || updatedCart;\n    }",
  "    let updatedCart = cartRef.current;\n    if (onAddToCart) {\n      updatedCart = onAddToCart(items) || updatedCart;\n      cartRef.current = updatedCart;\n    }"
);

fs.writeFileSync('src/components/AiWaiterChat.tsx', content);
