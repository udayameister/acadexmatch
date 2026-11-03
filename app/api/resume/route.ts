import { NextRequest, NextResponse } from 'next/server';
import { badOrigin, currentUserId, sameOrigin } from '@/lib/server/auth';
import { allow, clientIp } from '@/lib/server/security';
import { analyze, deleteAllResumeData, getMyResumes, getResumeSettings, summary } from '@/lib/server/resumes';
import { RESUME_MAX_BYTES } from '@/lib/server/resumeExtract';
import { withDb } from '@/lib/server/db';
import { STORAGE_KEYS } from '@/lib/storage';
import { TEMPLATES } from '@/lib/resume/builder';
import type { Job } from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** The signed-in user's own resume history and drafts (summaries only), plus open vacancies to compare with. */
export async function GET(req: NextRequest) {
  const userId = await currentUserId(req);
  if (!userId) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const settings = await getResumeSettings();
  const mine = await getMyResumes(userId);
  const jobs = await withDb(null, db => ((db[STORAGE_KEYS.JOBS] as Job[]) || [])
    .filter(j => j.status === 'published')
    .map(j => ({ id: j.id, title: j.title, institute: j.instituteName, deadline: j.applicationDeadline })));
  return NextResponse.json({
    enabled: settings.enabled, builderEnabled: settings.builderEnabled, weights: settings.weights, historyLimit: settings.historyLimit,
    retentionDays: settings.retentionDays, templates: TEMPLATES, ...mine, jobs: jobs.slice(0, 500),
  }, { headers: { 'Cache-Control': 'no-store' } });
}

/** Analyse a resume: multipart with `file` (or `reuseId` / `builderId`), optional `jobText` or `jobId`, and `consent`. */
export async function POST(req: NextRequest) {
  // Multipart upload: same-origin check only (the JSON-only rule does not apply to file uploads).
  if (!sameOrigin(req) || !/^multipart\/form-data/.test(req.headers.get('content-type') || '')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  const userId = await currentUserId(req);
  if (!userId) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  if (!allow(`resume:${userId}:${clientIp(req)}`, 10, 60_000)) return NextResponse.json({ error: 'Too many checks. Please wait a minute.' }, { status: 429 });
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: 'Choose a resume file.' }, { status: 400 });
  const file = form.get('file');
  let upload: { name: string; bytes: Buffer } | undefined;
  if (file instanceof File && file.size > 0) {
    if (file.size > RESUME_MAX_BYTES) return NextResponse.json({ error: 'The resume must be 5 MB or smaller.' }, { status: 400 });
    upload = { name: file.name || 'resume', bytes: Buffer.from(await file.arrayBuffer()) };
  }
  const s = (k: string) => { const v = form.get(k); return typeof v === 'string' ? v : undefined; };
  const r = await analyze(userId, {
    consent: s('consent') === '1', file: upload, reuseId: s('reuseId'), builderId: s('builderId'),
    jobText: s('jobText'), jobId: s('jobId') || undefined,
  });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  const { text: _text, ...rest } = r.analysis;
  return NextResponse.json({ ok: true, analysis: rest, summary: summary(r.analysis) });
}

/** Delete all of the user's resume data (analyses, extracted text, drafts, consent). */
export async function DELETE(req: NextRequest) {
  if (badOrigin(req)) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  const userId = await currentUserId(req);
  if (!userId) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  await deleteAllResumeData(userId);
  return NextResponse.json({ ok: true });
}
