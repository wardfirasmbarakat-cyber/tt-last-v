const { GoogleGenAI } = require("@google/genai");
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
async function run() {
  try {
    const session = await ai.live.connect({
      model: "gemini-2.0-flash"
    });
    console.log("SUCCESS");
    process.exit(0);
  } catch(e) {
    console.log("ERROR:", e.message);
    process.exit(1);
  }
}
run();
setTimeout(() => { console.log("TIMEOUT"); process.exit(0); }, 15000);
