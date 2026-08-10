const E164_RE = /^\+[1-9]\d{9,14}$/;

export function isValidE164(phone: string | null | undefined): boolean {
  return typeof phone === 'string' && E164_RE.test(phone);
}

export function maskPhoneNumber(phone: string): string {
  if (!isValidE164(phone) || phone.length < 10) return phone;
  const country = phone.slice(0, 3);
  const area    = phone.slice(3, 5);
  const last4   = phone.slice(-4);
  return `${country} ${area} **** ${last4}`;
}
