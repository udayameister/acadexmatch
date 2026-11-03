import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Upcoming Academic Conferences in India',
  description: 'National and international academic conferences organised by Indian universities and colleges: dates, paper submission deadlines and registration.',
  alternates: { canonical: '/conferences' },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
