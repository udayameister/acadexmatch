/*
 * Academic event advertisements: FDP, workshop and seminar listings (one price) and conference listings
 * (their own price). Shared by the browser and the server: labels, prices, input checks and visibility.
 */
import type { AcademicEvent, EventKind, EventMode, PaymentProduct, PlanSettings } from '@/types';

export const DEFAULT_EVENT_PRICES = { eventPriceInr: 1000, conferencePriceInr: 2000 };

/** Launch offer running: listings are free (same rule as eventsFreeActive in lib/storage). */
export function listingIsFree(s: Partial<PlanSettings> | null | undefined): boolean {
  const d = s?.eventsFreeUntil;
  return typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && d >= new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

/** "Free" during the launch offer, otherwise "₹1,000". */
export function listingPriceText(s: Partial<PlanSettings> | null | undefined, kind: EventKind): string {
  return listingIsFree(s) ? 'Free' : `₹${eventPriceFor(s, kind).toLocaleString('en-IN')}`;
}

export const EVENT_KIND_LABEL: Record<EventKind, string> = {
  fdp: 'Faculty Development Programme (FDP)',
  workshop: 'Workshop',
  seminar: 'Seminar',
  conference: 'Conference',
};
export const EVENT_KIND_SHORT: Record<EventKind, string> = { fdp: 'FDP', workshop: 'Workshop', seminar: 'Seminar', conference: 'Conference' };
export const EVENT_MODE_LABEL: Record<EventMode, string> = { in_person: 'In person', online: 'Online', hybrid: 'Hybrid (in person and online)' };
export const EVENT_KINDS: EventKind[] = ['fdp', 'workshop', 'seminar', 'conference'];
/** FDP, workshop and seminar are advertised together; conferences have their own section. */
export const PROGRAMME_KINDS: EventKind[] = ['fdp', 'workshop', 'seminar'];

export const isConference = (k: EventKind) => k === 'conference';
export const productForKind = (k: EventKind): PaymentProduct => (isConference(k) ? 'conference_listing' : 'event_listing');

export function eventPrices(s: Partial<PlanSettings> | null | undefined): { eventPriceInr: number; conferencePriceInr: number } {
  const pos = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v) : d);
  return {
    eventPriceInr: pos(s?.eventPriceInr, DEFAULT_EVENT_PRICES.eventPriceInr),
    conferencePriceInr: pos(s?.conferencePriceInr, DEFAULT_EVENT_PRICES.conferencePriceInr),
  };
}

export function eventPriceFor(s: Partial<PlanSettings> | null | undefined, kind: EventKind): number {
  const p = eventPrices(s);
  return isConference(kind) ? p.conferencePriceInr : p.eventPriceInr;
}

export const todayIstIso = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

/** Shown on the site: approved and not yet over. */
export function isEventLive(e: Pick<AcademicEvent, 'status' | 'endDate'>, today = todayIstIso()): boolean {
  return e.status === 'published' && !!e.endDate && e.endDate >= today;
}

/** Upcoming first (soonest start), then the rest. */
export function sortEvents<T extends Pick<AcademicEvent, 'startDate'>>(list: T[]): T[] {
  return [...list].sort((a, b) => a.startDate.localeCompare(b.startDate));
}

export function formatEventDates(e: Pick<AcademicEvent, 'startDate' | 'endDate'>): string {
  const f = (iso: string, withYear: boolean) => {
    const d = new Date(`${iso}T00:00:00`);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}) });
  };
  if (!e.endDate || e.endDate === e.startDate) return f(e.startDate, true);
  const sameYear = e.startDate.slice(0, 4) === e.endDate.slice(0, 4);
  return `${f(e.startDate, !sameYear)} – ${f(e.endDate, true)}`;
}

/** What the poster can set; everything else (status, payment, review) is controlled by the server. */
export type EventInput = Pick<AcademicEvent,
  'kind' | 'title' | 'organizer' | 'department' | 'mode' | 'venue' | 'city' | 'state' | 'startDate' | 'endDate'
  | 'registrationDeadline' | 'registrationFee' | 'description' | 'topics' | 'audience' | 'registrationLink' | 'brochureLink'
  | 'contactEmail' | 'contactPhone' | 'scope' | 'paperDeadline' | 'publication'>;

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const txt = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/[ \t]+/g, ' ').trim().slice(0, max) : '');
const opt = (v: unknown, max: number) => txt(v, max) || null;
function link(v: unknown): string | null | false {
  const s = txt(v, 500);
  if (!s) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : false;
  } catch { return false; }
}
const validDate = (s: string) => DATE.test(s) && !Number.isNaN(new Date(`${s}T00:00:00Z`).getTime()) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;

/** Cleans and checks what the poster typed. Returns the clean input or a message for the first problem. */
export function cleanEventInput(raw: unknown, today = todayIstIso()): { ok: true; value: EventInput } | { ok: false; error: string } {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const kind = EVENT_KINDS.includes(r.kind as EventKind) ? (r.kind as EventKind) : null;
  if (!kind) return { ok: false, error: 'Choose the type of event.' };
  const mode = (['in_person', 'online', 'hybrid'] as EventMode[]).includes(r.mode as EventMode) ? (r.mode as EventMode) : null;
  if (!mode) return { ok: false, error: 'Choose how the event is held (in person, online or hybrid).' };
  const title = txt(r.title, 200);
  if (title.length < 8) return { ok: false, error: 'Enter the event title (at least 8 characters).' };
  const organizer = txt(r.organizer, 200);
  if (organizer.length < 3) return { ok: false, error: 'Enter the organising institution.' };
  const state = txt(r.state, 60);
  if (!state) return { ok: false, error: 'Choose the state.' };
  const startDate = txt(r.startDate, 10), endDate = txt(r.endDate, 10) || startDate;
  if (!validDate(startDate)) return { ok: false, error: 'Enter the start date.' };
  if (!validDate(endDate) || endDate < startDate) return { ok: false, error: 'The end date must be on or after the start date.' };
  if (endDate < today) return { ok: false, error: 'This event has already ended.' };
  const longest = isConference(kind) ? 10 : 60;
  if ((new Date(`${endDate}T00:00:00Z`).getTime() - new Date(`${startDate}T00:00:00Z`).getTime()) / 86400000 > longest) {
    return { ok: false, error: `A ${EVENT_KIND_SHORT[kind].toLowerCase()} can run for at most ${longest} days.` };
  }
  const registrationDeadline = opt(r.registrationDeadline, 10);
  if (registrationDeadline && (!validDate(registrationDeadline) || registrationDeadline > endDate)) return { ok: false, error: 'The registration deadline must be a date on or before the end date.' };
  const description = txt(typeof r.description === 'string' ? r.description.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n') : '', 4000);
  if (description.length < 80) return { ok: false, error: 'Describe the event in at least 80 characters (theme, sessions, speakers, certificate).' };
  const contactEmail = txt(r.contactEmail, 120).toLowerCase();
  if (!EMAIL.test(contactEmail)) return { ok: false, error: 'Enter a contact email address.' };
  const registrationLink = link(r.registrationLink);
  if (registrationLink === false) return { ok: false, error: 'The registration link is not a valid web address.' };
  const brochureLink = link(r.brochureLink);
  if (brochureLink === false) return { ok: false, error: 'The brochure link is not a valid web address.' };
  const venue = opt(r.venue, 200);
  if (mode !== 'online' && !venue) return { ok: false, error: 'Enter the venue.' };
  const topics = (Array.isArray(r.topics) ? r.topics : typeof r.topics === 'string' ? r.topics.split(',') : [])
    .map(t => txt(t, 60)).filter(Boolean).slice(0, 12);
  const phone = opt(r.contactPhone, 30);
  if (phone && !/^[+0-9 ()-]{6,30}$/.test(phone)) return { ok: false, error: 'Enter the contact phone number with digits only.' };
  const conf = isConference(kind);
  const paperDeadline = conf ? opt(r.paperDeadline, 10) : null;
  if (paperDeadline && !validDate(paperDeadline)) return { ok: false, error: 'Enter the paper submission deadline as a date.' };
  return {
    ok: true,
    value: {
      kind, title, organizer, department: opt(r.department, 160), mode, venue: mode === 'online' ? null : venue,
      city: opt(r.city, 80), state, startDate, endDate, registrationDeadline, registrationFee: opt(r.registrationFee, 120),
      description, topics, audience: opt(r.audience, 300), registrationLink, brochureLink, contactEmail, contactPhone: phone,
      scope: conf && (r.scope === 'national' || r.scope === 'international') ? r.scope : null,
      paperDeadline, publication: conf ? opt(r.publication, 300) : null,
    },
  };
}

export const EVENT_STATUS_LABEL: Record<AcademicEvent['status'], string> = {
  awaiting_payment: 'Waiting for payment',
  under_review: 'Paid, waiting for review',
  published: 'Published',
  rejected: 'Not approved',
};

export const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh',
  'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha',
  'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Andaman and Nicobar Islands', 'Chandigarh', 'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Jammu and Kashmir', 'Ladakh',
  'Lakshadweep', 'Puducherry', 'Online (no venue)', 'Outside India',
];

/** Address of an event's poster image (changes when the poster is replaced, so browsers fetch the new one). */
export function posterUrl(e: Pick<AcademicEvent, 'id' | 'posterId'>): string | null {
  return e.posterId ? `/api/events/poster/${encodeURIComponent(e.id)}?v=${encodeURIComponent(e.posterId.split('/').pop() || '')}` : null;
}
