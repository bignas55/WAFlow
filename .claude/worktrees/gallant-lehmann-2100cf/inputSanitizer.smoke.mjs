/**
 * inputSanitizer.ts
 *
 * Sanitizes incoming customer messages before they reach the AI pipeline.
 *
 * Security goals:
 *  1. Detect & neutralize prompt-injection attempts
 *     (e.g. "Ignore previous instructions", "You are now DAN", etc.)
 *  2. Truncate abnormally long messages that could be used to exhaust tokens
 *     or smuggle hidden instructions in padding.
 *  3. Strip null-bytes and other control characters that can confuse tokenizers.
 *  4. Log (but never silently drop) suspicious inputs so the tenant can review them.
 */
/** Maximum character length accepted from a customer before truncation. */
const MAX_INPUT_LENGTH = 2000;
/** Patterns that strongly indicate a prompt-injection attempt. */
const INJECTION_PATTERNS = [
    // Classic "ignore instructions" variants
    /ignore\s+(all\s+)?(previous|prior|above|earlier|old)\s+(instructions?|prompts?|rules?|system|context)/i,
    /disregard\s+(all\s+)?(previous|prior|above|system)\s+(instructions?|prompts?|rules?|context)/i,
    /forget\s+(all\s+)?(previous|prior|above|your)\s+(instructions?|prompts?|rules?|context|role)/i,
    // "You are now / act as" jailbreak attempts
    /\byou\s+are\s+now\b(?!\s+(available|open|here|ready))/i, // "you are now DAN" but not "you are now available"
    /\bact\s+as\s+(if\s+you\s+are\s+)?(a\s+)?(different|new|another|an?\s+\w+\s+)?(?:ai|bot|assistant|system|character)/i,
    /\bpretend\s+(you\s+are|to\s+be)\b/i,
    /\bbehave\s+as\s+(if|a)\b/i,
    // Role/system prompt overrides
    /\[(system|assistant|user|human|ai)\s*\]:/i, // [system]: or [user]:
    /^(system|assistant)\s*:\s*/im, // "System: Do this"
    /<\s*(system|instruction|prompt)\s*>/i, // <system> tags
    /#{1,6}\s*(system|instructions?|rules?|context)\s*$/im, // markdown header tricks
    // Token/context manipulation
    /\bcontext\s+window\b/i,
    /\bsystem\s+prompt\b/i,
    /\bprevious\s+prompt\b/i,
    /\binitial\s+instructions?\b/i,
    /\bbase\s+instructions?\b/i,
    /\boriginal\s+prompt\b/i,
    // Encoding tricks (base64 encoded instructions passed as messages)
    /\beval\s*\(/i,
    /\bexec\s*\(/i,
    /\batob\s*\(/i,
    /\bbtoa\s*\(/i,
    // "Do anything now" and similar DAN/jailbreak keywords
    /\bDAN\b(?!\s+\d)/, // "DAN" but not "DAN 1" (could be a name)
    /\bjailbreak\b/i,
    /\bunrestricted\s+mode\b/i,
    /\bdeveloper\s+mode\b/i,
    /\bgod\s+mode\b/i,
    /\bno\s+filter\s+mode\b/i,
    // Instruction injection via newlines / separators
    /---+\s*\n\s*(system|instructions?|rules?)/i,
    /={3,}\s*\n\s*(system|instructions?)/i,
];
/**
 * Sanitize an incoming customer message.
 *
 * - Strips null bytes and dangerous control characters.
 * - Truncates to MAX_INPUT_LENGTH.
 * - Detects prompt injection patterns and wraps the message in a safety
 *   delimiter so the AI can't mistake it for instructions.
 */
export function sanitizeIncomingMessage(raw) {
    const original = raw;
    // 1. Strip null bytes and non-printable control chars (keep \n, \r, \t)
    let text = raw
        .replace(/\0/g, "") // null bytes
        .replace(/[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/g, " ") // other control chars
        .trim();
    // 2. Detect injection patterns on the raw text (before truncation)
    const injectionDetected = INJECTION_PATTERNS.some((re) => re.test(text));
    // 3. Truncate excessively long messages
    let truncated = false;
    if (text.length > MAX_INPUT_LENGTH) {
        text = text.slice(0, MAX_INPUT_LENGTH) + " [message truncated]";
        truncated = true;
    }
    // 4. If injection was detected, wrap the message in a safety delimiter.
    //    This prevents the content from being interpreted as instructions
    //    even if the AI is somewhat susceptible to injection.
    if (injectionDetected) {
        text = `[CUSTOMER MESSAGE START]\n${text}\n[CUSTOMER MESSAGE END]`;
    }
    return { text, injectionDetected, truncated, original };
}
/**
 * Log a suspicious message (injection detected) without exposing it in
 * plain-text logs (truncate + mask the middle).
 */
export function logSuspiciousInput(tenantId, phone, original) {
    const preview = original.length > 120
        ? original.slice(0, 60) + "…[" + (original.length - 80) + " chars]…" + original.slice(-20)
        : original;
    console.warn(`🚨 [Security] Prompt injection attempt detected | tenant=${tenantId} | phone=${phone} | preview="${preview}"`);
}
