/* Store for the funding calendar and the NET / SET hub ("tools-data" JSON). Falls back to the checked seed. */
import { readJson, writeJson } from './persist';
import { SEED, cleanCall, cleanExam, cleanNotice, type ExamNotice, type Exam, type FundingCall, type ToolsData } from '@/lib/toolsData';

const STORE = 'tools-data';
let queue: Promise<unknown> = Promise.resolve();
function locked<T>(fn: () => Promise<T>): Promise<T> { const run = queue.then(fn, fn); queue = run.catch(() => undefined); return run; }

export async function getToolsData(): Promise<ToolsData> {
  const d = await readJson<ToolsData>(STORE).catch(() => null);
  if (!d || !Array.isArray(d.calls) || !Array.isArray(d.exams) || !Array.isArray(d.notices)) return SEED;
  return d;
}

async function change(fn: (d: ToolsData) => void): Promise<ToolsData> {
  return locked(async () => {
    const d = structuredClone(await getToolsData());
    fn(d);
    d.updatedAt = new Date().toISOString();
    await writeJson(STORE, d);
    return d;
  });
}
const upsert = <T extends { id: string }>(list: T[], item: T, prevId?: string) => {
  const i = list.findIndex(x => x.id === (prevId || item.id));
  if (prevId && prevId !== item.id && list.some(x => x.id === item.id)) throw new Error('Another entry already has that id.');
  if (i >= 0) list[i] = item; else list.push(item);
};

export const saveCall = (raw: Partial<FundingCall>, prevId?: string) => change(d => upsert(d.calls, cleanCall(raw), prevId));
export const deleteCall = (id: string) => change(d => { d.calls = d.calls.filter(c => c.id !== id); });
export const saveExam = (raw: Partial<Exam>, prevId?: string) => change(d => {
  const e = cleanExam(raw);
  upsert(d.exams, e, prevId);
  if (prevId && prevId !== e.id) d.notices.forEach(n => { if (n.examId === prevId) n.examId = e.id; });
});
export const deleteExam = (id: string) => change(d => {
  if (d.notices.some(n => n.examId === id)) throw new Error('Delete or move this exam’s notices first.');
  d.exams = d.exams.filter(e => e.id !== id);
});
export const saveNotice = (raw: Partial<ExamNotice>, prevId?: string) => change(d => upsert(d.notices, cleanNotice(raw, d.exams), prevId));
export const deleteNotice = (id: string) => change(d => { d.notices = d.notices.filter(n => n.id !== id); });
