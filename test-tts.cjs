const { GoogleGenAI } = require("@google/genai");
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
async function run() {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: [{ role: "user", parts: [{ text: "Hello, this is a test." }] }],
      config: {
        responseModalities: ["AUDIO"],
      }
    });
    console.log("Success:", !!response.candidates[0].content.parts[0].inlineData.data);
    process.exit(0);
  } catch(e) {
    console.log("Error:", e.message);
    process.exit(1);
  }
}
run();
