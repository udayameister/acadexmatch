import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'UGC Shortlisting Score Calculator — Table 3A & 3B (Assistant Professor)',
  description: 'Calculate your academic score for Assistant Professor shortlisting under UGC Regulations 2018: Table 3A for universities and Table 3B for colleges. Free, instant, with each mark explained.',
  alternates: { canonical: '/tools/ugc-shortlisting-score' },
  openGraph: { url: '/tools/ugc-shortlisting-score' },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
