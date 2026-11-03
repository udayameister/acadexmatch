/* Event advertisements: npx tsx tests/events.ts */
import assert from 'assert';
import { cleanEventInput, eventPriceFor, eventPrices, isEventLive, productForKind, formatEventDates } from '../lib/events';
import { answerFromKnowledgeBase } from '../lib/helpBot';

const today = '2026-11-03';
const base = {
  kind: 'fdp', title: 'One-week FDP on Generative AI in Engineering Education', organizer: 'Example Institute of Technology',
  mode: 'in_person', venue: 'Seminar Hall, Main Block', city: 'Madanapalle', state: 'Andhra Pradesh',
  startDate: '2026-11-20', endDate: '2026-11-25', description: 'A five-day hands-on programme on using generative AI tools for teaching, assessment and research, with certificates for all participants.',
  contactEmail: 'FDP@Example.ac.in', topics: 'Generative AI, Assessment ,  , Research', registrationLink: 'example.ac.in/fdp',
};

// Prices: defaults ₹1,000 / ₹2,000, conference separate, admin overrides respected
assert.deepEqual(eventPrices(null), { eventPriceInr: 1000, conferencePriceInr: 2000 });
assert.equal(eventPriceFor({}, 'workshop'), 1000);
assert.equal(eventPriceFor({}, 'seminar'), 1000);
assert.equal(eventPriceFor({}, 'conference'), 2000);
assert.equal(eventPriceFor({ eventPriceInr: 1500, conferencePriceInr: 3000 }, 'fdp'), 1500);
assert.equal(eventPriceFor({ eventPriceInr: 1500, conferencePriceInr: 3000 }, 'conference'), 3000);
assert.equal(productForKind('fdp'), 'event_listing');
assert.equal(productForKind('conference'), 'conference_listing');

// Clean input
const ok = cleanEventInput(base, today);
assert(ok.ok);
if (ok.ok) {
  assert.equal(ok.value.contactEmail, 'fdp@example.ac.in');
  assert.deepEqual(ok.value.topics, ['Generative AI', 'Assessment', 'Research']);
  assert.equal(ok.value.registrationLink, 'https://example.ac.in/fdp');
  assert.equal(ok.value.scope, null, 'conference fields are dropped for an FDP');
}
const bad = (patch: Record<string, unknown>, re: RegExp) => {
  const r = cleanEventInput({ ...base, ...patch }, today);
  assert(!r.ok && re.test(r.error), `${JSON.stringify(patch)} → ${r.ok ? 'accepted' : r.error}`);
};
bad({ kind: 'party' }, /type of event/);
bad({ title: 'FDP' }, /title/);
bad({ endDate: '2026-11-19' }, /end date/);
bad({ startDate: '2026-10-01', endDate: '2026-10-02' }, /already ended/);
bad({ description: 'Short.' }, /80 characters/);
bad({ contactEmail: 'nope' }, /email/);
bad({ registrationLink: 'javascript:alert(1)' }, /registration link/);
bad({ venue: '' }, /venue/);
bad({ endDate: '2027-03-01' }, /at most 60 days/);
bad({ kind: 'conference', endDate: '2026-12-10' }, /at most 10 days/);
const online = cleanEventInput({ ...base, mode: 'online', venue: '' }, today);
assert(online.ok && online.value.venue === null);
const conf = cleanEventInput({ ...base, kind: 'conference', endDate: '2026-11-21', scope: 'international', paperDeadline: '2026-11-10', publication: 'Springer proceedings' }, today);
assert(conf.ok && conf.value.scope === 'international' && conf.value.paperDeadline === '2026-11-10');

// Visibility
assert.equal(isEventLive({ status: 'published', endDate: '2026-11-03' }, today), true);
assert.equal(isEventLive({ status: 'published', endDate: '2026-11-02' }, today), false);
assert.equal(isEventLive({ status: 'under_review', endDate: '2026-12-01' }, today), false);
assert.equal(formatEventDates({ startDate: '2026-11-20', endDate: '2026-11-25' }), '20 Nov – 25 Nov 2026');

// Help assistant knows about it
assert.equal(answerFromKnowledgeBase('how do I post an FDP?', 'institute').articleId, 'events');
assert.equal(answerFromKnowledgeBase('advertise our conference', 'guest').articleId, 'events');

console.log('events: all checks passed');
