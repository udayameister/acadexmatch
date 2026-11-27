/** The free tools, best first. `live: false` = coming soon (listed so people know it is on the way). */
export interface FreeTool { slug: string; href: string; title: string; short: string; who: string; icon: string; live: boolean }

export const FREE_TOOLS: FreeTool[] = [
  { slug: 'ugc-shortlisting-score', href: '/tools/ugc-shortlisting-score', title: 'UGC shortlisting score calculator', short: 'Your academic score for Assistant Professor shortlisting — Table 3A (universities) and 3B (colleges).', who: 'NET / Ph.D. job seekers', icon: 'ListChecks', live: true },
  { slug: 'cas-research-score', href: '/tools/cas-research-score', title: 'CAS research score calculator', short: 'UGC 2018 Table 2 research score for promotion to Associate Professor and Professor.', who: 'Faculty seeking promotion', icon: 'TrendingUp', live: true },
  { slug: 'co-po-attainment', href: '/tools/co-po-attainment', title: 'CO–PO attainment calculator', short: 'Upload marks in Excel → CO attainment levels, CO–PO mapping and a report for NBA / NAAC.', who: 'Engineering, pharmacy and management faculty', icon: 'Grid3x3', live: true },
  { slug: 'research-profile', href: '/tools/research-profile', title: 'Research profile from ORCID', short: 'Enter your ORCID → publications, citations and h-index in a shareable card.', who: 'Researchers and Ph.D. scholars', icon: 'BookOpenCheck', live: true },
  { slug: 'reference-formatter', href: '/tools/reference-formatter', title: 'Reference formatter', short: 'Paste a DOI → APA, IEEE, Vancouver and Harvard references, ready to copy.', who: 'Ph.D. scholars and authors', icon: 'Quote', live: true },
  { slug: 'salary', href: '/salary-calculator', title: 'Salary, DA arrears and pay commission', short: '7th CPC pay, DA arrears, next increment date and a pay commission estimator.', who: 'All faculty on government scales', icon: 'IndianRupee', live: true },
  { slug: 'eligibility-checker', href: '/tools/eligibility-checker', title: 'Eligibility checker', short: 'Am I eligible for Assistant, Associate or Professor under the UGC rules? See matching jobs.', who: 'Job seekers', icon: 'BadgeCheck', live: true },
  { slug: 'blooms-taxonomy-checker', href: '/tools/blooms-taxonomy-checker', title: "Bloom's taxonomy question checker", short: "Paste your questions → each one tagged with its Bloom's level, with the paper's balance.", who: 'Teachers setting question papers', icon: 'Layers', live: true },
  { slug: 'funding-calendar', href: '/tools/funding-calendar', title: 'Research funding and fellowship calendar', short: 'ANRF, DST, ICSSR, UGC and other calls with their deadlines.', who: 'Researchers and faculty', icon: 'CalendarRange', live: true },
  { slug: 'net-set-hub', href: '/tools/net-set-hub', title: 'NET / SET exam hub', short: 'Exam dates, syllabus links and result notices for UGC-NET, CSIR-NET and state SETs.', who: 'NET aspirants', icon: 'GraduationCap', live: true },
];
