import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Universities & Colleges Hiring Faculty in India',
  description: 'Verified Indian universities, engineering colleges and institutions recruiting faculty on AcadeXMatch — with NAAC grade, location and their current vacancies.',
  alternates: { canonical: '/institutes' },
  openGraph: { url: '/institutes', title: 'Universities & Colleges Hiring Faculty in India | AcadeXMatch' },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
