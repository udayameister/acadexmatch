/* Messages between users and the AcadeXMatch team. Run: npx tsx tests/messages.ts */
import assert from 'assert';
import os from 'os';
import path from 'path';
import fs from 'fs';

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'acx-msg-'));
  process.chdir(dir);
  process.env.ACAD_STORAGE = 'file';
  delete process.env.DB_HOST;
  const m = await import('../lib/server/messages');

  const asha = { id: 'u-asha', name: 'Dr Asha', email: 'asha@example.com', role: 'candidate' };
  const ravi = { id: 'u-ravi', name: 'Sample College', email: 'hr@college.example', role: 'institute_admin' };

  // A user starts a conversation; the admin sees one unread message.
  const t1 = await m.userStart(asha, '  Premium plan  ', 'How do I upgrade?\r\n\r\n\r\n\r\n\r\nThanks');
  assert.equal(t1.subject, 'Premium plan');
  assert.equal(t1.messages[0].body, 'How do I upgrade?\n\n\nThanks', 'line breaks normalised and squeezed');
  assert.equal(t1.unreadAdmin, 1);
  assert.equal(await m.unreadForAdmin(), 1);
  assert.equal(await m.unreadForUser(asha.id), 0);

  // Empty input is refused.
  await assert.rejects(m.userStart(asha, '', 'x'), /subject/);
  await assert.rejects(m.userStart(asha, 'x', '   '), /message/);
  await assert.rejects(m.userReply(asha, t1.id, ''), /message/);

  // Users only ever see and touch their own conversations.
  const t2 = await m.userStart(ravi, 'Verification', 'Please verify our institution.');
  assert.deepEqual((await m.threadsForUser(asha.id)).map(t => t.id), [t1.id]);
  assert.deepEqual((await m.threadsForUser(ravi.id)).map(t => t.id), [t2.id]);
  await assert.rejects(m.userReply(asha, t2.id, 'hello'), /not found/i, 'cannot reply in another user\'s conversation');
  assert.equal(await m.userMarkRead(asha.id, t2.id), null, 'cannot mark another user\'s conversation read');

  // The admin replies: the user gets an unread message; the admin's counter for that thread clears.
  const r1 = await m.adminReply(t1.id, 'Open Plans & Premium and choose a plan.');
  assert.equal(r1.unreadUser, 1);
  assert.equal(r1.unreadAdmin, 0);
  assert.equal(r1.messages[1].author, m.TEAM_NAME);
  assert.equal(await m.unreadForUser(asha.id), 1);
  await m.userMarkRead(asha.id, t1.id);
  assert.equal(await m.unreadForUser(asha.id), 0);

  // Resolving and re-opening: a user reply re-opens a closed conversation.
  await m.adminSetStatus(t1.id, 'closed');
  assert.equal((await m.threadById(t1.id))!.status, 'closed');
  await assert.rejects(m.adminSetStatus(t1.id, 'archived'), /Invalid status/);
  const r2 = await m.userReply(asha, t1.id, 'One more question.');
  assert.equal(r2.status, 'open');
  assert.equal(r2.unreadAdmin, 1);

  // The admin can start a conversation with any user.
  const t3 = await m.adminStart(ravi, 'Your vacancy', 'Please add the last date.');
  assert.equal(t3.startedBy, 'admin');
  assert.equal(t3.unreadUser, 1);
  assert.equal(await m.unreadForUser(ravi.id), 1);

  // Lists sort newest first and summaries do not carry message bodies.
  const all = await m.allThreads();
  assert.equal(all[0].id, t3.id);
  const s = m.summary(all[0]);
  assert.equal((s as unknown as { messages?: unknown }).messages, undefined);
  assert.equal(s.count, 1);
  assert.equal(s.last?.preview, 'Please add the last date.');

  // Length limits.
  const long = await m.userReply(asha, t1.id, 'x'.repeat(m.LIMITS.body + 500));
  assert.equal(long.messages[long.messages.length - 1].body.length, m.LIMITS.body);

  // Concurrent writes are not lost.
  await Promise.all(Array.from({ length: 10 }, (_, i) => m.userReply(asha, t1.id, `parallel ${i}`)));
  assert.equal((await m.threadById(t1.id))!.messages.length, 4 + 10);

  // Deleting an account removes that user's conversations only.
  assert.equal(await m.eraseUserMessages(ravi.id), 2);
  assert.deepEqual((await m.allThreads()).map(t => t.userId), [asha.id]);

  // The store is private: nothing about messages is written into the shared app data file.
  assert(fs.existsSync(path.join(dir, 'data', 'messages.json')));
  assert(!fs.existsSync(path.join(dir, 'data', 'db.json')) || !/Premium plan/.test(fs.readFileSync(path.join(dir, 'data', 'db.json'), 'utf8')));

  fs.rmSync(dir, { recursive: true, force: true });
  console.log('messages: all checks passed');
})().catch(e => { console.error(e); process.exit(1); });
