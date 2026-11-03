/* Small text utilities for the resume engine: tokens, a light English stemmer and keyword phrases. */

export const STOPWORDS = new Set(`a about above after again against all also am an and any are as at be because been before being below between both but by can could did do does doing down during each etc few for from further had has have having he her here hers him his how i if in into is it its itself just me more most my no nor not of off on once only or other our out over own per same she should so some such than that the their them then there these they this those through to too under until up upon very was we were what when where which while who whom why will with within without would you your yours via shall must may might us e.g i.e eg ie`.split(/\s+/));

/** Words that appear in almost every job description and carry no meaning for matching. */
export const GENERIC = new Set(`ability able applicant applicants apply candidate candidates company excellent experience experienced good great job join knowledge looking opportunity opportunities position preferred required requirement requirements responsibilities responsibility role skills skill strong team teams understanding work working year years plus etc including include includes various related relevant using use well new based like least minimum must desired desirable demonstrated proven ensure provide support time day days part full candidate's we're you'll want need needs make help across within high level levels area areas field fields related duties duty other others best key highly`.split(/\s+/));

/** Very light stemmer (enough to match "teaching"/"taught" is out of scope; "developers"/"developer", "analysis"/"analyses" are in). */
export function stem(w: string): string {
  let t = w.toLowerCase();
  if (t.length > 5 && t.endsWith('ies')) t = `${t.slice(0, -3)}y`;
  else if (t.length > 5 && /(ches|shes|sses|xes)$/.test(t)) t = t.slice(0, -2);
  else if (t.length > 4 && t.endsWith('s') && !/(ss|us|is)$/.test(t)) t = t.slice(0, -1);
  if (t.length > 6 && t.endsWith('ing')) t = t.slice(0, -3);
  else if (t.length > 5 && t.endsWith('ed')) t = t.slice(0, -2);
  if (t.length > 6 && /(ment|ness|tion)$/.test(t)) t = t.replace(/(ment|ness)$/, '');
  return t;
}

export function words(text: string): string[] {
  return text.toLowerCase().replace(/[^a-z0-9+#./ -]/g, ' ').split(/[\s/]+/).map(w => w.replace(/^[.-]+|[.-]+$/g, '')).filter(Boolean);
}

/** Meaningful terms (single words and two-word phrases) with their counts. */
export function terms(text: string): Map<string, number> {
  const out = new Map<string, number>();
  const ws = words(text);
  const ok = (w: string) => w.length > 2 && !STOPWORDS.has(w) && !GENERIC.has(w) && !/^\d+$/.test(w);
  for (let i = 0; i < ws.length; i++) {
    const a = ws[i];
    if (ok(a)) out.set(stem(a), (out.get(stem(a)) || 0) + 1);
    const b = ws[i + 1];
    if (b && ok(a) && ok(b)) { const k = `${stem(a)} ${stem(b)}`; out.set(k, (out.get(k) || 0) + 1); }
  }
  return out;
}

/** The stemmed term set of a text, for "does the resume mention X" checks. */
export function termSet(text: string): Set<string> {
  return new Set(terms(text).keys());
}

export function hasTerm(set: Set<string>, phrase: string): boolean {
  const k = phrase.split(/\s+/).map(stem).join(' ');
  return set.has(k);
}

export const pct = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
