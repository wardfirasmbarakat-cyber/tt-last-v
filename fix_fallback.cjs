const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const lines = code.split('\n');
// We need to replace the try-catch block from line 212.
let start = lines.findIndex(l => l.includes('responseStream = await ai.models.generateContentStream({')) - 1;
let end = lines.findIndex(l => l.includes('// Extract function calls from response while streaming chunks')) - 1;

const replacement = `    try {
      responseStream = await ai.models.generateContentStream({
        model: modelName,
        contents,
        config
      });
    } catch (err: any) {
      console.warn(\`Model generation stream failed with \${modelName}. Attempting fallback to gemini-3.5-flash...\`, err?.message || err);
      
      const fallbackConfig = {
        systemInstruction,
        temperature: 0.7,
        tools: waiterTools
      };

      try {
        finalModel = "gemini-3.5-flash";
        responseStream = await ai.models.generateContentStream({
          model: "gemini-3.5-flash",
          contents,
          config: fallbackConfig
        });
      } catch (err2: any) {
        console.warn("Failed with gemini-3.5-flash stream. Attempting final fallback to gemini-2.5-flash...", err2?.message || err2);
        
        finalModel = "gemini-2.5-flash";
        responseStream = await ai.models.generateContentStream({
          model: "gemini-2.5-flash",
          contents,
          config: fallbackConfig
        });
      }
    }`;

lines.splice(start, end - start + 1, replacement);
fs.writeFileSync('server.ts', lines.join('\n'));
