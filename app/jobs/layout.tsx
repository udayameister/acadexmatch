import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Faculty Jobs & Assistant Professor Vacancies in India',
  description: 'Current Assistant Professor, Associate Professor and faculty vacancies at Indian universities and colleges, with UGC/AICTE eligibility, 7th CPC pay level and closing dates.',
  // Filtered and searched variants (?search=…) point to the main list.
  alternates: { canonical: '/jobs' },
  openGraph: { url: '/jobs', title: 'Faculty Jobs & Assistant Professor Vacancies in India | AcadeXMatch' },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
