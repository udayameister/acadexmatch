import type { Metadata } from 'next';

// Posting form and the poster's own listings: never shown in search results (also sent as an X-Robots-Tag header).
export const metadata: Metadata = { title: 'Advertise an FDP, workshop, seminar or conference', robots: { index: false, follow: false } };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
