import type { Metadata } from 'next';
import { DM_Sans } from 'next/font/google';
import './globals.css';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import AppBootstrap from '@/components/AppBootstrap';

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800'],
  style: ['normal', 'italic'],
  variable: '--font-dm-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'AcadeXMatch | India\'s Intelligent Academic Recruitment Ecosystem',
  description: 'National academic hiring operating system for Indian Universities, IITs, NITs, Central Colleges, Faculty & Researchers. Powered by UGC/AICTE compliance, 7th CPC bands, and explainable AI matching.',
  keywords: 'academic jobs India, faculty recruitment, IIT professor jobs, UGC NET eligibility, 7th CPC faculty pay scale, AICTE recruitment, academic ATS, Indian higher education hiring',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${dmSans.variable} font-sans`}>
      <body className="min-h-screen flex flex-col bg-ivory text-slate-900 antialiased selection:bg-brand-100 selection:text-brand-900">
        <Navbar />
        <main className="flex-1 w-full">
          <AppBootstrap>{children}</AppBootstrap>
        </main>
        <Footer />
      </body>
    </html>
  );
}
