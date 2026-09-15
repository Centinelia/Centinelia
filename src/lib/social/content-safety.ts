/**
 * Content safety gate for posts before publishing.
 *
 * Checks:
 *   1. Denylist word match (case-insensitive)
 *   2. URLs: domain not in allowedDomains → violation (empty list = no restriction)
 *   3. URLs: invalid syntax → violation
 *   4. @mentions: collected and validated when mentionWhitelist is provided (v1 todo)
 *
 * Pure function — no I/O, no LLM, no side effects.
 * Spec Section 7.2.
 */

export interface ContentSafetyResult {
  safe: boolean;
  violations: string[];
}

/**
 * Checks post text against denylist words and URL/domain rules.
 *
 * @param text             The text to check (post body, caption, etc.)
 * @param denylist         Words/phrases that are forbidden (case-insensitive).
 * @param allowedDomains   Domains allowed in URLs (e.g. ['centinelia.mx']).
 *                         Pass `[]` to skip URL domain checks entirely.
 * @param mentionWhitelist If provided, @mentions not in this list are flagged.
 *                         Omit (or pass `undefined`) to skip mention checks.
 */
export function checkContentSafety(
  text: string,
  denylist: string[],
  allowedDomains: string[] = [],
  mentionWhitelist?: string[],
): ContentSafetyResult {
  const violations: string[] = [];
  const lower = text.toLowerCase();

  // ── 1. Denylist words ─────────────────────────────────────────────────────
  for (const word of denylist) {
    if (word && lower.includes(word.toLowerCase())) {
      violations.push(`denylist: ${word}`);
    }
  }

  // ── 2 & 3. URL checks ─────────────────────────────────────────────────────
  const urlMatches = text.match(/https?:\/\/[^\s"'<>]+/g) ?? [];
  for (const raw of urlMatches) {
    // Strip trailing punctuation that was likely not part of the URL
    const url = raw.replace(/[.,;:!?)]+$/, '');
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      violations.push(`invalid URL: ${url}`);
      continue;
    }

    // Domain restriction only applies when allowedDomains is non-empty
    if (allowedDomains.length > 0) {
      const hostname = parsed.hostname.replace(/^www\./, '');
      const allowed = allowedDomains.some(
        (d) => hostname === d || hostname.endsWith('.' + d),
      );
      if (!allowed) {
        violations.push(`domain not whitelisted: ${hostname}`);
      }
    }
  }

  // ── 4. @mention checks (v1: optional whitelist) ───────────────────────────
  if (mentionWhitelist !== undefined) {
    // Match @handle but strip trailing dots/punctuation that are part of the sentence
    const rawMentions = text.match(/@[A-Za-z0-9._]+/g) ?? [];
    for (const raw of rawMentions) {
      const mention = raw.replace(/[.,;:!?]+$/, '');
      const handle = mention.slice(1).toLowerCase(); // strip @
      if (!mentionWhitelist.map((m) => m.toLowerCase()).includes(handle)) {
        violations.push(`unauthorized mention: ${mention}`);
      }
    }
  }

  return { safe: violations.length === 0, violations };
}
