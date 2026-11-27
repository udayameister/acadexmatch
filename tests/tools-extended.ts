/* CO–PO attainment, Excel I/O, ORCID research profile, funding calendar and NET / SET hub. Run: npx tsx tests/tools-extended.ts */
import assert from 'assert';
import { readCsv, readXlsx, writeXlsx } from '../lib/xlsxio';
import { DEFAULT_SETTINGS, PRESETS, computeCourse, cosOf, levelFor, normaliseCos, parseMarksSheet, programmeAttainment, reportSheets, templateRows, type SavedCourse } from '../lib/copo';
import { parseOrcid } from '../lib/orcid';
import { SEED, callStatus, cleanCall, cleanNotice, ics, noticeWhen, sortCalls, type FundingCall } from '../lib/toolsData';

(async () => {
  // ---- Excel round trip (stored ZIP written by us; numbers, text, blanks)
  const rows = templateRows();
  const back = await readXlsx(writeXlsx([{ name: 'Marks', rows }, { name: 'Other', rows: [['a', 1]] }]));
  assert.deepEqual(back.map(s => s.name), ['Marks', 'Other']);
  assert.equal(back[0].rows[1][2], 10);
  assert.equal(back[0].rows[5][4], 'AB');
  assert.equal(back[0].rows[1][1], null);

  // ---- Excel files written by Excel use DEFLATE and shared strings: build one by hand with CompressionStream.
  const deflate = async (s: string) => new Uint8Array(await new Response(new Blob([s]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());
  const files: [string, string][] = [
    ['xl/workbook.xml', '<workbook xmlns:r="r"><sheets><sheet name="IA marks" sheetId="1" r:id="rId1"/></sheets></workbook>'],
    ['xl/_rels/workbook.xml.rels', '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>'],
    ['xl/sharedStrings.xml', '<sst><si><t>Reg No</t></si><si><r><t>Q1 (CO1)</t></r><r><t xml:space="preserve"> [10]</t></r></si><si><t>21MITS01</t></si><si><t>Ab</t></si></sst>'],
    ['xl/worksheets/sheet1.xml', '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row><row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2"><f>4+3</f><v>7</v></c></row><row r="3"><c r="A3" t="inlineStr"><is><t>21MITS02</t></is></c><c r="B3" t="s"><v>3</v></c></row></sheetData></worksheet>'],
  ];
  const parts: Uint8Array[] = []; const central: Uint8Array[] = []; let off = 0;
  const le = (n: number, b: number) => Uint8Array.from({ length: b }, (_, i) => (n >>> (8 * i)) & 255);
  const cat = (...p: Uint8Array[]) => { const o = new Uint8Array(p.reduce((s, x) => s + x.length, 0)); let k = 0; for (const x of p) { o.set(x, k); k += x.length; } return o; };
  for (const [name, text] of files) {
    const nm = new TextEncoder().encode(name), data = await deflate(text);
    const local = cat(le(0x04034b50, 4), le(20, 2), le(0, 2), le(8, 2), le(0, 8), le(data.length, 4), le(text.length, 4), le(nm.length, 2), le(0, 2));
    parts.push(local, nm, data);
    central.push(cat(le(0x02014b50, 4), le(20, 2), le(20, 2), le(0, 2), le(8, 2), le(0, 8), le(data.length, 4), le(text.length, 4), le(nm.length, 2), le(0, 2), le(0, 2), le(0, 4), le(0, 4), le(off, 4)), nm);
    off += local.length + nm.length + data.length;
  }
  const cd = cat(...central);
  const xl = await readXlsx(cat(...parts, cd, le(0x06054b50, 4), le(0, 4), le(files.length, 2), le(files.length, 2), le(cd.length, 4), le(off, 4), le(0, 2)));
  assert.equal(xl[0].name, 'IA marks');
  assert.deepEqual(xl[0].rows, [['Reg No', 'Q1 (CO1) [10]'], ['21MITS01', 7], ['21MITS02', 'Ab']]);
  const fromLabels = parseMarksSheet(xl[0].rows);
  assert.equal(fromLabels.columns.length, 1);
  assert.deepEqual(fromLabels.columns[0].cos, ['CO1'], 'CO taken from the question label');
  assert.equal(fromLabels.columns[0].max, 10, 'maximum taken from the label');
  assert.equal(fromLabels.students[1].marks[0], null, '"Ab" = absent');

  // ---- CSV
  assert.deepEqual(readCsv('﻿Roll,"Name, full",Q1\r\n1,"A ""B""",5\n'), [['Roll', 'Name, full', 'Q1'], [1, 'A "B"', 5]]);
  assert.deepEqual(readCsv('Roll;Q1\nx;3'), [['Roll', 'Q1'], ['x', 3]]);

  // ---- CO lists
  assert.deepEqual(normaliseCos('CO1, co3'), ['CO1', 'CO3']);
  assert.deepEqual(normaliseCos('1-3'), ['CO1', 'CO2', 'CO3']);
  assert.deepEqual(normaliseCos('All'), ['ALL']);
  assert.deepEqual(normaliseCos('CO2 & CO10'), ['CO2', 'CO10']);
  assert.deepEqual(cosOf([{ index: 0, label: '', max: 1, cos: ['CO10', 'CO2'], component: 'CIE' }]), ['CO2', 'CO10']);
  assert.equal(levelFor(70, [50, 60, 70]), 3); assert.equal(levelFor(69.9, [50, 60, 70]), 2); assert.equal(levelFor(49, [50, 60, 70]), 0);

  // ---- Template → attainment (values worked out by hand)
  const p = parseMarksSheet(back[0].rows);
  assert.deepEqual(p.found, { max: true, co: true, component: true });
  assert.equal(p.students.length, 3);
  assert.deepEqual(p.warnings, []);
  const cos = cosOf(p.columns);
  assert.deepEqual(cos, ['CO1', 'CO2', 'CO3', 'CO4', 'CO5']);
  const mapping = { CO1: { PO1: 3, PO2: 2 }, CO2: { PO1: 2, PO3: 3 }, CO3: { PO2: 1 }, CO5: { PO1: 1, PSO1: 2 } };
  const outcomes = [...PRESETS.eng11.outcomes, { code: 'PSO1', title: '' }];
  const input = { columns: p.columns, students: p.students, cos, indirect: { CO1: 2.5 }, mapping, outcomes, settings: DEFAULT_SETTINGS };
  const res = computeCourse(input);
  const co1 = res.cos[0];
  assert.deepEqual([co1.cie!.attained, co1.cie!.students, co1.cie!.level], [3, 3, 3], 'CIE: 13/15, 9/15 (= 60%), 14/15');
  assert.deepEqual([co1.see!.attained, co1.see!.pct, co1.see!.level], [2, 66.67, 2], 'SEE: 10/14, 7/14, 13/14');
  assert.equal(co1.direct, 2.3, '3 × 0.3 + 2 × 0.7');
  assert.equal(co1.final, 2.34, '2.3 × 0.8 + 2.5 × 0.2');
  const co2 = res.cos[1];
  assert.equal(co2.cie!.students, 3, 'student 2 absent for Q3 still counted on the other CO2 questions');
  assert.equal(res.cos[4].cie, null); assert.equal(res.cos[4].direct, res.cos[4].see!.level, 'SEE only → SEE level in full');
  assert.equal(res.po.PO1, 2.17, '(3×2.34 + 2×2 + 1×2) / 6');
  assert.equal(res.po.PO4, null);
  assert.equal(res.articulation.PO1, 2);
  assert.equal(res.po.PSO1, res.cos[4].final);
  assert.equal(computeCourse({ ...input, settings: { ...DEFAULT_SETTINGS, target: 2.5 } }).cos[0].met, false);
  const sheets = reportSheets({ institution: 'X', department: '', programme: '', code: 'CS301', name: 'DSE', semester: 'III', year: '2025-26', faculty: '' }, input, res, { CO1: 'Apply stacks' });
  assert.deepEqual(sheets.map(s => s.name), ['Summary', 'CO attainment', 'CO-PO matrix', 'PO attainment', 'Students CO %']);
  assert.equal((await readXlsx(writeXlsx(sheets))).length, 5, 'report opens again');
  assert.equal(sheets[4].rows[1][2], 86.67, 'student 1, CO1 CIE %');

  // ---- Programme level
  const sc = (po: Record<string, number | null>): SavedCourse => ({ id: Math.random().toString(), code: '', name: '', semester: '', year: '', outcomes: [{ code: 'PO1', title: '' }, { code: 'PO2', title: '' }], po, cos: [], savedAt: '' });
  const prog = programmeAttainment([sc({ PO1: 2, PO2: null }), sc({ PO1: 2.5, PO2: 1.5 })]);
  assert.deepEqual(prog.avg, { PO1: 2.25, PO2: 1.5 });
  assert.deepEqual(prog.count, { PO1: 2, PO2: 1 });

  // ---- ORCID iD check
  assert.equal(parseOrcid('https://orcid.org/0000-0002-1825-0097'), '0000-0002-1825-0097');
  assert.equal(parseOrcid('000000021694233X'), '0000-0002-1694-233X');
  assert.equal(parseOrcid('0000-0002-1825-0098'), null, 'bad checksum');

  // ---- Research profile with ORCID and OpenAlex mocked
  process.env.ORCID_API_BASE = 'https://orcid.test/v3.0';
  process.env.OPENALEX_API_BASE = 'https://openalex.test';
  const work = (pc: number, title: string, doi: string | null, y: number) => ({ 'put-code': pc, title: { title: { value: title } }, 'journal-title': { value: 'J' }, 'publication-date': { year: { value: String(y) } }, type: 'journal-article', 'external-ids': { 'external-id': doi ? [{ 'external-id-type': 'doi', 'external-id-value': doi }] : [] } });
  const W = [work(1, 'Paper A', '10.1000/A', 2021), work(2, 'Paper B', '10.1000/b', 2022), work(3, 'Paper C', '10.1000/c', 2023), work(4, 'Paper A again', '10.1000/a', 2021), work(5, 'No DOI', null, 2024)];
  const seen: string[] = [];
  globalThis.fetch = (async (u: string) => {
    const url = String(u); seen.push(url);
    const ok = (j: unknown) => new Response(JSON.stringify(j), { status: 200 });
    if (url.endsWith('/works')) return ok({ group: W.map(w => ({ 'work-summary': [w] })) });
    if (url.includes('/works/')) return ok({ bulk: W.map(w => ({ work: w })) });
    if (url.endsWith('/person')) return ok({ name: { 'given-names': { value: 'Uma' }, 'family-name': { value: 'Rao' } }, biography: { content: 'GNNs' }, keywords: { keyword: [{ content: 'graphs, brains' }] } });
    if (url.endsWith('/employments')) return ok({ 'affiliation-group': [{ summaries: [{ 'employment-summary': { organization: { name: 'MITS' }, 'role-title': 'Assistant Professor', 'start-date': { year: { value: '2019' } }, 'end-date': null } }] }] });
    if (url.startsWith('https://openalex.test/works')) return ok({ results: [
      { doi: 'https://doi.org/10.1000/a', cited_by_count: 12, counts_by_year: [{ year: 2024, cited_by_count: 5 }, { year: 2025, cited_by_count: 7 }], open_access: { is_oa: true } },
      { doi: 'https://doi.org/10.1000/b', cited_by_count: 3, counts_by_year: [{ year: 2025, cited_by_count: 3 }] },
      { doi: 'https://doi.org/10.1000/c', cited_by_count: 1, counts_by_year: [] },
    ] });
    return new Response('', { status: 404 });
  }) as typeof fetch;
  const { researchProfile, hIndex } = await import('../lib/server/researchProfile');
  assert.equal(hIndex([12, 3, 1, 0]), 2); assert.equal(hIndex([]), 0); assert.equal(hIndex([5, 5, 5, 5, 5, 5]), 5);
  const prof = (await researchProfile('0000-0002-1825-0097'))!;
  assert.equal(prof.name, 'Uma Rao');
  assert.deepEqual(prof.keywords, ['graphs', 'brains']);
  assert.equal(prof.affiliations[0].org, 'MITS'); assert.equal(prof.affiliations[0].current, true);
  assert.equal(prof.metrics.works, 4, 'duplicate DOI (different case) counted once');
  assert.deepEqual([prof.metrics.citations, prof.metrics.hIndex, prof.metrics.i10, prof.metrics.matched, prof.metrics.openAccess], [16, 2, 1, 3, 1]);
  assert.equal(prof.works[0].title, 'Paper A'); assert.equal(prof.works.at(-1)!.citations, null);
  assert.deepEqual(prof.citesByYear, [{ year: 2024, n: 5 }, { year: 2025, n: 10 }]);
  const calls = seen.length;
  await researchProfile('0000-0002-1825-0097');
  assert.equal(seen.length, calls, 'served from the cache');

  // ---- Funding calendar
  const today = '2026-11-27';
  const byId = (id: string) => SEED.calls.find(c => c.id === id)!;
  assert.equal(callStatus(byId('anrf-pmecrg-2026'), today), 'open');
  assert.equal(callStatus(byId('icssr-major-minor-2026'), today), 'closed');
  assert.equal(callStatus(byId('anrf-ramanujan'), today), 'rolling');
  assert.equal(callStatus({ ...byId('anrf-pmecrg-2026'), opens: '2026-12-01' }, today), 'upcoming');
  const order = sortCalls(SEED.calls, today).map(c => c.id);
  assert.deepEqual(order.slice(0, 2).sort(), ['icmr-first-in-world-2026', 'icssr-senior-fellowship-2026'], 'nearest open deadlines first');
  assert.equal(order.at(-1), 'icssr-nstc-taiwan-2026', 'oldest closed last');
  for (const c of SEED.calls) { assert.deepEqual(cleanCall(c), c, `seed call ${c.id} is valid`); assert(/^https:\/\//.test(c.link)); }
  assert.throws(() => cleanCall({ funder: 'X', title: 'Y', link: 'javascript:alert(1)', deadline: '2027-01-01' }), /http/);
  assert.throws(() => cleanCall({ funder: 'X', title: 'Y', link: 'https://x.in' }), /deadline/);
  assert.deepEqual(cleanCall({ funder: 'X', title: 'Y', link: 'https://x.in', rolling: true } as Partial<FundingCall>).disciplines, ['all']);

  // ---- NET / SET hub
  for (const n of SEED.notices) assert.deepEqual(cleanNotice(n, SEED.exams), n, `seed notice ${n.id} is valid`);
  assert.equal(noticeWhen(SEED.notices.find(n => n.id === 'ugc-net-dec26-exam')!, today), 'upcoming');
  assert.equal(noticeWhen(SEED.notices.find(n => n.id === 'ugc-net-dec26-exam')!, '2026-12-16'), 'ongoing');
  assert.equal(noticeWhen(SEED.notices.find(n => n.id === 'kset-2026-exam')!, today), 'past');
  assert.throws(() => cleanNotice({ examId: 'nope', title: 'x', date: '2026-01-01', link: 'https://a.in' }, SEED.exams), /exam/);
  assert.throws(() => cleanNotice({ examId: 'ugc-net', title: 'x', date: '2026-02-01', endDate: '2026-01-01', link: 'https://a.in' }, SEED.exams), /before/);
  const cal = ics([{ uid: 'u1', title: 'UGC-NET; exam, Dec', date: '2026-12-14', endDate: '2026-12-21', url: 'https://ugcnet.nta.nic.in' }]);
  assert(cal.includes('DTSTART;VALUE=DATE:20261214') && cal.includes('DTEND;VALUE=DATE:20261222'), 'all-day, end exclusive');
  assert(cal.includes('SUMMARY:UGC-NET\\; exam\\, Dec'));
  assert(cal.split('\r\n').every(l => l.length <= 75));

  console.log('tools-extended: all checks passed');
})().catch(e => { console.error(e); process.exit(1); });
