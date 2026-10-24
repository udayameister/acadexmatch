import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '7th CPC Faculty Salary Calculator (Assistant Professor Pay)',
  description: 'Estimate the monthly salary of an Assistant Professor, Associate Professor or Professor under the 7th CPC academic pay levels, with DA and HRA.',
  alternates: { canonical: '/salary-calculator' },
  openGraph: { url: '/salary-calculator' },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
