import type { Metadata } from 'next';
import JsonLd from '@/components/JsonLd';
import { getLiveEvent } from '@/lib/server/events';
import { EVENT_KIND_SHORT, formatEventDates } from '@/lib/events';
import { SITE_URL } from '@/lib/site';

type Props = { params: Promise<{ id: string }>; children: React.ReactNode };

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const e = await getLiveEvent(id);
  // Unpublished listings (seen only by their poster and the administrator) stay out of search results.
  if (!e) return { title: 'Event', robots: { index: false, follow: true } };
  const path = `/events/${encodeURIComponent(e.id)}`;
  const title = `${e.title} (${EVENT_KIND_SHORT[e.kind]}, ${formatEventDates(e)})`;
  const description = `${EVENT_KIND_SHORT[e.kind]} by ${e.organizer}${e.mode === 'online' ? ', online' : e.city ? `, ${e.city}` : ''}. ${e.description}`.slice(0, 300);
  return {
    title, description, alternates: { canonical: path },
    openGraph: { type: 'website', url: path, title: `${title} | AcadeXMatch`, description },
  };
}

export default async function Layout({ params, children }: Props) {
  const { id } = await params;
  const e = await getLiveEvent(id);
  const data = e ? {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: e.title,
    description: e.description.slice(0, 1000),
    startDate: e.startDate,
    endDate: e.endDate,
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: e.mode === 'online' ? 'https://schema.org/OnlineEventAttendanceMode' : e.mode === 'hybrid' ? 'https://schema.org/MixedEventAttendanceMode' : 'https://schema.org/OfflineEventAttendanceMode',
    location: e.mode === 'online'
      ? { '@type': 'VirtualLocation', url: e.registrationLink || `${SITE_URL}/events/${encodeURIComponent(e.id)}` }
      : { '@type': 'Place', name: e.venue || e.organizer, address: { '@type': 'PostalAddress', addressLocality: e.city || undefined, addressRegion: e.state, addressCountry: 'IN' } },
    organizer: { '@type': 'Organization', name: e.organizer },
    url: `${SITE_URL}/events/${encodeURIComponent(e.id)}`,
  } : null;
  return (
    <>
      {data && <JsonLd data={data} />}
      {children}
    </>
  );
}
