/*
 * Bloom's taxonomy (revised, Anderson & Krathwohl 2001) level of an exam question from its action verbs.
 * Simple keyword rules — no AI. The highest level whose verb appears in the question wins; question words
 * ("what is", "why", "how would you") decide when there is no action verb.
 */

export type BloomLevel = 1 | 2 | 3 | 4 | 5 | 6;
export const BLOOM: { level: BloomLevel; code: string; name: string; color: string; verbs: string[] }[] = [
  { level: 1, code: 'L1', name: 'Remember', color: '#64748b', verbs: ['define', 'list', 'state', 'name', 'recall', 'identify', 'label', 'match', 'memorize', 'recite', 'recognize', 'reproduce', 'select', 'tabulate', 'enumerate', 'mention', 'write down', 'who', 'when', 'where', 'what is', 'what are', 'expand', 'abbreviate', 'quote'] },
  { level: 2, code: 'L2', name: 'Understand', color: '#0e7490', verbs: ['explain', 'describe', 'discuss', 'summarize', 'summarise', 'interpret', 'classify', 'compare', 'contrast', 'distinguish between', 'differentiate between', 'illustrate', 'outline', 'paraphrase', 'give an example', 'give examples', 'restate', 'review', 'translate', 'infer', 'estimate', 'extend', 'generalize', 'predict', 'rewrite', 'why', 'indicate', 'locate', 'express', 'report', 'brief'] },
  { level: 3, code: 'L3', name: 'Apply', color: '#15803d', verbs: ['apply', 'solve', 'calculate', 'compute', 'demonstrate', 'use', 'implement', 'execute', 'determine', 'find', 'construct', 'draw', 'sketch', 'show that', 'prove that', 'derive', 'evaluate the integral', 'simulate', 'operate', 'practise', 'practice', 'modify', 'prepare', 'produce', 'schedule', 'employ', 'write a program', 'write a c program', 'write a python program', 'write an algorithm', 'convert', 'relate', 'manipulate', 'how would you use', 'trace', 'perform', 'measure', 'plot', 'verify'] },
  { level: 4, code: 'L4', name: 'Analyze', color: '#a16207', verbs: ['analyze', 'analyse', 'examine', 'investigate', 'differentiate', 'distinguish', 'categorize', 'categorise', 'organize', 'deconstruct', 'break down', 'inspect', 'test', 'diagnose', 'debug', 'deduce', 'question', 'compare and contrast', 'what is the relationship', 'what are the causes', 'how does', 'attribute', 'outline the structure', 'correlate', 'dissect', 'detect', 'identify the error', 'find the error', 'illustrate the difference'] },
  { level: 5, code: 'L5', name: 'Evaluate', color: '#b45309', verbs: ['evaluate', 'assess', 'justify', 'critique', 'criticize', 'criticise', 'judge', 'defend', 'appraise', 'argue', 'recommend', 'rate', 'rank', 'prioritize', 'select the best', 'choose the best', 'decide', 'conclude', 'support your answer', 'validate', 'weigh', 'which is better', 'do you agree', 'comment on', 'critically', 'verify whether', 'measure the effectiveness'] },
  { level: 6, code: 'L6', name: 'Create', color: '#7c2d12', verbs: ['design', 'create', 'develop', 'formulate', 'compose', 'construct a model', 'invent', 'plan', 'propose', 'devise', 'generate', 'hypothesize', 'hypothesise', 'build', 'originate', 'synthesize', 'synthesise', 'improve', 'what would happen if', 'how would you design', 'write a proposal', 'make a model', 'produce a new', 'compile', 'integrate', 'reorganize', 'reorganise', 'architect', 'model a', 'propose an alternative'] },
];

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const PATTERNS = BLOOM.flatMap(b => b.verbs.map(v => ({ level: b.level, verb: v, re: new RegExp(`(^|[^a-z])${esc(v).replace(/ /g, '\\s+')}(?=[^a-z]|$)`, 'i') })))
  // Longer phrases first so "compare and contrast" beats "compare", "evaluate the integral" beats "evaluate".
  .sort((a, b) => b.verb.length - a.verb.length);

export interface TaggedQuestion { text: string; level: BloomLevel | null; verb: string | null; all: { level: BloomLevel; verb: string }[] }

/** Splits a pasted paper into questions: numbered lines (1., 1), Q1, (a), a.) or one per line. */
export function splitQuestions(src: string): string[] {
  const lines = src.replace(/\r/g, '').split('\n').map(l => l.trim()).filter(Boolean);
  const start = /^(?:Q\.?\s*\d+[a-z]?[.):\s-]|\d+\s*[.)]\s|\d+\s*[a-z]\s*[.)]\s|\(?[a-z]\)\s|\(?[ivx]+\)\s|[a-z]\.\s)/i;
  if (lines.filter(l => start.test(l)).length >= 2) {
    const out: string[] = [];
    for (const l of lines) { if (start.test(l) || !out.length) out.push(l); else out[out.length - 1] += ` ${l}`; }
    return out.map(q => q.replace(/\s+/g, ' ')).filter(q => /[a-z]{3,}/i.test(q));
  }
  return lines.filter(q => /[a-z]{3,}/i.test(q));
}

export function tagQuestion(q: string): TaggedQuestion {
  // Ignore the number and marks such as "(10 marks)", "[CO2, L3]".
  const text = q.replace(/^(?:Q\.?\s*\d+[a-z]?[.):\s-]*|\d+\s*[.)]\s*|\(?[a-z]\)\s*|\(?[ivx]+\)\s*)/i, '').replace(/[[(]\s*(?:\d+\s*m(?:arks?)?|co\s*\d[^\])]*|l\s*\d)[^\])]*[\])]/gi, ' ');
  const taken: [number, number][] = [];
  const all: { level: BloomLevel; verb: string }[] = [];
  for (const p of PATTERNS) {
    const m = p.re.exec(text);
    if (!m) continue;
    const s = m.index + m[1].length, e = s + m[0].length - m[1].length;
    if (taken.some(([a, b]) => s < b && e > a)) continue; // part of a longer phrase already matched
    taken.push([s, e]);
    all.push({ level: p.level as BloomLevel, verb: p.verb });
  }
  if (!all.length) return { text: q, level: null, verb: null, all };
  const top = all.reduce((a, b) => (b.level > a.level ? b : a));
  return { text: q, level: top.level, verb: top.verb, all };
}

export function distribution(tags: { level: BloomLevel | null }[]) {
  const total = tags.length || 1;
  return BLOOM.map(b => { const c = tags.filter(t => t.level === b.level).length; return { ...b, count: c, pct: Math.round((c / total) * 100) }; });
}
