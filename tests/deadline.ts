/* Deadline status, filters and sorting used by the admin console. Run: npx tsx tests/deadline.ts */
import assert from 'assert';
import { deadlineCounts, deadlineState, matchesDeadline, sortJobs } from '../lib/deadline';

const T = '2026-11-10';
const j = (id: string, applicationDeadline: string | null, postedAt = '2026-11-01') => ({ id, applicationDeadline, postedAt, title: `Post ${id}`, instituteName: `Inst ${id}` });
assert.deepEqual(deadlineState(j('a', '2026-11-09'), T), { kind: 'completed', days: 1, label: 'Deadline completed yesterday' });
assert.equal(deadlineState(j('a', '2026-10-31'), T).label, 'Deadline completed 10 days ago');
assert.equal(deadlineState(j('a', '2026-11-10'), T).kind, 'today');
assert.equal(deadlineState(j('a', '2026-11-15'), T).label, 'Live · closes in 5 days');
assert.equal(deadlineState(j('a', '2026-11-30'), T).label, 'Live · 20 days left');
assert.equal(deadlineState(j('a', null), T).kind, 'none');

const list = [j('live', '2026-11-30', '2026-11-05'), j('soon', '2026-11-12', '2026-11-09'), j('today', '2026-11-10'), j('old', '2026-10-01'), j('recent', '2026-11-08'), j('nodate', null, '2026-11-08')];
assert.deepEqual(deadlineCounts(list, T), { all: 6, live: 3, closing: 2, completed: 2, none: 1 });
assert.deepEqual(list.filter(x => matchesDeadline(x, 'live', T)).map(x => x.id), ['live', 'soon', 'today']);
assert.deepEqual(list.filter(x => matchesDeadline(x, 'closing', T)).map(x => x.id), ['soon', 'today']);
assert.deepEqual(list.filter(x => matchesDeadline(x, 'completed', T)).map(x => x.id), ['old', 'recent']);
assert.deepEqual(sortJobs(list, 'deadline-asc', T).map(x => x.id), ['old', 'recent', 'today', 'soon', 'live', 'nodate']);
assert.deepEqual(sortJobs(list, 'deadline-desc', T).map(x => x.id), ['live', 'soon', 'today', 'recent', 'old', 'nodate']);
assert.deepEqual(sortJobs(list, 'expired-recent', T).map(x => x.id), ['today', 'soon', 'live', 'nodate', 'recent', 'old']);
assert.deepEqual(sortJobs(list, 'posted-desc', T).map(x => x.id)[0], 'soon');
console.log('deadline: all checks passed');
