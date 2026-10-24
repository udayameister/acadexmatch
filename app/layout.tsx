import type { Metadata } from 'next';
import { DM_Sans } from 'next/font/google';
import './globals.css';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import AppBootstrap from '@/components/AppBootstrap';
import StoreSeed from '@/components/StoreSeed';
import JsonLd from '@/components/JsonLd';
import Script from 'next/script';
import { withDb, buildSnapshot } from '@/lib/server/db';
import { SITE_URL, SITE_NAME, DEFAULT_TITLE, DEFAULT_DESCRIPTION } from '@/lib/site';
import { CONTACT_EMAIL } from '@/lib/contact';

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800'],
  style: ['normal', 'italic'],
  variable: '--font-dm-sans',
  display: 'swap',
});

// Pages read the live database (public snapshot) on every request.
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const google = process.env.GOOGLE_SITE_VERIFICATION;
  const bing = process.env.BING_SITE_VERIFICATION;
  return {
    metadataBase: new URL(SITE_URL),
    title: { default: DEFAULT_TITLE, template: '%s | AcadeXMatch' },
    description: DEFAULT_DESCRIPTION,
    applicationName: SITE_NAME,
    robots: { index: true, follow: true, googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1 } },
    openGraph: { type: 'website', siteName: SITE_NAME, locale: 'en_IN', url: SITE_URL, title: DEFAULT_TITLE, description: DEFAULT_DESCRIPTION, images: [{ url: '/opengraph-image.png', width: 1200, height: 630, alt: 'AcadeXMatch — academic jobs and faculty recruitment in India' }] },
    twitter: { card: 'summary_large_image', title: DEFAULT_TITLE, description: DEFAULT_DESCRIPTION, images: ['/opengraph-image.png'] },
    ...(google || bing ? { verification: { ...(google ? { google } : {}), ...(bing ? { other: { 'msvalidate.01': bing } } : {}) } } : {}),
  };
}

/** Data every visitor may see, used to server-render public pages. */
async function publicSnapshot(): Promise<Record<string, unknown> | null> {
  try {
    return (await withDb(null, db => buildSnapshot(db, null))).data;
  } catch {
    return null; // pages still work: they load their data in the browser
  }
}

const ORGANIZATION = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': `${SITE_URL}/#organization`,
      name: SITE_NAME,
      url: SITE_URL,
      logo: `${SITE_URL}/brand/acadexmatch-logo-512.png`,
      email: CONTACT_EMAIL,
      founder: [{ '@type': 'Person', name: 'Udayakumar Palanivelu' }, { '@type': 'Person', name: 'Dr. M. Indhumathi' }],
    },
    {
      '@type': 'WebSite',
      '@id': `${SITE_URL}/#website`,
      name: SITE_NAME,
      url: SITE_URL,
      inLanguage: 'en-IN',
      publisher: { '@id': `${SITE_URL}/#organization` },
      potentialAction: { '@type': 'SearchAction', target: { '@type': 'EntryPoint', urlTemplate: `${SITE_URL}/jobs?search={search_term_string}` }, 'query-input': 'required name=search_term_string' },
    },
  ],
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const seed = await publicSnapshot();
  const ga = process.env.GA_MEASUREMENT_ID && /^G-[A-Z0-9]+$/.test(process.env.GA_MEASUREMENT_ID) ? process.env.GA_MEASUREMENT_ID : null;
  return (
    <html lang="en-IN" className={`${dmSans.variable} font-sans`}>
      <body className="min-h-screen flex flex-col bg-ivory text-slate-900 antialiased selection:bg-brand-100 selection:text-brand-900">
        <StoreSeed data={seed} />
        <JsonLd data={ORGANIZATION} />
        {ga && (
          <>
            <Script src={`https://www.googletagmanager.com/gtag/js?id=${ga}`} strategy="afterInteractive" />
            <Script id="ga4" strategy="afterInteractive">{`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${ga}');`}</Script>
          </>
        )}
        <Navbar />
        <main className="flex-1 w-full">
          <AppBootstrap>{children}</AppBootstrap>
        </main>
        <Footer />
      </body>
    </html>
  );
}
