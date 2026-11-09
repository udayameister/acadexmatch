import type { Metadata } from 'next';

// Private or account page: never shown in search results (also sent as an X-Robots-Tag header).
// Links with ?next= are rel="nofollow" so crawlers don't collect them as duplicates (no canonical: it would mix with noindex).
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
