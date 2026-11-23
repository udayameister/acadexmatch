import type { Metadata } from 'next';

// Personal link from an email: never shown in search results.
export const metadata: Metadata = { title: 'Claim your vacancies', robots: { index: false, follow: false } };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
