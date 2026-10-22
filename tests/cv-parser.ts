// Checks the rule-based CV extractor and the UGC Table 3A score on a representative academic CV.
import { parseAcademicResume } from '../lib/ai-engine';

const CV = `CURRICULUM VITAE
Dr. Kavya Iyer, Ph.D.
Email: kavya.iyer@example.org | Phone: +91-98401-23456 | Location: Chennai, Tamil Nadu
ORCID: 0000-0002-1823-9941

PROFESSIONAL SUMMARY
Researcher in power electronics and renewable energy integration.

EDUCATION
1. Ph.D. in Electrical Engineering (2016 - 2020)
   Indian Institute of Technology Madras
   Thesis: Grid-forming inverters for weak grids
   Supervisor: Prof. R. Krishnan
2. M.Tech in Power Systems (2014 - 2016)
   National Institute of Technology Tiruchirappalli
   Percentage: 84.5%
3. B.E. in Electrical and Electronics Engineering (2010 - 2014)
   PSG College of Technology, Coimbatore
   Percentage: 78.2%

NATIONAL ELIGIBILITY
• UGC-NET with JRF in Electronic Science (2015)

EXPERIENCE
• Assistant Professor (July 2020 - Present)
  Anna University - Department of Electrical Engineering
• Postdoctoral Fellow (Jan 2020 - Jun 2020)
  IIT Madras

PUBLICATIONS
1. "Virtual inertia control for grid-forming converters", IEEE Transactions on Power Electronics, 2023. DOI: 10.1109/TPEL.2023.123456
2. "Hybrid storage sizing for rural microgrids", Elsevier Applied Energy, 2022.
3. "Harmonic mitigation in solar inverters", Proceedings of IEEE ECCE 2021.
4. "A local journal paper on wind forecasting", Journal of Regional Engineering Studies, 2019.

RESEARCH INTERESTS
Power Electronics, Microgrids, Renewable Energy Integration, Control Systems

AWARDS
• INSPIRE Faculty Fellowship (DST), 2021`;

let failures = 0;
function check(label: string, cond: unknown, actual?: unknown) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${!cond ? ` -> ${JSON.stringify(actual)}` : ''}`);
  if (!cond) failures++;
}

parseAcademicResume(CV).then(r => {
  const p = r.candidateProfile;
  check('name (title kept, degree suffix stripped)', p.name === 'Dr. Kavya Iyer', p.name);
  check('email', p.email === 'kavya.iyer@example.org', p.email);
  check('phone not confused with ORCID', p.phone === '+91-98401-23456', p.phone);
  check('ORCID', p.scholarLinks?.orcid === '0000-0002-1823-9941', p.scholarLinks);
  check('location', p.location?.city === 'Chennai' && p.location?.state === 'Tamil Nadu', p.location);
  check('3 degrees', p.education?.length === 3, p.education);
  check('PG grade', p.education?.find(e => e.degree.startsWith('M.Tech'))?.gradePercentage === '84.5%', p.education);
  check('Ph.D. completed + institute', p.phdStatus?.isCompleted && p.phdStatus.institute === 'Indian Institute of Technology Madras', p.phdStatus);
  check('UGC-NET (JRF)', p.netSletStatus?.examType === 'UGC-NET (JRF)', p.netSletStatus);
  check('2 positions, current = Assistant Professor', p.experience?.length === 2 && p.currentDesignation === 'Assistant Professor', p.experience);
  check('4 publications', p.publications?.length === 4, p.publications?.length);
  check('unknown venue not marked indexed', p.publications?.[3].scopusIndexed === false, p.publications?.[3]);
  check('research interests', p.researchInterests?.length === 4, p.researchInterests);
  check('national award detected', p.awardLevel === 'national', p.awardLevel);
  // 13 (UG 78%) + 25 (PG 84.5%) + 30 (Ph.D.) + 7 (JRF) + 6 (3 indexed papers) + 10 (6+ academic yrs) + 3 (award)
  check('Table 3A score = 94', p.apiScore === 94, p.apiScore);
  check('nothing reported missing', r.missingFields.length === 0, r.missingFields);

  console.log(failures === 0 ? '\nALL CV PARSER TESTS PASSED' : `\n${failures} FAILURE(S)`);
  process.exit(failures ? 1 : 0);
});
