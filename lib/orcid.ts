/** ORCID iD check (ISO 7064 11,2) usable in the browser and on the server. Returns "0000-0002-1825-0097" or null. */
export function parseOrcid(input: string): string | null {
  const m = String(input || '').trim().match(/(\d{4}-?\d{4}-?\d{4}-?\d{3}[\dXx])\/?$/);
  if (!m) return null;
  const digits = m[1].replace(/-/g, '').toUpperCase();
  let total = 0;
  for (const ch of digits.slice(0, 15)) total = (total + Number(ch)) * 2;
  const r = (12 - (total % 11)) % 11;
  if ((r === 10 ? 'X' : String(r)) !== digits[15]) return null;
  return digits.match(/.{4}/g)!.join('-');
}
