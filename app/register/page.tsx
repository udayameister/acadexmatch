'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { StorageService, institutionDomain } from '@/lib/storage';
import { homePathForRole } from '@/lib/useAuth';
import { Institute, UserRole } from '@/types';
import { GraduationCap, Building2, ArrowRight, CheckCircle2, Crown } from 'lucide-react';
import { PasswordField, PhoneField, SocialButtons, Spinner, useAuthMethods } from '@/components/AuthWidgets';
import { normalisePhone } from '@/lib/phone';
import { passwordProblem, passwordStrength } from '@/lib/passwordPolicy';
import type { CountryCode } from 'libphonenumber-js/min';

const inputCls =
  'w-full bg-white border border-slate-300 rounded-xl px-3.5 py-3 text-sm text-slate-900 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100';

export default function RegisterPage() {
  const router = useRouter();
  const [role, setRole] = useState<UserRole>('candidate');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [country, setCountry] = useState<CountryCode>('IN');
  const [phone, setPhone] = useState('');
  const [marketing, setMarketing] = useState(false);
  const methods = useAuthMethods();
  const [institutes, setInstitutes] = useState<Institute[]>([]);
  const [instituteMode, setInstituteMode] = useState<'existing' | 'new'>('existing');
  const [instituteId, setInstituteId] = useState('');
  const [newInst, setNewInst] = useState({ name: '', aisheCode: '', city: '', state: '', website: '' });
  const [consent, setConsent] = useState(false);
  const [agreePlan, setAgreePlan] = useState(false);
  const planSettings = StorageService.getPlanSettings();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setErrorState] = useState<string | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  // Show the problem where the person is looking (next to the button) and scroll it into view.
  const setError = (msg: string | null) => {
    setErrorState(msg);
    if (msg) setTimeout(() => errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0);
  };

  useEffect(() => {
    const user = StorageService.getCurrentUser();
    if (user) router.replace(homePathForRole(user.role));
    setInstitutes(StorageService.getInstitutes().filter(i => i.verificationStatus !== 'rejected'));
  }, [router]);

  const selectedInstitute = useMemo(() => institutes.find(i => i.id === instituteId), [institutes, instituteId]);
  const requiredDomain = selectedInstitute ? institutionDomain(selectedInstitute) : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const ph = normalisePhone(phone, country);
    if (!ph.ok) { setError(ph.error || 'Please enter a valid mobile number.'); return; }
    const weak = passwordProblem(password, { email, name });
    if (weak) { setError(weak); return; }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    if (role === 'institute_admin' && !agreePlan) {
      setError('Institution accounts require the Institution Premium subscription. Please accept it to continue.');
      return;
    }
    if (!consent) {
      setError('Please accept the Terms of Service and Privacy Policy to continue.');
      return;
    }
    if (role === 'institute_admin' && instituteMode === 'existing' && !instituteId) {
      setError('Please select your institute, or choose “Register a new institute”.');
      return;
    }
    setIsSubmitting(true);
    let res;
    try {
      res = await StorageService.register({
      name,
      email,
      password,
      role,
      phone: ph.e164,
      country,
      termsAccepted: true,
      marketingConsent: marketing,
      instituteId: role === 'institute_admin' && instituteMode === 'existing' ? instituteId : undefined,
      newInstitute: role === 'institute_admin' && instituteMode === 'new' ? newInst : undefined,
      });
    } catch {
      res = { success: false as const, error: 'Could not reach the server. Check your internet connection and try again.' };
    }
    setIsSubmitting(false);
    if (!res.success) {
      setError(res.error || 'Registration failed. Please check the details and try again.');
      return;
    }
    router.push(res.user.role === 'candidate' ? '/candidate/profile?welcome=1' : homePathForRole(res.user.role));
  };

  const roleOptions: { key: UserRole; label: string; desc: string; icon: typeof GraduationCap }[] = [
    { key: 'candidate', label: 'Faculty candidate', desc: 'Find and apply for academic positions', icon: GraduationCap },
    { key: 'institute_admin', label: 'Institution', desc: 'Post vacancies and run selections', icon: Building2 },
  ];

  return (
    <div className="w-full px-4 sm:px-8 py-12 sm:py-16">
      <div className="max-w-2xl mx-auto space-y-8">
        <div className="text-center space-y-2">
          <h1 className="font-serif text-3xl sm:text-4xl font-bold text-slate-900">Create your account</h1>
          <p className="text-sm text-slate-500">
            Already registered?{' '}
            <Link href="/login" className="font-semibold text-brand-700 hover:text-brand-900">
              Sign in
            </Link>
          </p>
        </div>

        <div className="p-6 sm:p-8 rounded-3xl bg-white border border-slate-200 shadow-sm space-y-6">
          <div className={`grid gap-3 ${'sm:grid-cols-2'}`}>
            {roleOptions.map(opt => {
              const Icon = opt.icon;
              const active = role === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setRole(opt.key)}
                  className={`text-left p-4 rounded-2xl border transition ${
                    active ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-100' : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <Icon className={`w-5 h-5 mb-2 ${active ? 'text-brand-700' : 'text-slate-400'}`} />
                  <div className="text-sm font-semibold text-slate-900">{opt.label}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{opt.desc}</div>
                </button>
              );
            })}
          </div>

          {role === 'candidate' && <SocialButtons methods={methods} label="Sign up with" />}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-700">Full name</label>
                <input required value={name} onChange={e => setName(e.target.value)} placeholder={role === 'candidate' ? 'Dr. Priya Sharma' : 'Prof. R. Kumar'} className={inputCls} />
              </div>
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-700">Email</label>
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder={requiredDomain ? `name@${requiredDomain}` : 'you@university.ac.in'}
                  className={inputCls}
                />
              </div>
            </div>

            <PhoneField id="reg-phone" label="Mobile number" country={country} onCountry={setCountry} value={phone} onChange={setPhone} hint={methods?.sms ? 'We will ask you to confirm it with an SMS code. It can then be used to sign in and to recover your account.' : 'Used by institutions to contact you about applications.'} />

            {role === 'institute_admin' && (
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-4">
                <div className="flex gap-2 text-sm">
                  {(['existing', 'new'] as const).map(m => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setInstituteMode(m)}
                      className={`px-3.5 py-2 rounded-lg font-medium transition ${instituteMode === m ? 'bg-white shadow-sm border border-slate-200 text-slate-900' : 'text-slate-500 hover:text-slate-800'}`}
                    >
                      {m === 'existing' ? 'My institute is listed' : 'Register a new institute'}
                    </button>
                  ))}
                </div>

                {instituteMode === 'existing' ? (
                  <div className="space-y-1.5">
                    <select required value={instituteId} onChange={e => setInstituteId(e.target.value)} className={inputCls}>
                      <option value="">Select your institute…</option>
                      {institutes.map(i => (
                        <option key={i.id} value={i.id}>
                          {i.name}
                          {i.verificationStatus === 'pending' ? ' (pending verification)' : ''}
                        </option>
                      ))}
                    </select>
                    {requiredDomain && <p className="text-xs text-slate-500">You must use an official @{requiredDomain} email address.</p>}
                  </div>
                ) : (
                  <div className="grid sm:grid-cols-2 gap-3">
                    <input required placeholder="Institute name" value={newInst.name} onChange={e => setNewInst({ ...newInst, name: e.target.value })} className={`${inputCls} sm:col-span-2`} />
                    <input required placeholder="AISHE code (e.g. C-12345)" value={newInst.aisheCode} onChange={e => setNewInst({ ...newInst, aisheCode: e.target.value })} className={`${inputCls} font-mono`} />
                    <input type="text" inputMode="url" autoCapitalize="none" spellCheck={false} placeholder="Website (e.g. www.college.ac.in)" value={newInst.website} onChange={e => setNewInst({ ...newInst, website: e.target.value })} className={inputCls} />
                    <input required placeholder="City" value={newInst.city} onChange={e => setNewInst({ ...newInst, city: e.target.value })} className={inputCls} />
                    <input required placeholder="State" value={newInst.state} onChange={e => setNewInst({ ...newInst, state: e.target.value })} className={inputCls} />
                    <p className="sm:col-span-2 text-xs text-slate-500">
                      New institutes can post vacancies after the platform administrator verifies the AISHE code.
                    </p>
                  </div>
                )}
              </div>
            )}

            {role === 'institute_admin' && (
              <div className="p-4 rounded-2xl border-2 border-brand-900 bg-white space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-0.5 rounded-full bg-gold-100 text-gold-800 border border-gold-300"><Crown className="w-3.5 h-3.5" /> Institution Premium</div>
                    <p className="text-sm text-slate-700 mt-2">Institution accounts are Premium only; there is no free plan. Includes unlimited vacancies, Premium vacancies, the applicant pipeline, applicant documents and committee scoring.</p>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-lg font-bold text-brand-900 whitespace-nowrap">{planSettings.institutionPriceLabel}</div>
                  </div>
                </div>
                <p className="text-xs text-slate-500">{planSettings.institutionInstructions}</p>
                <label className="flex items-start gap-2.5 text-sm text-slate-700 cursor-pointer">
                  <input type="checkbox" checked={agreePlan} onChange={e => setAgreePlan(e.target.checked)} className="mt-0.5 w-4 h-4 accent-brand-700" />
                  <span>I agree to subscribe to Institution Premium at <strong>{planSettings.institutionPriceLabel}</strong> on behalf of my institute. If the institute already has an active subscription, no new charge applies. <Link href="/premium#institutions" className="text-brand-800 underline">Plan details</Link></span>
                </label>
              </div>
            )}

            <div className="grid sm:grid-cols-2 gap-4">
              <PasswordField id="reg-password" label="Password" value={password} onChange={setPassword} autoComplete="new-password" hint="At least 8 characters, with letters and numbers." />
              <PasswordField id="reg-confirm" label="Confirm password" value={confirm} onChange={setConfirm} autoComplete="new-password" />
            </div>
            {password && (
              <div className="space-y-1" aria-live="polite">
                <div className="flex gap-1">{[0, 1, 2, 3].map(i => <span key={i} className={`h-1.5 flex-1 rounded-full ${passwordStrength(password) > i ? (passwordStrength(password) >= 3 ? 'bg-emerald-600' : 'bg-gold-500') : 'bg-slate-200'}`} />)}</div>
                <p className="text-xs text-slate-600">{passwordProblem(password, { email, name }) || (confirm && confirm !== password ? 'The passwords do not match yet.' : 'Good password.')}</p>
              </div>
            )}

            <label className="flex items-start gap-2.5 text-sm text-slate-600 cursor-pointer">
              <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} className="mt-0.5 w-4 h-4 accent-brand-700" />
              <span>
                I accept the <Link href="/terms" target="_blank" className="text-brand-800 underline font-medium">Terms of Service</Link> and the <Link href="/privacy" target="_blank" className="text-brand-800 underline font-medium">Privacy Policy</Link>, and consent to my data being processed for academic recruitment, including automated profile matching, as described under the DPDP Act, 2023. I can withdraw consent at any time.
              </span>
            </label>

            <label className="flex items-start gap-2.5 text-sm text-slate-600 cursor-pointer">
              <input type="checkbox" checked={marketing} onChange={e => setMarketing(e.target.checked)} className="mt-0.5 w-4 h-4 accent-brand-700" />
              <span>Send me occasional AcadeXMatch news and offers by email (optional — you can stop them at any time).</span>
            </label>

            {error && <div ref={errorRef} role="alert" className="p-3 rounded-xl bg-crimson-50 border border-crimson-100 text-crimson-700 text-sm">{error}</div>}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 rounded-xl bg-brand-900 hover:bg-brand-800 text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-sm transition disabled:opacity-60"
            >
              {isSubmitting ? <Spinner /> : <>Create account <ArrowRight className="w-4 h-4" /></>}
            </button>
          </form>
        </div>

        <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-xs text-slate-500">
          {['Free for candidates', 'Explainable match scores', 'Delete your data anytime'].map(t => (
            <span key={t} className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> {t}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
