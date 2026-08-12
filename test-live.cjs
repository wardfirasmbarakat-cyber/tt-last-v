const { GoogleGenAI } = require("@google/genai");
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
process.on('exit', (code) => console.log('Exiting', code));
async function run() {
  console.log("Starting live test...");
  try {
    const session = await ai.live.connect({
      model: "gemini-3.1-flash-live-preview"
    });
    console.log("Success connecting to live");
  } catch(e) {
    console.error("Error:", e.message);
  }
}
run();
