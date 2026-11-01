// Verifies GROQ_API_KEY and the configured models without printing the key.
// Usage: node --env-file=.env.local scripts/groq-check.mjs
import Groq from "groq-sdk";

const key = process.env.GROQ_API_KEY;
if (!key) {
  console.log("GROQ_API_KEY is empty.");
  process.exit(1);
}
const wanted = {
  GROQ_MODEL: process.env.GROQ_MODEL || "openai/gpt-oss-20b",
  GROQ_REASONING_MODEL: process.env.GROQ_REASONING_MODEL || "openai/gpt-oss-120b",
  GROQ_VISION_MODEL: process.env.GROQ_VISION_MODEL || "qwen/qwen3.8-27b",
};
const groq = new Groq({ apiKey: key });
const { data } = await groq.models.list();
const ids = data.map((m) => m.id).sort();
for (const [k, id] of Object.entries(wanted)) console.log(`${k}=${id}: ${ids.includes(id) ? "available" : "NOT available"}`);
console.log("\nVision-capable candidates on this account:", ids.filter((i) => /vision|scout|maverick|qwen|llama-4|vl/i.test(i)).join(", ") || "none");
console.log("All models:", ids.join(", "));
