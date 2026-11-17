import { readJson, writeJson } from './persist';

/*
 * Messages between each user and the AcadeXMatch team (the platform administrator).
 *
 * Every conversation belongs to exactly one user: candidates and institutions can only ever read their own
 * conversations, and only the platform administrator reads all of them. The data lives in its own private store
 * (json:messages), separate from the shared app data that is synced to browsers, so it is only ever reached through
 * the checked API routes (app/api/messages and app/api/admin/messages).
 */

export type Side = 'user' | 'admin';

export interface Message {
  id: string;
  from: Side;
  /** Shown name: the user's name, or "AcadeXMatch team" for the administrator. */
  author: string;
  body: string;
  at: string;
}

export interface Thread {
  id: string;
  userId: string;
  /** Copied when the conversation starts, so the admin list stays readable; refreshed on each user message. */
  userName: string;
  userEmail: string;
  userRole: string;
  subject: string;
  status: 'open' | 'closed';
  startedBy: Side;
  createdAt: string;
  updatedAt: string;
  /** Messages the user (or the admin) has not opened yet. */
  unreadUser: number;
  unreadAdmin: number;
  messages: Message[];
}

interface Store { threads: Thread[] }

const STORE = 'messages';
export const LIMITS = {
  subject: 140,
  body: 4000,
  messagesPerThread: 400,
  threads: 5000,
  openThreadsPerUser: 20,
};

let chain: Promise<unknown> = Promise.resolve();
function locked<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.catch(() => undefined);
  return run;
}

async function read(): Promise<Store> {
  const s = await readJson<Partial<Store>>(STORE);
  return { threads: Array.isArray(s?.threads) ? s!.threads : [] };
}

async function write(s: Store): Promise<void> {
  s.threads.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  s.threads = s.threads.slice(0, LIMITS.threads);
  await writeJson(STORE, s);
}

function update<T>(fn: (s: Store) => T): Promise<T> {
  return locked(async () => {
    const s = await read();
    const r = fn(s);
    await write(s);
    return r;
  });
}

const newId = (p: string) => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** Trims, normalises line breaks and limits length; '' when there is nothing left. */
export function cleanText(x: unknown, max: number): string {
  return String(typeof x === 'string' ? x : '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim()
    .slice(0, max);
}

export class MessageError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export interface Who { id: string; name: string; email: string; role: string }

/** Summary for lists (no message bodies except a short preview of the last one). */
export interface ThreadSummary extends Omit<Thread, 'messages'> { count: number; last?: { from: Side; preview: string; at: string } }

export function summary(t: Thread): ThreadSummary {
  const { messages, ...rest } = t;
  const l = messages[messages.length - 1];
  return { ...rest, count: messages.length, last: l ? { from: l.from, preview: l.body.slice(0, 140), at: l.at } : undefined };
}

// ------------------------------------------------------------------ user side

export async function threadsForUser(userId: string): Promise<Thread[]> {
  const s = await locked(read);
  return s.threads.filter(t => t.userId === userId);
}

export async function unreadForUser(userId: string): Promise<number> {
  const s = await locked(read);
  return s.threads.reduce((n, t) => n + (t.userId === userId ? t.unreadUser : 0), 0);
}

/** A user starts a new conversation with the AcadeXMatch team. */
export async function userStart(who: Who, subjectIn: unknown, bodyIn: unknown): Promise<Thread> {
  const subject = cleanText(subjectIn, LIMITS.subject).replace(/\n+/g, ' ');
  const body = cleanText(bodyIn, LIMITS.body);
  if (!subject) throw new MessageError('Please add a subject.');
  if (!body) throw new MessageError('Please write your message.');
  return update(s => {
    if (s.threads.filter(t => t.userId === who.id && t.status === 'open').length >= LIMITS.openThreadsPerUser) {
      throw new MessageError('You have many open conversations. Please continue in one of them.');
    }
    const at = new Date().toISOString();
    const t: Thread = {
      id: newId('thr'), userId: who.id, userName: who.name, userEmail: who.email, userRole: who.role,
      subject, status: 'open', startedBy: 'user', createdAt: at, updatedAt: at, unreadUser: 0, unreadAdmin: 1,
      messages: [{ id: newId('msg'), from: 'user', author: who.name, body, at }],
    };
    s.threads.unshift(t);
    return t;
  });
}

/** A user replies in one of their own conversations (re-opens it if the team had closed it). */
export async function userReply(who: Who, threadId: unknown, bodyIn: unknown): Promise<Thread> {
  const body = cleanText(bodyIn, LIMITS.body);
  if (!body) throw new MessageError('Please write your message.');
  return update(s => {
    const t = s.threads.find(x => x.id === threadId && x.userId === who.id);
    if (!t) throw new MessageError('Conversation not found.', 404);
    if (t.messages.length >= LIMITS.messagesPerThread) throw new MessageError('This conversation is full. Please start a new one.');
    const at = new Date().toISOString();
    t.messages.push({ id: newId('msg'), from: 'user', author: who.name, body, at });
    t.userName = who.name; t.userEmail = who.email; t.userRole = who.role;
    t.status = 'open'; t.updatedAt = at; t.unreadAdmin += 1; t.unreadUser = 0;
    return t;
  });
}

export function userMarkRead(userId: string, threadId: unknown): Promise<Thread | null> {
  return update(s => {
    const t = s.threads.find(x => x.id === threadId && x.userId === userId);
    if (t) t.unreadUser = 0;
    return t || null;
  });
}

// ------------------------------------------------------------------ admin side

export const TEAM_NAME = 'AcadeXMatch team';

export async function allThreads(): Promise<Thread[]> {
  return (await locked(read)).threads;
}

export async function threadById(id: string): Promise<Thread | null> {
  return (await locked(read)).threads.find(t => t.id === id) || null;
}

export async function unreadForAdmin(): Promise<number> {
  return (await locked(read)).threads.reduce((n, t) => n + t.unreadAdmin, 0);
}

/** The team starts a conversation with one user. */
export async function adminStart(to: Who, subjectIn: unknown, bodyIn: unknown): Promise<Thread> {
  const subject = cleanText(subjectIn, LIMITS.subject).replace(/\n+/g, ' ');
  const body = cleanText(bodyIn, LIMITS.body);
  if (!subject) throw new MessageError('Please add a subject.');
  if (!body) throw new MessageError('Please write your message.');
  return update(s => {
    const at = new Date().toISOString();
    const t: Thread = {
      id: newId('thr'), userId: to.id, userName: to.name, userEmail: to.email, userRole: to.role,
      subject, status: 'open', startedBy: 'admin', createdAt: at, updatedAt: at, unreadUser: 1, unreadAdmin: 0,
      messages: [{ id: newId('msg'), from: 'admin', author: TEAM_NAME, body, at }],
    };
    s.threads.unshift(t);
    return t;
  });
}

export async function adminReply(threadId: unknown, bodyIn: unknown): Promise<Thread> {
  const body = cleanText(bodyIn, LIMITS.body);
  if (!body) throw new MessageError('Please write your message.');
  return update(s => {
    const t = s.threads.find(x => x.id === threadId);
    if (!t) throw new MessageError('Conversation not found.', 404);
    if (t.messages.length >= LIMITS.messagesPerThread) throw new MessageError('This conversation is full. Please start a new one.');
    const at = new Date().toISOString();
    t.messages.push({ id: newId('msg'), from: 'admin', author: TEAM_NAME, body, at });
    t.status = 'open'; t.updatedAt = at; t.unreadUser += 1; t.unreadAdmin = 0;
    return t;
  });
}

export function adminMarkRead(threadId: unknown): Promise<Thread | null> {
  return update(s => {
    const t = s.threads.find(x => x.id === threadId);
    if (t) t.unreadAdmin = 0;
    return t || null;
  });
}

export async function adminSetStatus(threadId: unknown, status: unknown): Promise<Thread> {
  if (status !== 'open' && status !== 'closed') throw new MessageError('Invalid status.');
  return update(s => {
    const t = s.threads.find(x => x.id === threadId);
    if (!t) throw new MessageError('Conversation not found.', 404);
    t.status = status;
    if (status === 'closed') t.unreadAdmin = 0;
    return t;
  });
}

/** Account deletion: the user's conversations go with the account. */
export function eraseUserMessages(userId: string): Promise<number> {
  return update(s => {
    const before = s.threads.length;
    s.threads = s.threads.filter(t => t.userId !== userId);
    return before - s.threads.length;
  });
}

/** "Reset all data" in the admin console also empties the conversations. */
export function resetMessages(): Promise<void> {
  return update(s => { s.threads = []; });
}
