import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Research Funding and Fellowship Calendar — ANRF, DST, ICSSR, ICMR, UGC Deadlines',
  description: 'Open calls for research grants and fellowships in India — ANRF, DST, ICSSR, ICMR, DRDO, UGC and more — with deadlines, eligibility and links to the official notices. Add the deadlines to your calendar.',
  alternates: { canonical: '/tools/funding-calendar' },
  openGraph: { url: '/tools/funding-calendar' },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
