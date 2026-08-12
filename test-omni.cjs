const { GoogleGenAI } = require("@google/genai");
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
async function run() {
  console.log("Starting...");
  try {
    const session = await ai.live.connect({
      model: "gemini-omni-flash-preview"
    });
    console.log("Success connecting to omni");
    session.close();
  } catch(e) {
    console.error("Error omni:", e.message);
  }
}
run();
