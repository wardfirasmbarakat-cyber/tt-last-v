const { GoogleGenAI } = require("@google/genai");
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
async function testModel(modelName) {
  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: [{ role: "user", parts: [{ text: "Hello" }] }],
    });
    console.log(`Success with ${modelName}`);
  } catch (err) {
    console.error(`Error with ${modelName}:`, err.message);
  }
}
async function run() {
  await testModel("gemini-3.6-flash");
  await testModel("gemini-flash-latest");
  await testModel("gemini-pro-latest");
  await testModel("gemini-2.5-flash-lite");
  await testModel("gemini-3.5-flash-lite");
}
run();
