import fs from 'fs';

let content = fs.readFileSync('src/components/AiWaiterChat.tsx', 'utf8');

// Add cartRef
const refInsert = `
  const cartRef = useRef(cart);
  useEffect(() => {
    cartRef.current = cart;
  }, [cart]);
`;
content = content.replace(
  '  const activeAbortControllerRef = useRef<AbortController | null>(null);',
  '  const activeAbortControllerRef = useRef<AbortController | null>(null);\n' + refInsert
);

content = content.replace(
  'let effectiveItems = [...cart];',
  'let effectiveItems = [...cartRef.current];'
);

// We need to stop trusting submitItemsPayload completely, because the customer edit needs to be the single source of truth.
// If the AI says "update quantity", and then "submit order", the submit payload might have the OLD quantity.
// The prompt says "DO NOT use: an old AI-generated order object... Immediately before submitting the order, read the CURRENT authoritative cart state."
const ignorePayloadRegex = /\/\/ If AI tool call passed items directly[\s\S]*?if \(!effectiveItems \|\| effectiveItems\.length === 0\)/;
content = content.replace(
  ignorePayloadRegex,
  '// Use authoritative cart state\\n    if (!effectiveItems || effectiveItems.length === 0)'
);

fs.writeFileSync('src/components/AiWaiterChat.tsx', content);
