import type { Metadata } from 'next';

// Private or account page: never shown in search results (also sent as an X-Robots-Tag header).
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
