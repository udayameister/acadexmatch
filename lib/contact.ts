/** Public contact details of AcadeXMatch, shown across the site and in emails. Edit here to change them everywhere. */
export const CONTACT_EMAIL = 'info@acadexmatch.com';
export const CONTACT_MAILTO = `mailto:${CONTACT_EMAIL}`;

/**
 * AcadeXMatch on social media. Shown in the home page "Follow us" section and the footer, and listed in the site's
 * structured data (sameAs). Add Instagram, LinkedIn, X, YouTube or WhatsApp here when those accounts exist.
 */
export interface SocialLink { network: 'facebook' | 'instagram' | 'linkedin' | 'x' | 'youtube' | 'whatsapp'; label: string; url: string }
export const SOCIAL_LINKS: SocialLink[] = [
  { network: 'facebook', label: 'Facebook', url: 'https://www.facebook.com/profile.php?id=61596399934913' },
  { network: 'x', label: 'X (Twitter)', url: 'https://x.com/acadexmatch' },
];
export const FACEBOOK_URL = SOCIAL_LINKS.find(s => s.network === 'facebook')?.url || null;
export const X_URL = SOCIAL_LINKS.find(s => s.network === 'x')?.url || null;
/** The X handle, e.g. "acadexmatch" (used for share links and the site's X card data). */
export const X_HANDLE = X_URL ? X_URL.replace(/\/+$/, '').split('/').pop() || null : null;
