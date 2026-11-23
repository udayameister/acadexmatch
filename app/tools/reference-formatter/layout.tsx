import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'DOI to Reference Formatter — APA, IEEE, Vancouver, Harvard, BibTeX',
  description: 'Paste one or more DOIs and get correctly formatted references in APA 7th, IEEE, Vancouver, Harvard and BibTeX, ready to copy into your thesis or paper. Free, uses Crossref.',
  alternates: { canonical: '/tools/reference-formatter' },
  openGraph: { url: '/tools/reference-formatter' },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
