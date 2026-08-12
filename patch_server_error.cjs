const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const errorHandlers = `
// --- GLOBAL ERROR HANDLING ---
process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught Exception:', err);
  // Do not crash the application, just log
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[FATAL] Unhandled Rejection at:', promise, 'reason:', reason);
  // Do not crash the application, just log
});
`;

code = code.replace(
  'const app = express();',
  errorHandlers + '\nconst app = express();'
);

fs.writeFileSync('server.ts', code);
