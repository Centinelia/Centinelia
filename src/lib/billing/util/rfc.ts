/**
 * rfc.ts -- Shared RFC sanitization utility for the billing module.
 *
 * Centralizes sanitizeRfc so callers do not duplicate the logic.
 * Previously duplicated in rules/apply.ts and cron/billing-periodic-cuts/route.ts.
 */

/**
 * Sanitizes an RFC string for use as a Dropbox path segment.
 * Replaces any character that is not alphanumeric with an underscore.
 *
 * @param rfc - RFC fiscal del receptor (e.g. "TDM040101ABC")
 * @returns sanitized string safe for use in file paths
 */
export function sanitizeRfc(rfc: string): string {
  return rfc.replace(/[^A-Za-z0-9]/g, '_');
}
