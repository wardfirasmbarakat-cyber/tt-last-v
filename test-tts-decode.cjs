const { GoogleGenAI } = require("@google/genai");
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
async function run() {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-preview-tts",
    contents: [{ role: "user", parts: [{ text: "Say hello" }] }],
    config: { responseModalities: ["AUDIO"] }
  });
  const base64Audio = response.candidates[0].content.parts[0].inlineData.data;
  const mime = response.candidates[0].content.parts[0].inlineData.mimeType;
  console.log("MIME:", mime);
  console.log("Length:", base64Audio.length);
}
run();
