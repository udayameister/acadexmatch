import { appUrl, createToken } from './mailer';
import { notify, type NotifyInput } from './notifications';
import { maskPhone } from '@/lib/phone';
import type { UserAccount } from '@/types';

/* Account and security emails. All go through the notification queue and are always sent. */

type U = Pick<UserAccount, 'id' | 'email' | 'name' | 'emailVerified' | 'notificationPrefs' | 'marketingConsent'>;
const stamp = () => Date.now().toString(36);
const istTime = () => new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }) + ' IST';
const PROVIDER_NAME = { google: 'Google', microsoft: 'Microsoft' } as const;

function security(user: U, key: string, rest: Omit<NotifyInput, 'key' | 'category' | 'user'>) {
  return notify({ key, category: 'security', user, ...rest });
}

/** Welcome email with the link that confirms the address (sign-up). */
export async function sendVerificationEmail(user: U, origin?: string, opts: { welcome?: boolean } = {}) {
  const token = await createToken(user.id, 'verify', 72);
  const url = `${appUrl(origin)}/verify-email?token=${token}`;
  return security(user, `verify:${user.id}:${stamp()}`, {
    kind: 'verify', immediate: true, sensitive: true,
    subject: opts.welcome ? 'Welcome to AcadeXMatch — Verify Your Email' : 'Confirm your AcadeXMatch email address',
    heading: opts.welcome ? 'Welcome to AcadeXMatch' : 'Confirm your email address',
    paragraphs: [`Hello ${user.name},`, ...(opts.welcome ? ['Thank you for creating your AcadeXMatch account.'] : []), 'Please confirm that this is your email address. The link is valid for 3 days and can be used once.', 'If you did not create this account, you can ignore this email.'],
    button: { label: 'Confirm my email', url },
  });
}

export function sendEmailVerifiedConfirmation(user: U) {
  return security(user, `verified:${user.id}:${user.email}`, {
    kind: 'email-verified', subject: 'Your AcadeXMatch email is confirmed', heading: 'Email address confirmed',
    paragraphs: [`Hello ${user.name},`, `Your email address ${user.email} is now confirmed. You will receive application updates, interview details and alerts here.`],
    button: { label: 'Open AcadeXMatch', url: `${appUrl()}/account` },
  });
}

export async function sendPasswordResetEmail(user: U, origin?: string) {
  const token = await createToken(user.id, 'reset', Number(process.env.PASSWORD_RESET_MINUTES || 30) / 60);
  const minutes = Number(process.env.PASSWORD_RESET_MINUTES || 30);
  return security(user, `reset:${user.id}:${stamp()}`, {
    kind: 'reset', immediate: true, sensitive: true,
    subject: 'Your AcadeXMatch Password Reset Request', heading: 'Reset your password',
    paragraphs: [`Hello ${user.name},`, `We received a request to reset your AcadeXMatch password. The link is valid for ${minutes} minutes and can be used once.`, 'If you did not ask for this, ignore this email — your password will not change.'],
    button: { label: 'Choose a new password', url: `${appUrl(origin)}/reset-password?token=${token}` },
  });
}

export function sendPasswordChanged(user: U, how: 'reset' | 'change' | 'admin' | 'set') {
  const what = how === 'set' ? 'A password was added to your account' : 'Your password was changed';
  return security(user, `pwchanged:${user.id}:${stamp()}`, {
    kind: 'password-changed', subject: how === 'set' ? 'A password was added to your AcadeXMatch account' : 'Your Password Has Been Changed',
    heading: what,
    paragraphs: [`Hello ${user.name},`, `${what} on ${istTime()}${how === 'reset' ? ' using a password-reset link' : how === 'admin' ? ' by the platform administrator' : ''}. You have been signed out on your other devices.`, 'If this was not you, reset your password immediately with “Forgot password?” and contact us.'],
    button: { label: 'Review account security', url: `${appUrl()}/account#security` },
  });
}

export function sendNewSignIn(user: U, device: string, method: string, ipLabel?: string) {
  return security(user, `login:${user.id}:${stamp()}`, {
    kind: 'new-sign-in', subject: 'New sign-in to your AcadeXMatch account', heading: 'New sign-in',
    paragraphs: [`Hello ${user.name},`, `Your account was signed in on ${istTime()} from ${device}${ipLabel ? ` (network ${ipLabel})` : ''} using ${method}.`, 'If this was you, there is nothing to do. If not, change your password now and sign out the other sessions on the account security page.'],
    button: { label: 'Review account security', url: `${appUrl()}/account#security` },
  }).then(r => r);
}

/** Link to the new address, and a notice to the old one. */
export async function sendEmailChangeLinks(user: U, newEmail: string, origin?: string) {
  const token = await createToken(user.id, 'email-change', 24, newEmail);
  await notify({
    key: `emailchange:${user.id}:${stamp()}`, category: 'security', to: newEmail, kind: 'email-change', immediate: true, sensitive: true,
    subject: 'Confirm your new AcadeXMatch email address', heading: 'Confirm your new email address',
    paragraphs: [`Hello ${user.name},`, `You asked to use ${newEmail} for your AcadeXMatch account. Confirm it with the button below within 24 hours. Until then your current address stays in use.`],
    button: { label: 'Confirm the new address', url: `${appUrl(origin)}/verify-email?change=${token}` },
  });
  return notify({
    key: `emailchange-old:${user.id}:${stamp()}`, category: 'security', to: user.email, kind: 'email-change-notice',
    subject: 'A change of email address was requested', heading: 'Email change requested',
    paragraphs: [`Hello ${user.name},`, `On ${istTime()} someone signed in to your account asked to change its email address to ${newEmail}. It changes only after that address is confirmed.`, 'If this was not you, change your password now and contact us.'],
    button: { label: 'Review account security', url: `${appUrl()}/account#security` },
  });
}

export function sendEmailChanged(user: U, oldEmail: string) {
  return notify({
    key: `emailchanged:${user.id}:${stamp()}`, category: 'security', to: oldEmail, kind: 'email-changed',
    subject: 'Your AcadeXMatch email address was changed', heading: 'Email address changed',
    paragraphs: [`Hello ${user.name},`, `The email address of your AcadeXMatch account was changed from ${oldEmail} to ${user.email} on ${istTime()}.`, 'If this was not you, contact us immediately.'],
  });
}

export function sendPhoneChanged(user: U, phone: string) {
  return security(user, `phone:${user.id}:${stamp()}`, {
    kind: 'phone-changed', subject: 'Mobile number confirmed on your AcadeXMatch account', heading: 'Mobile number confirmed',
    paragraphs: [`Hello ${user.name},`, `The mobile number ${maskPhone(phone)} was confirmed on your account on ${istTime()}. You can now sign in and recover your account with SMS codes sent to it.`, 'If this was not you, change your password now and contact us.'],
    button: { label: 'Review account security', url: `${appUrl()}/account#security` },
  });
}

export function sendSocialWelcome(user: U, provider: 'google' | 'microsoft') {
  return notify({
    key: `social-welcome:${user.id}`, category: 'account', user, kind: 'social-welcome',
    subject: 'Welcome to AcadeXMatch', heading: 'Welcome to AcadeXMatch',
    paragraphs: [`Hello ${user.name},`, `Your account was created with ${PROVIDER_NAME[provider]} sign-in. To sign in next time, use “Continue with ${PROVIDER_NAME[provider]}”. AcadeXMatch never sees or stores your ${PROVIDER_NAME[provider]} password.`, 'You can add a password or a mobile number for sign-in at any time on your account page.'],
    button: { label: 'Complete your profile', url: `${appUrl()}/account` },
  });
}

export function sendIdentityLinked(user: U, provider: 'google' | 'microsoft', linked: boolean) {
  return security(user, `identity:${user.id}:${provider}:${stamp()}`, {
    kind: linked ? 'identity-linked' : 'identity-unlinked',
    subject: linked ? `${PROVIDER_NAME[provider]} sign-in added to your account` : `${PROVIDER_NAME[provider]} sign-in removed from your account`,
    heading: linked ? `${PROVIDER_NAME[provider]} sign-in added` : `${PROVIDER_NAME[provider]} sign-in removed`,
    paragraphs: [`Hello ${user.name},`, `${linked ? 'You can now sign in' : 'You can no longer sign in'} to AcadeXMatch with your ${PROVIDER_NAME[provider]} account (changed on ${istTime()}).`, 'If this was not you, change your password now and contact us.'],
    button: { label: 'Review account security', url: `${appUrl()}/account#security` },
  });
}
