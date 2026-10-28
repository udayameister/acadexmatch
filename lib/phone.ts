import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js/min';

/* Mobile numbers, shared by the browser and the server. Stored in E.164 form (+919876543210). */

export interface PhoneResult { ok: boolean; e164?: string; display?: string; error?: string }

/** Validates a mobile number typed with or without the country code (default India). */
export function normalisePhone(input: string, country: CountryCode = 'IN'): PhoneResult {
  const raw = String(input || '').trim();
  if (!raw) return { ok: false, error: 'Please enter your mobile number.' };
  const p = parsePhoneNumberFromString(raw, country);
  if (!p || !p.isValid()) return { ok: false, error: 'Please enter a valid mobile number with its country code, e.g. +91 98765 43210.' };
  const type = p.getType();
  if (type && type !== 'MOBILE' && type !== 'FIXED_LINE_OR_MOBILE') return { ok: false, error: 'Please enter a mobile number (it must be able to receive SMS).' };
  return { ok: true, e164: p.number, display: p.formatInternational() };
}

/** "+91 98765 43210" → "+91 ••••• ••210" for messages that should not reveal the full number. */
export function maskPhone(e164: string | undefined | null): string {
  if (!e164) return '';
  const p = parsePhoneNumberFromString(e164);
  const cc = p ? `+${p.countryCallingCode}` : '';
  const rest = p ? String(p.nationalNumber) : e164.replace(/^\+/, '');
  return `${cc} ${'•'.repeat(Math.max(0, rest.length - 3))}${rest.slice(-3)}`.trim();
}

export const COUNTRY_OPTIONS: { code: CountryCode; label: string; dial: string }[] = [
  { code: 'IN', label: 'India', dial: '+91' },
  { code: 'AE', label: 'United Arab Emirates', dial: '+971' },
  { code: 'SA', label: 'Saudi Arabia', dial: '+966' },
  { code: 'QA', label: 'Qatar', dial: '+974' },
  { code: 'OM', label: 'Oman', dial: '+968' },
  { code: 'US', label: 'United States', dial: '+1' },
  { code: 'GB', label: 'United Kingdom', dial: '+44' },
  { code: 'SG', label: 'Singapore', dial: '+65' },
  { code: 'MY', label: 'Malaysia', dial: '+60' },
  { code: 'AU', label: 'Australia', dial: '+61' },
  { code: 'ET', label: 'Ethiopia', dial: '+251' },
  { code: 'LK', label: 'Sri Lanka', dial: '+94' },
  { code: 'NP', label: 'Nepal', dial: '+977' },
  { code: 'BD', label: 'Bangladesh', dial: '+880' },
];
