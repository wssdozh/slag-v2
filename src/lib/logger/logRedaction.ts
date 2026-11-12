// Masking secrets in log messages and payloads; the one place that knows what a secret looks like.

// Mask sensitive keys (Groq, Gemini, KIE, Bearer tokens, general secrets)
const SENSITIVE_PATTERNS = [
  /gsk_[a-zA-Z0-9_-]{20,}/g,
  /AIzaSy[a-zA-Z0-9_-]{30,}/g,
  /sk-kie-[a-zA-Z0-9_-]+/gi,
  /sk-[a-zA-Z0-9_-]{20,}/gi,
  /Bearer\s+[a-zA-Z0-9._-]+/gi,
  /key=[a-zA-Z0-9_-]{20,}/gi,
];

export function maskSensitiveString(value: string): string {
  let masked = value;
  for (const pattern of SENSITIVE_PATTERNS) {
    masked = masked.replace(pattern, (match) => {
      if (match.startsWith('Bearer ')) {
        return 'Bearer [REDACTED_TOKEN]';
      }
      if (match.startsWith('key=')) {
        return 'key=[REDACTED_KEY]';
      }
      return `${match.slice(0, 6)}...[REDACTED]`;
    });
  }
  return masked;
}

export function sanitizeForLog(data: unknown, depth = 0): unknown {
  if (depth > 5) return '[Truncated: Max Depth]';
  if (typeof data === 'string') {
    return maskSensitiveString(data);
  }
  if (data === null || data === undefined || typeof data !== 'object') {
    return data;
  }
  if (Array.isArray(data)) {
    return data.map(item => sanitizeForLog(item, depth + 1));
  }
  if (data instanceof Error) {
    return {
      name: data.name,
      message: maskSensitiveString(data.message),
      stack: data.stack ? maskSensitiveString(data.stack) : undefined,
    };
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(data as Record<string, unknown>)) {
    const lowerKey = key.toLowerCase();
    if (
      lowerKey.includes('key') ||
      lowerKey.includes('secret') ||
      lowerKey.includes('token') ||
      lowerKey.includes('password') ||
      lowerKey.includes('authorization')
    ) {
      sanitized[key] = '[REDACTED_SECRET]';
    } else {
      sanitized[key] = sanitizeForLog(val, depth + 1);
    }
  }
  return sanitized;
}
