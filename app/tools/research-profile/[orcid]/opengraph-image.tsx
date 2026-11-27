import { ImageResponse } from 'next/og';
import { parseOrcid } from '@/lib/orcid';
import { researchProfile, type ResearchProfile } from '@/lib/server/researchProfile';

export const runtime = 'nodejs';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Research profile card';

export default async function Image({ params }: { params: Promise<{ orcid: string }> }) {
  const id = parseOrcid(decodeURIComponent((await params).orcid)) || '';
  let p: ResearchProfile | null = null;
  try { if (id) p = await researchProfile(id); } catch { /* plain card */ }
  const m = p?.metrics;
  const aff = p?.affiliations.find(a => a.current) || p?.affiliations[0];
  const stat = (label: string, value: string | number) => (
    <div style={{ display: 'flex', flexDirection: 'column', padding: '22px 30px', borderRadius: 24, background: 'rgba(255,255,255,0.1)', minWidth: 230 }}>
      <div style={{ fontSize: 64, fontWeight: 700, color: '#fff' }}>{String(value)}</div>
      <div style={{ fontSize: 26, color: '#e8d9b5' }}>{label}</div>
    </div>
  );
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 64, background: 'linear-gradient(135deg, #4a0a12 0%, #6b0f1a 60%, #8a1c2a 100%)', color: '#fff', fontFamily: 'serif' }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 28, color: '#e8d9b5', letterSpacing: 2 }}>RESEARCH PROFILE</div>
          <div style={{ fontSize: 66, fontWeight: 700, marginTop: 12, lineHeight: 1.1 }}>{(p?.name || `ORCID ${id}`).slice(0, 48)}</div>
          {aff && <div style={{ fontSize: 30, marginTop: 14, color: '#f3ead6' }}>{aff.org.slice(0, 70)}</div>}
        </div>
        <div style={{ display: 'flex', gap: 24 }}>
          {stat('Publications', m?.works ?? '—')}
          {stat('Citations', m ? m.citations.toLocaleString('en-IN') : '—')}
          {stat('h-index', m?.hIndex ?? '—')}
          {stat('i10-index', m?.i10 ?? '—')}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 26, color: '#e8d9b5' }}>
          <span>orcid.org/{id}</span><span>acadexmatch.com</span>
        </div>
      </div>
    ),
    size,
  );
}
