const { GoogleGenAI } = require("@google/genai");
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
async function run() {
  const models = ["gemini-2.5-flash-preview-tts", "gemini-2.5-pro-preview-tts"];
  for (const model of models) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: [{ role: "user", parts: [{ text: "Say hello" }] }],
        config: { responseModalities: ["AUDIO"] }
      });
      console.log(`Success with ${model}:`, !!response.candidates[0].content.parts[0].inlineData.data);
    } catch(e) {
      console.log(`Error with ${model}:`, e.message);
    }
  }
}
run();
