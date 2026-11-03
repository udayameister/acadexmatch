import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'FDPs, Workshops and Seminars for Faculty in India',
  description: 'Upcoming faculty development programmes (FDPs), workshops and seminars for college and university teachers and researchers in India.',
  alternates: { canonical: '/events' },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
