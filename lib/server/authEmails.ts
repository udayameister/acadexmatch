import { appUrl, createToken, emailLayout, sendMail } from './mailer';

export async function sendVerificationEmail(user: { id: string; name: string; email: string }, origin?: string) {
  const token = await createToken(user.id, 'verify', 72);
  const url = `${appUrl(origin)}/verify-email?token=${token}`;
  const { html, text } = emailLayout({
    heading: 'Confirm your email address',
    paragraphs: [`Hello ${user.name},`, 'Welcome to AcadeXMatch. Please confirm that this is your email address. The link is valid for 3 days.'],
    button: { label: 'Confirm my email', url },
  });
  return sendMail({ to: user.email, subject: 'Confirm your AcadeXMatch email', text, html, kind: 'verify' });
}

export async function sendPasswordResetEmail(user: { id: string; name: string; email: string }, origin?: string) {
  const token = await createToken(user.id, 'reset', 1);
  const url = `${appUrl(origin)}/reset-password?token=${token}`;
  const { html, text } = emailLayout({
    heading: 'Reset your password',
    paragraphs: [`Hello ${user.name},`, 'We received a request to reset your AcadeXMatch password. The link is valid for 1 hour. If you did not ask for this, you can ignore this email; your password will not change.'],
    button: { label: 'Choose a new password', url },
  });
  return sendMail({ to: user.email, subject: 'Reset your AcadeXMatch password', text, html, kind: 'reset' });
}
