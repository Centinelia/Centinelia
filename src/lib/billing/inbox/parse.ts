/**
 * parse.ts — Resend Inbound webhook payload parser for the billing empleado digital.
 *
 * Resend Inbound delivers email as multipart/form-data. The route handler reads
 * the FormData and passes a normalized plain object here so this module remains
 * pure (no Request dependency) and is trivially testable.
 *
 * ALLOWED_TYPES: only images and PDFs are accepted as billing attachments.
 * All other MIME types are silently dropped.
 *
 * message_id: extracted from the Message-ID header string (Resend passes raw
 * headers as a newline-delimited string in the `headers` form field). Used for
 * SMTP threading when replyToInboundEmail constructs In-Reply-To / References.
 */

export interface ParsedAttachment {
  filename:    string;
  contentType: string;
  content:     Buffer;
}

export interface ParsedInboundEmail {
  from:            string;
  to:              string;
  subject:         string;
  text:            string;
  attachments:     ParsedAttachment[];
  hasAttachments:  boolean;
  /** Message-ID header from the original email, if present. */
  messageId:       string | null;
}

/** MIME types accepted as billing note attachments. */
const ALLOWED_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'application/pdf',
]);

/**
 * Normalised raw payload from the route (already extracted from FormData).
 * Attachment content may arrive as base64 string (JSON path) or Buffer (already
 * decoded by the route from a File object).
 */
export interface RawInboundPayload {
  from?:        string;
  to?:          string;
  subject?:     string;
  text?:        string;
  headers?:     string;
  attachments?: {
    filename:    string;
    contentType: string;
    /** base64 string (from JSON path) or Buffer (from multipart File). */
    content:     string | Buffer;
  }[];
}

/**
 * Parse and validate an inbound email webhook payload.
 *
 * Filters attachments to ALLOWED_TYPES and decodes base64 strings to Buffer.
 * Extracts Message-ID from the raw headers string for SMTP threading.
 */
export function parseInboundEmail(payload: RawInboundPayload): ParsedInboundEmail {
  const attachments: ParsedAttachment[] = (payload.attachments ?? [])
    .filter((a) => ALLOWED_TYPES.has(a.contentType))
    .map((a) => ({
      filename:    a.filename,
      contentType: a.contentType,
      content:
        a.content instanceof Buffer
          ? a.content
          : Buffer.from(a.content as string, 'base64'),
    }));

  const messageId = extractMessageId(payload.headers ?? '');

  return {
    from:           payload.from          ?? '',
    to:             payload.to            ?? '',
    subject:        payload.subject       ?? '',
    text:           payload.text          ?? '',
    attachments,
    hasAttachments: attachments.length > 0,
    messageId,
  };
}

/**
 * Extract the Message-ID value from a raw headers string.
 *
 * Resend Inbound passes headers as a newline-delimited string, e.g.:
 *   "Message-ID: <abc123@mail.example.com>\nFrom: ..."
 *
 * Returns null if no Message-ID header is found.
 */
function extractMessageId(headers: string): string | null {
  const match = headers.match(/^Message-I[dD]:\s*<?([^>\s\r\n]+)>?/m);
  return match ? match[1] : null;
}
