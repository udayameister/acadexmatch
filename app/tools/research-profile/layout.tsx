import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Research Profile from ORCID — Publications, Citations and h-index Card',
  description: 'Enter your ORCID iD and get a shareable research profile: publications, citations, h-index, i10-index and citations per year, from ORCID and OpenAlex. Free for researchers and Ph.D. scholars.',
  alternates: { canonical: '/tools/research-profile' },
  openGraph: { url: '/tools/research-profile' },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
