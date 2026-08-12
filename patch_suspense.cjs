const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

const target = `            {currentTab === "welcome" && (`;
const replacement = `            <React.Suspense fallback={<div className="flex justify-center p-12 h-full items-center"><Loader2 className="w-8 h-8 animate-spin text-[#C9A050]" /></div>}>
            {currentTab === "welcome" && (`;

code = code.replace(target, replacement);

const targetEnd = `              />\n            )}\n          </motion.div>\n        </AnimatePresence>`;
const replacementEnd = `              />\n            )}\n            </React.Suspense>\n          </motion.div>\n        </AnimatePresence>`;

code = code.replace(targetEnd, replacementEnd);

fs.writeFileSync('src/App.tsx', code);
