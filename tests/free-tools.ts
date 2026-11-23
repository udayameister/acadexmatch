/* Free tools: UGC Table 3A/3B, Table 2, eligibility, salary helpers, references and Bloom's levels. Run: npx tsx tests/free-tools.ts */
import assert from 'assert';
import { shortlistScore, table2Score, table2Checks, eligibility, EMPTY_TABLE2, SHORTLIST_TABLES } from '../lib/ugc';
import { basicAfter, PAY_LEVELS, nextIncrementDate, daArrears, payRevision, DEFAULT_DA_PERCENT, daOn } from '../lib/salary';
import { extractDoi, format, plain, type CrossrefWork } from '../lib/citation';
import { splitQuestions, tagQuestion, distribution } from '../lib/blooms';

// ---- Table 3A / 3B: maximums add up to 100
for (const t of Object.values(SHORTLIST_TABLES)) assert.equal(t.ug[0][1] + t.pg[0][1] + t.researchCap + t.netCap + t.paperCap + t.expCap + 3, 100, t.name);
const base = { ugPercent: 72, pgPercent: 81, relaxed: false, mphilPercent: 62, phd: true, net: 'jrf' as const, papers: 6, experienceYears: 3.5, award: 'national' as const };
const u = shortlistScore({ institution: 'university', ...base });
assert.deepEqual(u.lines.map(l => l.score), [13, 25, 30, 7, 10, 7, 3]);
assert.equal(u.total, 95);
const c = shortlistScore({ institution: 'college', ...base });
assert.deepEqual(c.lines.map(l => l.score), [19, 25, 25, 10, 6, 7, 3]);
assert.equal(c.total, 95);
assert.equal(shortlistScore({ institution: 'university', ...base, pgPercent: 52 }).lines[1].score, 0, '52% PG scores nothing');
assert.equal(shortlistScore({ institution: 'university', ...base, pgPercent: 52, relaxed: true }).lines[1].score, 20, 'relaxed band from 50%');
assert.equal(shortlistScore({ institution: 'college', ...base, ugPercent: 45, mphilPercent: null, phd: false, net: 'set', papers: 0, experienceYears: 0, award: 'none' }).total, 10 + 25 + 5);
assert.equal(shortlistScore({ institution: 'university', ...base, experienceYears: 0.5 }).lines[5].score, 1, 'part-years proportionate');

// ---- Table 2
const r = table2Score({ ...EMPTY_TABLE2, papers: [{ impact: '1to2', authorship: 'main', count: 3 }], guidance: { ...EMPTY_TABLE2.guidance, phdAwarded: 1 }, talks: { ...EMPTY_TABLE2.talks, national: 10 } });
assert.equal(r.categories[0].score, 48.3, '(8 + 15) × 70% × 3');
assert.equal(r.categories[3].score, 10);
assert.equal(r.cappedPart.raw, 30);
assert.equal(r.categories[5].score, 24.99, 'talks capped so they are at most 30% of the total');
assert(Math.abs(r.categories[5].score / r.total - 0.3) < 0.001);
assert.equal(r.categoriesUsed, 3);
assert.equal(table2Score({ ...EMPTY_TABLE2, discipline: 'humanities', papers: [{ impact: 'none', authorship: 'sole', count: 1 }] }).total, 15, '10 + 5');
assert.equal(table2Score({ ...EMPTY_TABLE2, addImpactToBase: false, papers: [{ impact: 'gt10', authorship: 'joint', count: 1 }] }).total, 9, 'max(8, 30) × 30%');
assert.equal(table2Score({ ...EMPTY_TABLE2, projects: { ...EMPTY_TABLE2.projects, completedAbove10L: 2, jointShare: true } }).total, 10);
const chk = table2Checks(table2Score({ ...EMPTY_TABLE2, papers: [{ impact: 'lt1', authorship: 'sole', count: 7 }] }), 'cas-assoc');
assert.deepEqual(chk.map(x => x.ok), [true, true, false], '126 ≥ 70, 7 papers, but only 1 category');

// ---- eligibility
const e0 = { pgPercent: 56, relaxed: false, pgBefore1991: false, net: 'net' as const, phd: false, phdUgcCompliant: false, experienceYears: 0, papers: 0, researchScore: null, phdGuided: false };
assert.equal(eligibility(e0)[0].eligible, true);
assert.equal(eligibility({ ...e0, pgPercent: 54 })[0].eligible, false);
assert.equal(eligibility({ ...e0, pgPercent: 54, relaxed: true })[0].eligible, true);
assert.equal(eligibility({ ...e0, net: 'none' })[0].eligible, false, 'NET minimum since July 2023');
assert.equal(eligibility({ ...e0, net: 'none', phd: true, phdUgcCompliant: true })[0].eligible, true, 'Ph.D. under 2009/2016 regulations exempts');
assert.equal(eligibility({ ...e0, phd: true, experienceYears: 8, papers: 7, researchScore: 75 })[1].eligible, true);
assert.equal(eligibility({ ...e0, phd: true, experienceYears: 8, papers: 7, researchScore: 74 })[1].eligible, false);
assert.equal(eligibility({ ...e0, phd: true, experienceYears: 10, papers: 10, researchScore: 120, phdGuided: true })[2].eligible, true);

// ---- salary
const l10 = PAY_LEVELS.find(l => l.key === '10')!;
assert.deepEqual([1, 2, 3, 4, 5].map(y => basicAfter(l10, y)), [59400, 61200, 63000, 64900, 66800], 'official Level 10 cells');
assert.equal(basicAfter(PAY_LEVELS.find(l => l.key === '13A')!, 1), 135300);
assert.equal(DEFAULT_DA_PERCENT, 63);
assert.equal(daOn('2026-08-15'), 63);
assert.equal(daOn('2026-03-01'), 60);
assert.equal(nextIncrementDate('2026-03-15', '2026-11-23'), '2027-01-01');
assert.equal(nextIncrementDate('2026-07-01', '2026-11-23'), '2027-01-01', '1 July falls in the 2 Jan – 1 Jul window');
assert.equal(nextIncrementDate('2026-07-02', '2026-11-23'), '2027-07-01');
assert.equal(nextIncrementDate('2026-01-01', '2026-03-01'), '2026-07-01');
assert.equal(nextIncrementDate('2019-08-10', '2026-11-23'), '2027-07-01', 'same date every year after');
const a = daArrears({ basic: 57700, oldPct: 60, newPct: 63, from: '2026-07', to: '2026-10', ta: 7200, nps: true });
assert.deepEqual([a.months, a.perMonthDa, a.perMonthTa, a.gross, a.nps], [4, 1731, 216, 7788, 692]);
assert.equal(payRevision(57700, 2.57, 24, 7200).newBasic, 148300);

// ---- references
assert.equal(extractDoi('https://doi.org/10.1109/ACCESS.2024.3381234.'), '10.1109/ACCESS.2024.3381234');
assert.equal(extractDoi('doi: 10.1016/j.neuroimage.2023.120123'), '10.1016/j.neuroimage.2023.120123');
assert.equal(extractDoi('no doi here'), null);
const w: CrossrefWork = {
  DOI: '10.1109/ACCESS.2026.1234567', type: 'journal-article', title: ['Graph neural networks for brain connectome classification'],
  'container-title': ['IEEE Access'], 'short-container-title': ['IEEE Access'],
  author: [{ given: 'Udayakumar', family: 'Palanivelu' }, { given: 'R.', family: 'Subhashini' }, { given: 'Anna-Maria', family: 'Rao' }],
  issued: { 'date-parts': [[2026, 3]] }, volume: '14', issue: '2', page: '1234-1245',
};
assert.equal(plain(format(w, 'apa')), 'Palanivelu, U., Subhashini, R., & Rao, A.-M. (2026). Graph neural networks for brain connectome classification. IEEE Access, 14(2), 1234–1245. https://doi.org/10.1109/ACCESS.2026.1234567');
assert(format(w, 'apa').some(x => x.italic && x.text === 'IEEE Access'));
assert.equal(plain(format(w, 'ieee')), 'U. Palanivelu, R. Subhashini, and A.-M. Rao, “Graph neural networks for brain connectome classification,” IEEE Access, vol. 14, no. 2, pp. 1234–1245, Mar. 2026, doi: 10.1109/ACCESS.2026.1234567.');
assert.equal(plain(format(w, 'vancouver')), 'Palanivelu U, Subhashini R, Rao AM. Graph neural networks for brain connectome classification. IEEE Access. 2026;14(2):1234-1245. doi:10.1109/ACCESS.2026.1234567');
assert.equal(plain(format(w, 'harvard')), 'Palanivelu, U., Subhashini, R. and Rao, A.-M. (2026) ‘Graph neural networks for brain connectome classification’, IEEE Access, 14(2), pp. 1234–1245. Available at: https://doi.org/10.1109/ACCESS.2026.1234567.');
assert.match(plain(format(w, 'bibtex')), /^@article\{Palanivelu2026graph,\n  author = \{Palanivelu, Udayakumar and Subhashini, R\. and Rao, Anna-Maria\}/);
const many = { ...w, author: Array.from({ length: 8 }, (_, i) => ({ given: 'A', family: `Author${i + 1}` })) };
assert.match(plain(format(many, 'ieee')), /^A\. Author1 et al\., /);
assert.match(plain(format(many, 'vancouver')), /Author6 A, et al\. /);

// ---- Bloom's
const qs = splitQuestions('1. Define an operating system.\n2. Explain paging\nwith an example. (5 marks)\n3. Calculate the average waiting time [CO2]\n4. Compare and contrast TCP and UDP.\n5. Justify the use of semaphores.\n6. Design a scheduler for a real-time system.\n7. Is it raining?');
assert.equal(qs.length, 7);
assert.equal(qs[1], '2. Explain paging with an example. (5 marks)');
const lv = qs.map(q => tagQuestion(q).level);
assert.deepEqual(lv, [1, 2, 3, 4, 5, 6, null]);
assert.equal(tagQuestion('Explain the concept and justify your answer').level, 5, 'highest verb wins');
assert.equal(tagQuestion('Evaluate the integral of x^2 from 0 to 1').level, 3, '“evaluate the integral” is applying');
assert.equal(tagQuestion('Which tools are used in testing?').verb, null, '“used” is not “use”; nothing detected');
assert.deepEqual(distribution(lv.map(level => ({ level }))).map(d => d.count), [1, 1, 1, 1, 1, 1]);

console.log('free-tools: all checks passed');
