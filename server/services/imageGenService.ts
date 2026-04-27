/**
 * imageGenService.ts
 * Generates 5 prayer topics based on a Bible verse explanation,
 * and a conversational prayer for heart-to-heart personal messages.
 */

import OpenAI from "openai";

/**
 * Generate 5 prayer topics inspired by the Bible verse in the AI response.
 * Returns a WhatsApp-formatted string ready to send.
 */
export async function generatePrayerTopics(
  verseResponse: string,
  aiApiUrl: string,
  aiApiKey: string,
  aiModel: string,
): Promise<string> {
  const client = new OpenAI({ baseURL: aiApiUrl, apiKey: aiApiKey });

  // Wait 8 seconds so the Groq TPM window partially recovers after the main AI call
  await new Promise(r => setTimeout(r, 8000));

  let result: Awaited<ReturnType<typeof client.chat.completions.create>> | null = null;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      result = await client.chat.completions.create({
        model: aiModel,
        messages: [
          {
            role: "system",
            content:
              "You are a Christian prayer guide. Based on the Bible verse explanation provided, generate exactly 5 short prayer topics and one closing prayer.\n\n" +
              "Output ONLY plain text in EXACTLY this format — no JSON, no code blocks, no extra headings:\n\n" +
              "1. Pray for [topic one]\n" +
              "2. Pray that [topic two]\n" +
              "3. Pray for [topic three]\n" +
              "4. Pray that [topic four]\n" +
              "5. Pray to [topic five]\n" +
              "---PRAYER---\n" +
              "Dear Heavenly Father, [3-5 warm, personal sentences based on the verse]. In Jesus name, Amen.\n\n" +
              "Do NOT include any text before the numbered topics or after the prayer.",
          },
          {
            role: "user",
            content: `Bible verse explanation:\n${verseResponse.slice(0, 600)}`,
          },
        ],
        max_tokens: 550,
        temperature: 0.7,
      });
      break;
    } catch (err: any) {
      if (err?.status === 429 && attempt < 3) {
        const wait = attempt * 10000;
        console.warn(`⏳ Prayer topics rate-limited — waiting ${wait / 1000}s before retry ${attempt + 1}/3`);
        await new Promise(r => setTimeout(r, wait));
      } else {
        throw err;
      }
    }
  }

  const raw = result?.choices[0]?.message?.content?.trim() ?? "";
  if (!raw) return "";

  // Split on the ---PRAYER--- delimiter the model is instructed to use
  const delimIdx = raw.indexOf("---PRAYER---");
  if (delimIdx !== -1) {
    const topicsPart = raw.slice(0, delimIdx).trim();
    const prayerPart = raw.slice(delimIdx + "---PRAYER---".length).trim();

    // Each numbered line becomes its own entry — strip any leading "1. " prefix variations
    const topicLines = topicsPart
      .split("\n")
      .map(l => l.trim())
      .filter(l => /^\d+\./.test(l))               // only numbered lines
      .map(l => l.replace(/^\d+\.\s*/, "").trim())  // strip the number prefix
      .slice(0, 5)
      .map((t, i) => `${i + 1}. ${t}`)
      .join("\n");

    return [
      `━━━━━━━━━━━━━━━━━━━━`,
      `🙏 *5 PRAYER TOPICS*`,
      `━━━━━━━━━━━━━━━━━━━━`,
      topicLines,
      ``,
      `━━━━━━━━━━━━━━━━━━━━`,
      `✝️ *PRAYER*`,
      `━━━━━━━━━━━━━━━━━━━━`,
      prayerPart,
    ].join("\n");
  }

  // Fallback: the delimiter was missing — try to extract numbered lines and any prayer text
  const lines = raw.split("\n").map(l => l.trim()).filter(Boolean);
  const numberedLines = lines.filter(l => /^\d+\./.test(l)).slice(0, 5);
  const prayerLines = lines.filter(l => /dear|heavenly father|lord|jesus|amen/i.test(l));

  if (numberedLines.length > 0) {
    const topicLines = numberedLines
      .map(l => l.replace(/^\d+\.\s*/, "").trim())
      .map((t, i) => `${i + 1}. ${t}`)
      .join("\n");

    const prayerText = prayerLines.join(" ");

    return [
      `━━━━━━━━━━━━━━━━━━━━`,
      `🙏 *5 PRAYER TOPICS*`,
      `━━━━━━━━━━━━━━━━━━━━`,
      topicLines,
      ...(prayerText ? [``, `━━━━━━━━━━━━━━━━━━━━`, `✝️ *PRAYER*`, `━━━━━━━━━━━━━━━━━━━━`, prayerText] : []),
    ].join("\n");
  }

  // Last resort — return raw text with a header so it at least looks intentional
  return `━━━━━━━━━━━━━━━━━━━━\n🙏 *PRAYER*\n━━━━━━━━━━━━━━━━━━━━\n${raw}`;
}

/**
 * Generate a personalised closing prayer based on what a user shared during
 * a heart-to-heart / motivational conversation.
 *
 * @param userMessage  - What the user originally shared (feelings / struggle)
 * @param botResponse  - The bot's empathetic Bible-based reply
 * @param aiApiUrl     - OpenAI-compatible base URL
 * @param aiApiKey     - API key
 * @param aiModel      - Model name
 * @returns A WhatsApp-formatted personal prayer string
 */
export async function generateConversationalPrayer(
  userMessage: string,
  botResponse: string,
  aiApiUrl: string,
  aiApiKey: string,
  aiModel: string,
): Promise<string> {
  const client = new OpenAI({ baseURL: aiApiUrl, apiKey: aiApiKey });

  // Brief pause so Groq TPM window partially recovers after the main AI call
  await new Promise(r => setTimeout(r, 8000));

  let result: Awaited<ReturnType<typeof client.chat.completions.create>> | null = null;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      result = await client.chat.completions.create({
        model: aiModel,
        messages: [
          {
            role: "system",
            content:
              "You are a compassionate Christian prayer minister. The user has shared something personal — a struggle, a feeling, or a need for encouragement. " +
              "Write ONE heartfelt, personal closing prayer (5-7 sentences) that:\n" +
              "1. Addresses what the user specifically shared (use their words/themes)\n" +
              "2. Incorporates the Bible truth from the conversation\n" +
              "3. Speaks directly to God on the user's behalf (use 'Lord', 'Heavenly Father', 'Father God')\n" +
              "4. Ends with 'In Jesus' name, Amen.'\n\n" +
              "Output ONLY the prayer text — no preamble, no explanation, no JSON. Just the prayer.",
          },
          {
            role: "user",
            content:
              `What the person shared:\n"${userMessage.slice(0, 400)}"\n\n` +
              `The Bible-based response they received:\n${botResponse.slice(0, 500)}`,
          },
        ],
        max_tokens: 350,
        temperature: 0.75,
      });
      break;
    } catch (err: any) {
      if (err?.status === 429 && attempt < 3) {
        const wait = attempt * 10000;
        console.warn(`⏳ Conversational prayer rate-limited — waiting ${wait / 1000}s before retry ${attempt + 1}/3`);
        await new Promise(r => setTimeout(r, wait));
      } else {
        throw err;
      }
    }
  }

  const prayerText = result?.choices[0]?.message?.content?.trim() ?? "";

  if (!prayerText) return "";

  return [
    `━━━━━━━━━━━━━━━━━━━━`,
    `🙏 *A PRAYER FOR YOU*`,
    `━━━━━━━━━━━━━━━━━━━━`,
    prayerText,
  ].join("\n");
}
