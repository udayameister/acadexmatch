import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: "Bloom's Taxonomy Question Checker — Tag Exam Questions L1 to L6",
  description: "Paste your question paper and see the Bloom's taxonomy level (Remember, Understand, Apply, Analyze, Evaluate, Create) of every question, with the paper's balance — for outcome-based education.",
  alternates: { canonical: '/tools/blooms-taxonomy-checker' },
  openGraph: { url: '/tools/blooms-taxonomy-checker' },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
