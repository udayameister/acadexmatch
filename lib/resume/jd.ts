/*
 * Job description reader: title, organisation, required and preferred skills, experience, education,
 * certifications, responsibilities and the important keywords. In-house and rule-based.
 */
import { findSkills, type SkillCategory } from './skills';
import { GENERIC, STOPWORDS, terms, stem } from './text';

export type DegreeLevel = 'doctorate' | 'masters' | 'bachelors' | 'diploma';

export interface JobRequirements {
  title: string | null;
  organization: string | null;
  requiredSkills: { name: string; category: SkillCategory }[];
  preferredSkills: { name: string; category: SkillCategory }[];
  softSkills: string[];
  minExperienceYears: number | null;
  degreeLevel: DegreeLevel | null;
  degreeText: string | null;
  netRequired: boolean;
  certifications: string[];
  responsibilities: string[];
  keywords: { term: string; label: string; weight: number; required: boolean }[];
  isAcademic: boolean;
  words: number;
}

const REQUIRED_CUE = /\b(required|requirements?|must|mandatory|essential|minimum|should have|need(?:s|ed)? to have|qualifications?|eligibility|you have|you bring|what we need)\b/i;
const PREFERRED_CUE = /\b(preferred|preferable|desirable|desired|nice to have|good to have|plus|bonus|an advantage|added advantage|advantageous|ideally|optional)\b/i;
const RESP_HEAD = /^(key )?(responsibilities|duties|role|what you('| wi)ll do|job description|about the role|your role)\b/i;
const REQ_HEAD = /^(requirements?|qualifications?|eligibility|essential|must have|what we('| a)re looking for|skills required|required skills|who you are)\b/i;
const PREF_HEAD = /^(preferred|desirable|nice to have|good to have|bonus)/i;

/** Words that are common in postings but are not things a resume should "contain". */
const NOISE = new Set(['learn', 'design', 'build', 'develop', 'implement', 'candidate', 'equivalent', 'discipline', 'regulation', 'reputed', 'post', 'apply', 'course', 'synthetic', 'test', 'posting', 'example']);

function sentences(text: string): string[] {
  return text.replace(/\r/g, '').split(/\n|(?<=[.;])\s+(?=[A-Z])/).map(s => s.replace(/^[\s•●▪*\-–\d.)]+/, '').trim()).filter(Boolean);
}

export function parseJobDescription(text: string): JobRequirements {
  const lines = text.replace(/\r/g, '').split('\n').map(l => l.trim());
  const nonEmpty = lines.filter(Boolean);

  // Mark which part of the description each line belongs to (requirements / preferred / responsibilities).
  let part: 'req' | 'pref' | 'resp' | 'other' = 'other';
  const reqText: string[] = [], prefText: string[] = [], respLines: string[] = [];
  for (const l of nonEmpty) {
    const clean = l.replace(/[:\-–]+$/, '').trim();
    if (clean.length < 60 && PREF_HEAD.test(clean)) { part = 'pref'; continue; }
    if (clean.length < 60 && REQ_HEAD.test(clean)) { part = 'req'; continue; }
    if (clean.length < 60 && RESP_HEAD.test(clean)) { part = 'resp'; continue; }
    if (part === 'pref' || (PREFERRED_CUE.test(l) && part !== 'req')) prefText.push(l);
    else if (part === 'req' || REQUIRED_CUE.test(l)) reqText.push(l);
    if (part === 'resp' && l.length > 15) respLines.push(l.replace(/^[\s•●▪*\-–\d.)]+/, ''));
  }
  // Within a sentence, "preferred"/"desirable" wins over "required".
  for (const s of sentences(text)) if (PREFERRED_CUE.test(s) && !prefText.includes(s)) prefText.push(s);

  const all = findSkills(text);
  const inReq = new Set(findSkills(reqText.join('\n')).map(f => f.skill.name));
  const inPref = new Set(findSkills(prefText.join('\n')).map(f => f.skill.name));
  const hard = all.filter(f => f.skill.category !== 'Soft skills' && f.skill.category !== 'Languages');
  // A skill is "preferred" only if it appears in preferred text and not in required text; otherwise required.
  const preferredSkills = hard.filter(f => inPref.has(f.skill.name) && !inReq.has(f.skill.name)).map(f => ({ name: f.skill.name, category: f.skill.category }));
  const requiredSkills = hard.filter(f => !preferredSkills.some(p => p.name === f.skill.name)).map(f => ({ name: f.skill.name, category: f.skill.category }));
  const softSkills = all.filter(f => f.skill.category === 'Soft skills').map(f => f.skill.name);

  const exp = text.match(/(\d{1,2})\s*(?:\+|or more)?\s*(?:-|to|–)?\s*(?:\d{1,2})?\s*(?:years?|yrs?)(?:'|’)?\s+(?:of\s+)?(?:\w+\s+){0,4}?(?:experience|exp\b)/i)
    || text.match(/experience\s*(?:of)?\s*[:\-]?\s*(?:minimum|at least|min\.?)?\s*(\d{1,2})\s*\+?\s*(?:years?|yrs?)/i)
    || text.match(/(?:minimum|at least|min\.?)\s*(\d{1,2})\s*(?:years?|yrs?)/i);
  const minExperienceYears = exp ? Number(exp[1]) : null;

  const degree = (re: RegExp) => re.test(text);
  const degreeLevel: DegreeLevel | null =
    degree(/\b(ph\.?\s?d|doctorate|doctoral degree)\b/i) && /\b(ph\.?\s?d|doctorate)\b[^.\n]{0,60}\b(required|essential|mandatory|must)|\b(required|essential|mandatory|must)\b[^.\n]{0,60}\b(ph\.?\s?d|doctorate)\b|^.*\bph\.?\s?d\b.*$/im.test(text) && !/ph\.?\s?d[^.\n]{0,40}(preferred|desirable)/i.test(text) ? 'doctorate'
      : degree(/\b(m\.?\s?tech|m\.?\s?e\b|m\.?\s?sc|mca|mba|master'?s|post[- ]?graduat|m\.?\s?pharm|m\.?\s?com|m\.?\s?a\b|pg degree)\b/i) ? 'masters'
        : degree(/\b(b\.?\s?tech|b\.?\s?e\b|b\.?\s?sc|bca|bachelor'?s|graduat(e|ion)|b\.?\s?com|degree in)\b/i) ? 'bachelors'
          : degree(/\bdiploma\b/i) ? 'diploma' : null;
  const degreeText = text.match(/[^.\n]*\b(ph\.?\s?d|doctorate|master'?s|m\.?\s?tech|m\.?\s?e\b|bachelor'?s|b\.?\s?tech|b\.?\s?e\b|degree)\b[^.\n]*/i)?.[0].trim().slice(0, 200) || null;
  const netRequired = /\b(ugc[- ]?net|csir[- ]?net|net\s*\/\s*s?let|net or (s?let|set)|set\s*\/\s*slet|\bnet\b[^.\n]{0,30}(qualified|mandatory|required))/i.test(text);

  const certifications = [...new Set((text.match(/\b(ugc[- ]?net|csir[- ]?net|gate|slet|set|aws certified[\w -]{0,30}|azure[\w -]{0,20}certifi\w*|pmp|prince2|cissp|ceh|ccna|ccnp|six sigma[\w ]{0,12}|scrum master|google (data|cloud)[\w ]{0,20}certifi\w*|nptel)\b/gi) || []).map(c => c.replace(/\s+(is|are|will|would|a|an|preferred|desirable|plus|required|mandatory|or|and|with)\b.*$/i, '').trim().toUpperCase().replace(/\s+/g, ' ')))].slice(0, 10);

  // Important keywords: dictionary skills plus the description's own repeated terms.
  const skillTerms = all.filter(f => f.skill.category !== 'Languages').map(f => ({
    term: f.skill.name.toLowerCase(), label: f.skill.name,
    weight: (inReq.has(f.skill.name) ? 3 : inPref.has(f.skill.name) ? 1.5 : 2) + Math.min(2, f.count - 1) * 0.5,
    required: !preferredSkills.some(p => p.name === f.skill.name),
  }));
  const skillStems = new Set(all.flatMap(f => f.skill.aliases.map(a => a.split(/\s+/).map(stem).join(' '))));
  const skillLabels = all.map(f => f.skill.name.toLowerCase());
  const tf = terms(text);
  const reqTf = terms(reqText.join('\n'));
  const own = [...tf.entries()]
    .filter(([t, n]) => {
      const parts = t.split(' ');
      if (skillStems.has(t) || parts.some(p => STOPWORDS.has(p) || GENERIC.has(p) || NOISE.has(p))) return false;
      if (skillLabels.some(l => l.includes(t))) return false;
      return parts.length === 2 ? n >= 2 : n >= 3 || (reqTf.get(t) || 0) >= 2;
    })
    .sort((a, b) => b[1] - a[1]).slice(0, 15)
    .map(([t, n]) => ({ term: t, label: t, weight: 1 + Math.min(2, (reqTf.get(t) || 0)) * 0.5 + Math.min(1, n / 5), required: (reqTf.get(t) || 0) > 0 }));
  const keywords = [...skillTerms, ...own].sort((a, b) => b.weight - a.weight).slice(0, 40);

  const title = (text.match(/^(?:job title|position|post|role|designation)\s*[:\-–]\s*(.+)$/im)?.[1]
    || nonEmpty.find(l => l.length <= 80 && /\b(professor|lecturer|engineer|developer|scientist|analyst|manager|associate|fellow|assistant|officer|consultant|designer|architect|teacher|researcher|lead|head|director|intern)\b/i.test(l) && !REQUIRED_CUE.test(l))
    || null)?.replace(/[:\-–]+$/, '').trim().slice(0, 120) || null;
  const organization = (text.match(/^(?:company|organi[sz]ation|institution|employer|university|college)\s*[:\-–]\s*(.+)$/im)?.[1]
    || text.match(/\b(?:at|join)\s+([A-Z][A-Za-z&.' ]{2,60}?(?:University|Institute|College|Technologies|Limited|Ltd|Pvt|Inc|Labs?|Solutions|Systems))\b/)?.[1]
    || null)?.trim().slice(0, 120) || null;

  const isAcademic = /\b(assistant professor|associate professor|professor|lecturer|faculty|teaching|ugc|aicte|research scholar|post[- ]?doc|jrf|srf|research associate)\b/i.test(text);

  return {
    title, organization, requiredSkills, preferredSkills, softSkills, minExperienceYears, degreeLevel, degreeText, netRequired,
    certifications, responsibilities: respLines.slice(0, 15), keywords, isAcademic, words: text.split(/\s+/).filter(Boolean).length,
  };
}
