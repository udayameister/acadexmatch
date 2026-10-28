'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { COUNTRY_OPTIONS } from '@/lib/phone';
import { authInput } from '@/components/AuthCard';
import type { CountryCode } from 'libphonenumber-js/min';

/* Building blocks shared by the sign-in, sign-up, recovery and account-security pages. */

export interface AuthMethods { sms: boolean; providers: ('google' | 'microsoft')[]; verifiedEmailRequired?: boolean }

/** Which sign-in methods the server has switched on (buttons for the rest stay hidden). */
export function useAuthMethods(): AuthMethods | null {
  const [m, setM] = useState<AuthMethods | null>(null);
  useEffect(() => {
    let live = true;
    fetch('/api/auth/methods', { cache: 'no-store' }).then(r => r.json()).then(d => { if (live) setM({ sms: !!d.sms, providers: Array.isArray(d.providers) ? d.providers : [], verifiedEmailRequired: !!d.verifiedEmailRequired }); }).catch(() => { if (live) setM({ sms: false, providers: [] }); });
    return () => { live = false; };
  }, []);
  return m;
}

/** Whether applying / posting needs a confirmed email address (true once email sending is set up). */
export function useVerifiedEmailRequired(): boolean {
  return !!useAuthMethods()?.verifiedEmailRequired;
}

/** Seconds left before another code may be requested. */
export function useCountdown(): [number, (s: number) => void] {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(() => setLeft(l => l - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);
  return [left, setLeft];
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" className="w-5 h-5" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.3-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.3-.4-3.5z" />
    </svg>
  );
}

function MicrosoftIcon() {
  return (
    <svg viewBox="0 0 23 23" className="w-5 h-5" aria-hidden="true">
      <path fill="#f35325" d="M1 1h10v10H1z" /><path fill="#81bc06" d="M12 1h10v10H12z" /><path fill="#05a6f0" d="M1 12h10v10H1z" /><path fill="#ffba08" d="M12 12h10v10H12z" />
    </svg>
  );
}

/** "Continue with Google / Microsoft" — only for providers that are configured on the server. */
export function SocialButtons({ methods, next, label = 'Continue with' }: { methods: AuthMethods | null; next?: string | null; label?: string }) {
  if (!methods?.providers.length) return null;
  const q = next && next.startsWith('/') ? `?next=${encodeURIComponent(next)}` : '';
  return (
    <div className="space-y-3">
      <div className="grid gap-2.5">
        {methods.providers.map(p => (
          <a key={p} href={`/api/auth/oauth/${p}/start${q}`} className="w-full py-2.5 rounded-xl bg-white border border-slate-300 hover:border-slate-400 hover:bg-slate-50 text-sm font-semibold text-slate-800 flex items-center justify-center gap-2.5 transition">
            {p === 'google' ? <GoogleIcon /> : <MicrosoftIcon />} {label} {p === 'google' ? 'Google' : 'Microsoft'}
          </a>
        ))}
      </div>
      <p className="text-xs text-slate-500 text-center">By continuing with {methods.providers.map(p => (p === 'google' ? 'Google' : 'Microsoft')).join(' or ')} you accept the <a href="/terms" target="_blank" className="underline">Terms of Service</a> and <a href="/privacy" target="_blank" className="underline">Privacy Policy</a>. New accounts created this way are candidate accounts.</p>
      <div className="flex items-center gap-3 text-xs text-slate-500"><span className="h-px flex-1 bg-slate-200" /> or <span className="h-px flex-1 bg-slate-200" /></div>
    </div>
  );
}

/** Password input with a show/hide control. */
export function PasswordField({ id, label, value, onChange, autoComplete = 'current-password', hint, right }: { id: string; label: string; value: string; onChange: (v: string) => void; autoComplete?: string; hint?: string; right?: React.ReactNode }) {
  const [show, setShow] = useState(false);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label htmlFor={id} className="block text-sm font-medium text-slate-700">{label}</label>
        {right}
      </div>
      <div className="relative">
        <input id={id} type={show ? 'text' : 'password'} required autoComplete={autoComplete} value={value} onChange={e => onChange(e.target.value)} className={`${authInput} pr-10`} aria-describedby={hint ? `${id}-hint` : undefined} />
        <button type="button" onClick={() => setShow(s => !s)} aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700">
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
      {hint && <p id={`${id}-hint`} className="text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

/** Country code + mobile number. */
export function PhoneField({ id, label, country, onCountry, value, onChange, required = true, hint }: { id: string; label: string; country: CountryCode; onCountry: (c: CountryCode) => void; value: string; onChange: (v: string) => void; required?: boolean; hint?: string }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-slate-700">{label}</label>
      <div className="flex gap-2">
        <select aria-label="Country code" value={country} onChange={e => onCountry(e.target.value as CountryCode)} className={`${authInput.replace('w-full ', '')} w-28 shrink-0 px-2`}>
          {COUNTRY_OPTIONS.map(c => <option key={c.code} value={c.code}>{c.dial} {c.code}</option>)}
        </select>
        <input id={id} type="tel" inputMode="tel" autoComplete="tel-national" required={required} value={value} onChange={e => onChange(e.target.value)} placeholder="98765 43210" className={`${authInput} flex-1 min-w-0`} />
      </div>
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

/** One box per digit; typing moves to the next box, pasting fills them all. */
export function OtpInput({ length = 6, value, onChange, autoFocus = true, disabled }: { length?: number; value: string; onChange: (v: string) => void; autoFocus?: boolean; disabled?: boolean }) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  useEffect(() => { if (autoFocus) refs.current[0]?.focus(); }, [autoFocus]);
  const digits = Array.from({ length }, (_, i) => value[i] || '');
  const setAt = (i: number, d: string) => {
    const arr = digits.slice();
    arr[i] = d;
    onChange(arr.join('').slice(0, length));
  };
  return (
    <div className="flex gap-2 justify-between" role="group" aria-label={`${length}-digit code`}>
      {digits.map((d, i) => (
        <input
          key={i}
          ref={el => { refs.current[i] = el; }}
          value={d}
          disabled={disabled}
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          aria-label={`Digit ${i + 1}`}
          maxLength={length}
          onChange={e => {
            const v = e.target.value.replace(/\D/g, '');
            if (v.length > 1) { onChange((digits.slice(0, i).join('') + v).slice(0, length)); refs.current[Math.min(length - 1, i + v.length)]?.focus(); return; }
            setAt(i, v);
            if (v && i < length - 1) refs.current[i + 1]?.focus();
          }}
          onKeyDown={e => {
            if (e.key === 'Backspace' && !digits[i] && i > 0) { setAt(i - 1, ''); refs.current[i - 1]?.focus(); }
            if (e.key === 'ArrowLeft' && i > 0) refs.current[i - 1]?.focus();
            if (e.key === 'ArrowRight' && i < length - 1) refs.current[i + 1]?.focus();
          }}
          onPaste={e => {
            const v = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
            if (v) { e.preventDefault(); onChange(v); refs.current[Math.min(length - 1, v.length)]?.focus(); }
          }}
          className="w-11 h-12 sm:w-12 sm:h-13 text-center text-lg font-bold rounded-xl bg-white border border-slate-300 text-slate-900 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:opacity-60"
        />
      ))}
    </div>
  );
}

/** Plain-language messages for ?oauth_error= after a Google/Microsoft sign-in. */
export const OAUTH_ERRORS: Record<string, string> = {
  cancelled: 'Sign-in was cancelled.',
  state: 'The sign-in took too long or was started in another tab. Please try again.',
  provider: 'The sign-in provider did not complete the sign-in. Please try again.',
  unavailable: 'This sign-in option is not available.',
  busy: 'Too many sign-in attempts. Please wait a few minutes.',
  noemail: 'Your account did not share an email address, so we could not create an AcadeXMatch account.',
  exists: 'An AcadeXMatch account with this email already exists. Sign in with your password (or SMS code) first, then add this sign-in option on your account page under Security.',
  signin: 'Please sign in first.',
};

export function Spinner() {
  return <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin inline-block" aria-hidden="true" />;
}
