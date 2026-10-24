import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import JsonLd from '@/components/JsonLd';
import { getInstituteForSeo, instituteDescriptionForSeo, breadcrumbJsonLd } from '@/lib/server/seo';
import { SITE_URL } from '@/lib/site';

type Props = { params: Promise<{ id: string }>; children: React.ReactNode };

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const found = await getInstituteForSeo(id);
  if (!found) return { title: 'Institution not found', robots: { index: false, follow: true } };
  const { institute, openJobs } = found;
  const path = `/institutes/${encodeURIComponent(institute.id)}`;
  const title = `${institute.name} – Faculty Jobs & Recruitment`;
  const description = instituteDescriptionForSeo(institute, openJobs.length);
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { type: 'website', url: path, title: `${title} | AcadeXMatch`, description },
  };
}

export default async function Layout({ params, children }: Props) {
  const { id } = await params;
  const found = await getInstituteForSeo(id);
  if (!found) notFound();
  const { institute } = found;
  const path = `/institutes/${encodeURIComponent(institute.id)}`;
  const website = institute.website && /^https?:\/\//.test(institute.website) ? institute.website : undefined;
  const org = {
    '@context': 'https://schema.org',
    '@type': 'CollegeOrUniversity',
    name: institute.name,
    url: `${SITE_URL}${path}`,
    ...(website ? { sameAs: website } : {}),
    ...(institute.location.city || institute.location.state ? {
      address: { '@type': 'PostalAddress', ...(institute.location.city ? { addressLocality: institute.location.city } : {}), ...(institute.location.state ? { addressRegion: institute.location.state } : {}), addressCountry: 'IN' },
    } : {}),
  };
  return (
    <>
      <JsonLd data={org} />
      <JsonLd data={breadcrumbJsonLd([{ name: 'Home', path: '/' }, { name: 'Institutions', path: '/institutes' }, { name: institute.name, path }])} />
      {children}
    </>
  );
}
