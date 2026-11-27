import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'CO–PO Attainment Calculator — Excel Marks to NBA / NAAC Report',
  description: 'Upload internal (CIE) and end-semester (SEE) marks in Excel and get CO attainment levels, the CO–PO mapping matrix, PO and PSO attainment and a report for NBA SAR and NAAC — free, and the marks never leave your computer.',
  alternates: { canonical: '/tools/co-po-attainment' },
  openGraph: { url: '/tools/co-po-attainment' },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
