/**
 * Interview preparation content for faculty selection in Indian higher education.
 * General guidance only; each institution's notification and selection committee decide the actual process.
 */

export type PrepTrack = 'assistant' | 'associate' | 'professor' | 'research' | 'leadership';

export const PREP_TRACKS: { key: PrepTrack; label: string; blurb: string }[] = [
  { key: 'assistant', label: 'Assistant Professor', blurb: 'Teaching ability, subject depth, a clear research plan and fit with the department.' },
  { key: 'associate', label: 'Associate Professor', blurb: 'An established research record, supervision, funded projects and growing academic leadership.' },
  { key: 'professor', label: 'Professor', blurb: 'Sustained research impact, team building, doctoral supervision and vision for the discipline.' },
  { key: 'research', label: 'Postdoc / Research', blurb: 'Technical depth, a fundable research proposal and how you fit the host group.' },
  { key: 'leadership', label: 'Dean / Director / HoD', blurb: 'Academic administration, accreditation, people management and institutional strategy.' },
];

export interface ChecklistGroup { title: string; items: string[]; tracks?: PrepTrack[] }

export const CHECKLIST: ChecklistGroup[] = [
  {
    title: 'Documents to carry',
    items: [
      'Printed application form and the acknowledgement or reference number',
      'Originals and self-attested copies of degree certificates and mark sheets (UG, PG, Ph.D.)',
      'NET / SLET / SET / JRF certificate, or Ph.D. award proof if you are exempt',
      'Experience certificates or appointment and relieving letters for every position claimed',
      'Copies of your best publications (first pages), with indexing proof (UGC-CARE, Scopus, SCI)',
      'API / Table 3A score sheet with supporting proofs, in the same order as the form',
      'Caste / category, EWS or PwD certificate where applicable, and a No Objection Certificate if you are currently employed',
      'Government photo ID and passport-size photographs',
    ],
  },
  {
    title: 'Teaching demonstration',
    items: [
      'Confirm the topic, duration and audience (UG / PG) with the institution if they have not told you',
      'Prepare a 10–15 minute lesson with clear learning outcomes',
      'Plan one worked example or short activity, and one quick check for understanding',
      'Practise on a whiteboard without slides as well, in case there is no projector',
      'Time yourself twice; end with a summary and a real-world link',
    ],
  },
  {
    title: 'Research presentation',
    items: [
      'Prepare a 10–15 minute talk: problem, your contribution, key results, future plan',
      'Have a one-slide summary of publications, citations, projects and patents',
      'Prepare a 3–5 year research plan tied to the department’s focus and funding agencies (ANRF/SERB, DST, DBT, ICSSR, AICTE)',
      'Be ready to explain one paper in depth, including its limitations',
    ],
  },
  {
    title: 'Know the institution',
    items: [
      'Read the department’s programmes, labs, recent publications and faculty profiles',
      'Note the institution’s NAAC / NBA / NIRF standing and current priorities',
      'Identify two or three courses you could teach and one you could introduce',
      'Prepare two questions to ask the committee',
    ],
  },
  {
    title: 'Leadership evidence',
    tracks: ['associate', 'professor', 'leadership'],
    items: [
      'Ph.D. students supervised and awarded, with titles and years',
      'Funded projects as PI / Co-PI with agency and amount',
      'Committees, accreditation work (NAAC SSR, NBA SAR) and administrative roles held',
      'Examples of mentoring junior colleagues and resolving conflict',
    ],
  },
  {
    title: 'On the day',
    items: [
      'Arrive early or test the video link, camera and microphone 30 minutes before',
      'Keep a pen drive and a PDF copy of your slides, plus one printed copy',
      'Dress formally; keep answers focused (about 1–2 minutes each)',
      'Thank the committee and note the names of panel members afterwards',
    ],
  },
];

export type QuestionCategory = 'Teaching' | 'Research' | 'Subject' | 'Institution' | 'Leadership' | 'Personal';

export interface PrepQuestion { q: string; tip: string; category: QuestionCategory; tracks?: PrepTrack[] }

export const QUESTIONS: PrepQuestion[] = [
  // Teaching
  { category: 'Teaching', q: 'How would you teach a difficult concept in your subject to first-year students?', tip: 'Name a specific concept, then walk through an analogy, a worked example and how you would check that students understood it.' },
  { category: 'Teaching', q: 'How do you design course outcomes and map them to programme outcomes?', tip: 'Mention Bloom’s taxonomy, CO–PO mapping and how assessment measures attainment, as NBA/NAAC expect.' },
  { category: 'Teaching', q: 'How do you handle a class with very mixed abilities?', tip: 'Give concrete tactics: tiered problems, peer learning, extra sessions for slow learners and challenges for advanced students.' },
  { category: 'Teaching', q: 'What ICT tools or active-learning methods do you use?', tip: 'Be specific (flipped classroom, LMS, simulations, NPTEL/SWAYAM content) and give a result you saw.' },
  { category: 'Teaching', q: 'How do you evaluate students fairly beyond the final examination?', tip: 'Discuss continuous assessment, rubrics, projects and timely feedback.' },
  { category: 'Teaching', q: 'Which new elective would you introduce, and why?', tip: 'Tie it to industry or research trends and the department’s strengths; sketch three or four units.' },
  // Research
  { category: 'Research', q: 'Summarise your Ph.D. work in two minutes for a non-specialist.', tip: 'Problem, why it matters, what you did differently, the main result. Practise this until it is natural.' },
  { category: 'Research', q: 'What is your best publication and what is its weakness?', tip: 'Show depth and honesty; committees value candidates who know the limits of their work.' },
  { category: 'Research', q: 'What will you work on in the next five years here?', tip: 'Link your plan to the department’s labs and to funding schemes you could apply to.' },
  { category: 'Research', q: 'Which funding agencies would you approach, and with what proposal?', tip: 'Name realistic schemes (for example ANRF/SERB early-career grants, DST, AICTE research schemes) and a one-line idea.' },
  { category: 'Research', q: 'How do you choose journals and avoid predatory publishers?', tip: 'Mention UGC-CARE, Scopus/Web of Science indexing and checking the publisher’s practices.' },
  { category: 'Research', q: 'How would you involve undergraduate students in research?', tip: 'Projects, internships, student papers and competitions, with an example if you have one.' },
  { category: 'Research', q: 'How many Ph.D. scholars have you guided and what were their topics?', tip: 'Give numbers and outcomes; mention scholars currently enrolled.', tracks: ['associate', 'professor', 'leadership'] },
  // Subject
  { category: 'Subject', q: 'Explain a fundamental concept of your discipline from first principles.', tip: 'Expect follow-up questions that go deeper; it is fine to say what you would check if unsure.' },
  { category: 'Subject', q: 'What are the most important recent developments in your field?', tip: 'Pick two, explain them briefly and say how you would bring them into teaching.' },
  { category: 'Subject', q: 'Solve or outline a standard problem from a core course you could teach.', tip: 'Think aloud, structure the solution and state assumptions.' },
  // Institution
  { category: 'Institution', q: 'Why do you want to join this institution?', tip: 'Refer to specific programmes, labs or people; avoid generic answers.' },
  { category: 'Institution', q: 'How can you contribute to NAAC / NBA accreditation?', tip: 'Mention documentation, outcome-based education, feedback analysis and committee work.' },
  { category: 'Institution', q: 'How do you understand the National Education Policy 2020 for higher education?', tip: 'Talk about multidisciplinary learning, credit flexibility, research focus and how they affect your teaching.' },
  { category: 'Institution', q: 'What would you do in your first year here beyond teaching?', tip: 'Propose one concrete activity: a student club, a workshop, an industry tie-up or a grant proposal.' },
  // Leadership
  { category: 'Leadership', q: 'How would you build a research group in this department?', tip: 'Recruitment, mentoring, shared facilities, grant pipeline and collaboration.', tracks: ['associate', 'professor', 'leadership', 'research'] },
  { category: 'Leadership', q: 'Describe a conflict in a team you led and how you resolved it.', tip: 'Use situation, action and result; show fairness and follow-through.', tracks: ['associate', 'professor', 'leadership'] },
  { category: 'Leadership', q: 'How would you improve the department’s NIRF parameters?', tip: 'Research output, graduation outcomes, outreach and perception; give two actionable steps.', tracks: ['professor', 'leadership'] },
  { category: 'Leadership', q: 'How do you manage budgets and procurement for a lab or school?', tip: 'Planning, GFR / institutional procedures, transparency and utilisation certificates.', tracks: ['professor', 'leadership'] },
  // Personal
  { category: 'Personal', q: 'Tell us about yourself.', tip: 'One minute: current role, research focus, teaching strengths and why this position.' },
  { category: 'Personal', q: 'What are your strengths and an area you are improving?', tip: 'Pick a genuine area for growth and what you are doing about it.' },
  { category: 'Personal', q: 'Do you have any questions for us?', tip: 'Ask about research support, teaching load, start-up grants or mentoring; never say “no questions”.' },
];

export const DEMO_TEMPLATE = `Topic:
Audience: (UG / PG, semester)
Duration: 10–15 minutes

1. Hook (1 min) — a question, puzzle or real-world example
2. Learning outcomes (1 min) — "By the end, you will be able to …" (2–3 outcomes, Bloom's verbs)
3. Core explanation (5–7 min) — build from what students already know; one diagram
4. Worked example or short activity (3–4 min)
5. Check for understanding (1–2 min) — one quick question to the class
6. Summary and link to the next topic / real-world use (1 min)

Board plan:
Possible questions from the panel:
`;

export function questionsFor(track: PrepTrack): PrepQuestion[] {
  return QUESTIONS.filter(q => !q.tracks || q.tracks.includes(track));
}

export function checklistFor(track: PrepTrack): ChecklistGroup[] {
  return CHECKLIST.filter(g => !g.tracks || g.tracks.includes(track));
}

/** Picks a sensible starting track from a designation text. */
export function trackFromDesignation(d: string | null | undefined): PrepTrack {
  const t = (d || '').toLowerCase();
  if (/dean|director|head|hod|principal|registrar/.test(t)) return 'leadership';
  if (/postdoc|research|fellow|scientist/.test(t)) return 'research';
  if (/associate/.test(t)) return 'associate';
  if (/professor/.test(t) && !/assistant/.test(t)) return 'professor';
  return 'assistant';
}
