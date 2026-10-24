import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import JsonLd from '@/components/JsonLd';
import { getJobForSeo, isOpenJob, jobTitleForSeo, jobDescriptionForSeo, jobPostingJsonLd, breadcrumbJsonLd } from '@/lib/server/seo';

type Props = { params: Promise<{ id: string }>; children: React.ReactNode };

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const found = await getJobForSeo(id);
  if (!found) return { title: 'Vacancy not found', robots: { index: false, follow: true } };
  const { job } = found;
  const path = `/jobs/${encodeURIComponent(job.id)}`;
  const title = jobTitleForSeo(job);
  const description = jobDescriptionForSeo(job);
  return {
    title,
    description,
    alternates: { canonical: path },
    // Closed or expired vacancies stay reachable for people who saved the link, but leave the search index.
    robots: isOpenJob(job) ? { index: true, follow: true } : { index: false, follow: true },
    openGraph: { type: 'website', url: path, title: `${title} | AcadeXMatch`, description },
    twitter: { card: 'summary_large_image', title: `${title} | AcadeXMatch`, description },
  };
}

export default async function Layout({ params, children }: Props) {
  const { id } = await params;
  const found = await getJobForSeo(id);
  if (!found) notFound();
  const { job, institute } = found;
  const posting = jobPostingJsonLd(job, institute);
  const crumbs = breadcrumbJsonLd([
    { name: 'Home', path: '/' },
    { name: 'Faculty jobs', path: '/jobs' },
    ...(institute?.verificationStatus === 'verified' ? [{ name: job.instituteShortName || job.instituteName, path: `/institutes/${encodeURIComponent(institute.id)}` }] : []),
    { name: job.title, path: `/jobs/${encodeURIComponent(job.id)}` },
  ]);
  return (
    <>
      {posting && <JsonLd data={posting} />}
      <JsonLd data={crumbs} />
      {children}
    </>
  );
}
