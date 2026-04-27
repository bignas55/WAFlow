const POSITIVE = new Set(["good","great","excellent","amazing","wonderful","fantastic","perfect","love","happy","thank","thanks","appreciate","helpful","awesome","brilliant","outstanding","superb","pleased","satisfied","impressed"]);
const NEGATIVE = new Set(["bad","terrible","awful","horrible","hate","angry","frustrated","disappointed","poor","worst","never","useless","wrong","broken","failed","cancel","refund","complaint","unacceptable","problem","issue"]);

export function analyzeSentiment(text: string): "positive" | "neutral" | "negative" {
  const words = text.toLowerCase().replace(/[^a-z\s]/g, "").split(/\s+/);
  let score = 0;
  for (const w of words) {
    if (POSITIVE.has(w)) score++;
    if (NEGATIVE.has(w)) score--;
  }
  if (score > 0) return "positive";
  if (score < 0) return "negative";
  return "neutral";
}
