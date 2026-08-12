const { GoogleGenAI } = require("@google/genai");
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
async function run() {
  const models = await ai.models.list({});
  let modelNames = [];
  for await (const m of models) {
    modelNames.push(m.name);
  }
  console.log(modelNames.filter(m => m.includes("tts") || m.includes("flash")));
}
run();
