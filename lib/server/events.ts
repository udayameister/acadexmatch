import { STORAGE_KEYS, StorageService, DEFAULT_PLAN_SETTINGS, eventsFreeActive } from '@/lib/storage';
import { withDb, accountOf, unverified } from './db';
import { cleanEventInput, isEventLive, todayIstIso, EVENT_KIND_SHORT } from '@/lib/events';
import type { AcademicEvent, Institute, PlanSettings } from '@/types';

const settingsOf = (db: Record<string, unknown>): PlanSettings => ({ ...DEFAULT_PLAN_SETTINGS, ...((db[STORAGE_KEYS.PLAN_SETTINGS] as Partial<PlanSettings>) || {}) });

/*
 * Event advertisements (FDP / workshop / seminar / conference). Anyone signed in can create one; it is shown on
 * the site only after it is paid for (or the administrator waives the fee) AND the administrator approves it.
 * Status and payment fields are never taken from the browser.
 */

const MAX_OPEN_PER_USER = 20;
const newId = () => `evt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

type Result = { ok: true; event: AcademicEvent } | { ok: false; error: string; status: number };

const list = (db: Record<string, unknown>) => ((db[STORAGE_KEYS.EVENTS] as AcademicEvent[]) || []).slice();

/** Creates or updates the signed-in user's listing. */
/** Creates or updates a listing. `publish`: the administrator adds it free and it goes live at once. */
export function saveEvent(userId: string, raw: unknown, id?: string, opts: { publish?: boolean } = {}): Promise<Result> {
  return withDb(userId, (db, c) => {
    const me = accountOf(db, userId);
    if (!me) return { ok: false, error: 'Please sign in.', status: 401 };
    if (unverified(me, db)) return { ok: false, error: 'Please confirm your email address first: open the link we emailed you, or send a new one from My account.', status: 403 };
    const clean = cleanEventInput(raw);
    if (!clean.ok) return { ok: false, error: clean.error, status: 400 };
    const events = list(db);
    const now = new Date().toISOString();
    // Launch offer: listings are free (no payment) but are still checked by the administrator.
    const free = me.role !== 'super_admin' && eventsFreeActive(settingsOf(db));
    if (id) {
      const i = events.findIndex(e => e.id === id);
      const cur = events[i];
      if (!cur || (cur.createdBy !== me.id && me.role !== 'super_admin')) return { ok: false, error: 'Listing not found.', status: 404 };
      const freeNow = free && !cur.paidAt && !cur.feeWaived;
      const paid = !!cur.paidAt || !!cur.feeWaived || freeNow;
      // The price depends on the type; after paying, an FDP/workshop/seminar cannot become a conference.
      if (paid && (cur.kind === 'conference') !== (clean.value.kind === 'conference')) {
        return { ok: false, error: `This listing was paid for as ${cur.kind === 'conference' ? 'a conference' : 'an FDP, workshop or seminar'}; its type cannot be changed to ${clean.value.kind === 'conference' ? 'a conference' : 'another category'}.`, status: 400 };
      }
      const next: AcademicEvent = {
        ...cur, ...clean.value, updatedAt: now,
        ...(freeNow ? { feeWaived: true, freeOffer: true } : {}),
        // Changes to a paid listing are checked again before they are shown (the administrator's own edits are not).
        status: me.role === 'super_admin' ? cur.status : paid ? 'under_review' : 'awaiting_payment',
        reviewNote: me.role === 'super_admin' ? cur.reviewNote : null,
      };
      events[i] = next;
      c.set(STORAGE_KEYS.EVENTS, events);
      return { ok: true, event: next };
    }
    const open = events.filter(e => e.createdBy === me.id && e.status === 'awaiting_payment').length;
    if (me.role !== 'super_admin' && open >= MAX_OPEN_PER_USER) return { ok: false, error: 'You have many unpaid listings. Pay for or delete some before adding more.', status: 400 };
    const inst = me.instituteId ? ((db[STORAGE_KEYS.INSTITUTES] as Institute[]) || []).find(x => x.id === me.instituteId) : undefined;
    const ev: AcademicEvent = {
      id: newId(), ...clean.value, instituteId: inst?.id || null,
      status: free ? 'under_review' : 'awaiting_payment', createdBy: me.id, createdAt: now, updatedAt: now,
      ...(free ? { feeWaived: true, freeOffer: true } : {}),
      ...(opts.publish && me.role === 'super_admin' ? { status: 'published' as const, feeWaived: true, addedByAdmin: true, publishedAt: now } : {}),
    };
    c.set(STORAGE_KEYS.EVENTS, [ev, ...events]);
    return { ok: true, event: ev };
  });
}

/** Launch offer: send an unpaid listing for review without payment. */
export function claimFreeListing(userId: string, id: string): Promise<Result> {
  return withDb(userId, (db, c) => {
    const me = accountOf(db, userId);
    const events = list(db);
    const i = events.findIndex(e => e.id === id);
    const cur = events[i];
    if (!me || !cur || cur.createdBy !== me.id) return { ok: false, error: 'Listing not found.', status: 404 };
    if (cur.status !== 'awaiting_payment') return { ok: false, error: 'This listing is not waiting for payment.', status: 400 };
    if (!eventsFreeActive(settingsOf(db))) return { ok: false, error: 'The free listing offer has ended. Please pay to send it for review.', status: 400 };
    const next: AcademicEvent = { ...cur, status: 'under_review', feeWaived: true, freeOffer: true, updatedAt: new Date().toISOString() };
    events[i] = next;
    c.set(STORAGE_KEYS.EVENTS, events);
    return { ok: true, event: next };
  });
}

/** The poster can delete a listing they have not paid for; the administrator can delete any. */
export function deleteEvent(userId: string, id: string): Promise<{ ok: boolean; error?: string }> {
  return withDb(userId, (db, c) => {
    const me = accountOf(db, userId);
    const events = list(db);
    const ev = events.find(e => e.id === id);
    if (!me || !ev) return { ok: false, error: 'Listing not found.' };
    const isAdmin = me.role === 'super_admin';
    if (!isAdmin && ev.createdBy !== me.id) return { ok: false, error: 'Listing not found.' };
    if (!isAdmin && (ev.paidAt || (ev.feeWaived && !ev.freeOffer))) return { ok: false, error: 'A paid listing cannot be deleted here. Email info@acadexmatch.com if the event is cancelled.' };
    c.set(STORAGE_KEYS.EVENTS, events.filter(e => e.id !== id));
    if (isAdmin) StorageService.addAuditLog(`Deleted event listing "${ev.title}"`, ev.id, 'JOB_MODERATION');
    return { ok: true };
  });
}

/** Administrator: approve (publish), reject with a reason, or publish without payment. */
export function reviewEvent(adminId: string, id: string, decision: 'approve' | 'reject' | 'waive', note?: string): Promise<Result> {
  return withDb(adminId, (db, c) => {
    const me = accountOf(db, adminId);
    if (me?.role !== 'super_admin') return { ok: false, error: 'Only the platform administrator can do this.', status: 403 };
    const events = list(db);
    const i = events.findIndex(e => e.id === id);
    if (i < 0) return { ok: false, error: 'Listing not found.', status: 404 };
    const ev = { ...events[i] };
    const now = new Date().toISOString();
    const reason = (note || '').trim().slice(0, 500);
    if (decision === 'reject') {
      if (!reason) return { ok: false, error: 'Write the reason, so the organiser can correct the listing.', status: 400 };
      Object.assign(ev, { status: 'rejected', reviewNote: reason });
    } else {
      if (decision === 'approve' && !ev.paidAt && !ev.feeWaived) return { ok: false, error: 'This listing has not been paid for. Use "Publish without payment" to waive the fee.', status: 400 };
      if (ev.endDate < todayIstIso()) return { ok: false, error: 'This event has already ended.', status: 400 };
      Object.assign(ev, { status: 'published', reviewNote: null, publishedAt: now, ...(decision === 'waive' ? { feeWaived: true } : {}) });
    }
    ev.updatedAt = now;
    events[i] = ev;
    c.set(STORAGE_KEYS.EVENTS, events);
    StorageService.addAuditLog(`${decision === 'reject' ? 'Rejected' : decision === 'waive' ? 'Published (fee waived)' : 'Approved'} ${EVENT_KIND_SHORT[ev.kind]} listing "${ev.title}"`, ev.id, 'JOB_MODERATION');
    return { ok: true, event: ev };
  });
}

/** A live listing for search-engine metadata (null when not published or already over). */
export async function getLiveEvent(id: string): Promise<AcademicEvent | null> {
  return withDb(null, db => {
    const ev = ((db[STORAGE_KEYS.EVENTS] as AcademicEvent[]) || []).find(e => e.id === id);
    return ev && isEventLive(ev) ? ev : null;
  });
}

/** Live listings for the sitemap. */
export async function liveEvents(): Promise<AcademicEvent[]> {
  return withDb(null, db => ((db[STORAGE_KEYS.EVENTS] as AcademicEvent[]) || []).filter(e => isEventLive(e)));
}

/** Administrator: highlight a listing (shown as a poster at the top of the home page) or remove the highlight. */
export function setHighlight(adminId: string, id: string, on: boolean): Promise<Result> {
  return withDb(adminId, (db, c) => {
    if (accountOf(db, adminId)?.role !== 'super_admin') return { ok: false, error: 'Only the platform administrator can do this.', status: 403 };
    const events = list(db);
    const i = events.findIndex(e => e.id === id);
    if (i < 0) return { ok: false, error: 'Listing not found.', status: 404 };
    if (on && events[i].status !== 'published') return { ok: false, error: 'Publish the listing before highlighting it.', status: 400 };
    events[i] = { ...events[i], highlighted: on, updatedAt: new Date().toISOString() };
    c.set(STORAGE_KEYS.EVENTS, events);
    StorageService.addAuditLog(`${on ? 'Highlighted' : 'Removed highlight from'} event "${events[i].title}"`, id, 'JOB_MODERATION');
    return { ok: true, event: events[i] };
  });
}

/**
 * Records a new (or removed) poster for a listing. Poster owners: the poster's creator or the administrator.
 * A new poster on a paid, published listing from its organiser is checked again before it is shown.
 * Returns the previous poster's blob id so the caller can delete it.
 */
export function setPoster(userId: string, id: string, posterId: string | null): Promise<{ ok: true; event: AcademicEvent; previous: string | null } | { ok: false; error: string; status: number }> {
  return withDb(userId, (db, c) => {
    const me = accountOf(db, userId);
    const events = list(db);
    const i = events.findIndex(e => e.id === id);
    const cur = events[i];
    if (!me || !cur || (cur.createdBy !== me.id && me.role !== 'super_admin')) return { ok: false, error: 'Listing not found.', status: 404 };
    const previous = cur.posterId || null;
    const next: AcademicEvent = { ...cur, posterId, updatedAt: new Date().toISOString() };
    if (me.role !== 'super_admin' && posterId && cur.status === 'published') { next.status = 'under_review'; next.reviewNote = null; }
    events[i] = next;
    c.set(STORAGE_KEYS.EVENTS, events);
    return { ok: true, event: next, previous };
  });
}

/** Poster blob of a listing anyone may see (live), or that the viewer owns / administers. */
export function posterFor(userId: string | null, id: string): Promise<{ blobId: string; isPublic: boolean } | null> {
  return withDb(userId, db => {
    const ev = list(db).find(e => e.id === id);
    if (!ev?.posterId) return null;
    if (isEventLive(ev)) return { blobId: ev.posterId, isPublic: true };
    const me = accountOf(db, userId);
    return me && (me.id === ev.createdBy || me.role === 'super_admin') ? { blobId: ev.posterId, isPublic: false } : null;
  });
}
