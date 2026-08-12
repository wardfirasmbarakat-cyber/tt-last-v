const { GoogleGenAI } = require("@google/genai");
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
async function run() {
  try {
    const session = await ai.live.connect({
      model: "gemini-2.5-flash"
    });
    console.log("Success connecting to 2.5-flash");
    session.close();
  } catch(e) {
    console.error("Error:", e.message);
  }
}
run();
