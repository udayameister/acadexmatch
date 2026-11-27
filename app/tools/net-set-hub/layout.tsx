import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'NET / SET Exam Hub — UGC-NET, CSIR-NET and State SET Dates, Syllabus, Results',
  description: 'Exam dates, application windows, syllabus links and result notices for UGC-NET, CSIR-UGC NET and the state eligibility tests (Kerala SET, MH-SET, KSET, AP SET, TS SET, WB SET, GSET, MP SET), with links to the official sites.',
  alternates: { canonical: '/tools/net-set-hub' },
  openGraph: { url: '/tools/net-set-hub' },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
