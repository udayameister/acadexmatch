import { NextResponse } from 'next/server';
import { smsConfigured } from '@/lib/server/sms';
import { configuredProviders } from '@/lib/server/oidc';
import { verifiedEmailRequired } from '@/lib/server/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Which sign-in methods are switched on (buttons for the others are hidden). */
export function GET() {
  return NextResponse.json({ sms: smsConfigured(), providers: configuredProviders(), verifiedEmailRequired: verifiedEmailRequired() }, { headers: { 'Cache-Control': 'no-store' } });
}
