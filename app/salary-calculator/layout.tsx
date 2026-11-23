import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Faculty Salary Calculator, DA Arrears & 8th Pay Commission Estimator',
  description: 'Estimate the monthly salary of an Assistant Professor, Associate Professor or Professor under the 7th CPC academic pay levels with DA 63% and HRA; calculate DA arrears, your next increment date and pay under a new pay commission.',
  alternates: { canonical: '/salary-calculator' },
  openGraph: { url: '/salary-calculator' },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
