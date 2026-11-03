/*
 * AcadeXMatch skills knowledge base: canonical skill names with the other ways they are written, grouped into
 * categories. Used to find skills in resumes and job descriptions and to compare them ("ML" = "Machine
 * Learning"). Each line: "Canonical | alias | alias". Matching is case-insensitive on word boundaries.
 */

export type SkillCategory =
  | 'Programming languages' | 'Web and mobile' | 'Data and databases' | 'AI and machine learning' | 'Cloud and DevOps'
  | 'Software engineering' | 'Electronics and electrical' | 'Mechanical and civil' | 'Life sciences and health'
  | 'Business and management' | 'Teaching and academics' | 'Research' | 'Tools and software' | 'Soft skills'
  | 'Languages';

const RAW: Record<SkillCategory, string[]> = {
  'Programming languages': [
    'Python', 'Java', 'C++|cpp', 'C#|c sharp|csharp', 'C language|c programming|programming in c', 'JavaScript|javascript|js|ecmascript', 'TypeScript',
    'Go|golang', 'Rust', 'Kotlin', 'Swift', 'PHP', 'Ruby', 'R language|r programming|r studio|rstudio', 'MATLAB', 'Scala', 'Perl', 'Julia',
    'SQL|structured query language', 'Bash|shell scripting|shell script', 'Dart', 'Fortran', 'Assembly language|assembly', 'VHDL', 'Verilog|systemverilog',
  ],
  'Web and mobile': [
    'HTML|html5', 'CSS|css3', 'React|reactjs|react.js', 'Next.js|nextjs', 'Angular|angularjs', 'Vue.js|vue|vuejs', 'Node.js|nodejs|node',
    'Express.js|expressjs|express', 'Django', 'Flask', 'FastAPI', 'Spring Boot|spring|spring framework', 'ASP.NET|.net|dotnet|.net core',
    'Laravel', 'REST APIs|rest api|restful|rest|restful apis|restful services', 'GraphQL', 'Tailwind CSS|tailwind', 'Bootstrap', 'jQuery',
    'Android development|android', 'iOS development|ios', 'Flutter', 'React Native', 'WordPress', 'Responsive design', 'Web accessibility|wcag',
  ],
  'Data and databases': [
    'MySQL', 'PostgreSQL|postgres', 'MongoDB|mongo', 'Oracle Database|oracle db|oracle', 'SQL Server|mssql|microsoft sql server', 'SQLite', 'Redis',
    'Cassandra', 'Elasticsearch', 'Data analysis|data analytics|analysing data|analyzing data', 'Data visualization|data visualisation',
    'Power BI|powerbi', 'Tableau', 'Excel|ms excel|microsoft excel|advanced excel', 'Pandas', 'NumPy', 'Big data', 'Hadoop', 'Apache Spark|spark|pyspark',
    'ETL|data pipelines|data pipeline', 'Data warehousing|data warehouse', 'Statistics|statistical analysis|statistical methods', 'Data mining',
    'Database management|dbms|database management systems', 'Snowflake', 'Kafka|apache kafka', 'Airflow|apache airflow',
  ],
  'AI and machine learning': [
    'Machine learning|ml', 'Deep learning|dl', 'Artificial intelligence|ai', 'Natural language processing|nlp', 'Computer vision|cv|image processing',
    'Neural networks|neural network|ann|artificial neural networks', 'CNN|convolutional neural networks|convolutional neural network',
    'RNN|recurrent neural networks|lstm', 'Transformers|transformer models|bert|attention mechanism', 'Large language models|llm|llms|generative ai|genai|gen ai',
    'Graph neural networks|gnn|gnns|graph neural network', 'Reinforcement learning|rl', 'TensorFlow|tensorflow', 'PyTorch|pytorch|torch', 'Keras',
    'scikit-learn|sklearn|scikit learn', 'OpenCV', 'Hugging Face|huggingface', 'XGBoost', 'Time series analysis|time series|forecasting',
    'Predictive modelling|predictive modeling|predictive analytics', 'Feature engineering', 'MLOps', 'Prompt engineering', 'Explainable AI|xai',
    'Medical image analysis|medical imaging', 'Speech recognition', 'Recommender systems|recommendation systems', 'Data science',
  ],
  'Cloud and DevOps': [
    'AWS|amazon web services', 'Microsoft Azure|azure', 'Google Cloud|gcp|google cloud platform', 'Docker', 'Kubernetes|k8s', 'Terraform', 'Ansible',
    'Jenkins', 'CI/CD|ci cd|continuous integration|continuous delivery|continuous deployment', 'Git|github|gitlab|version control', 'Linux|unix',
    'Microservices|microservice architecture', 'Serverless', 'Networking|computer networks|network administration', 'Cybersecurity|cyber security|information security|network security',
    'Ethical hacking|penetration testing', 'Cloud computing', 'Virtualization|vmware', 'Monitoring|prometheus|grafana',
  ],
  'Software engineering': [
    'Object-oriented programming|oop|oops|object oriented programming', 'Data structures|data structure|dsa', 'Algorithms|algorithm design|design and analysis of algorithms',
    'System design', 'Software testing|testing|qa|quality assurance', 'Unit testing|junit|pytest', 'Selenium|test automation|automation testing',
    'Agile|scrum|kanban', 'SDLC|software development life cycle', 'Design patterns', 'UML', 'API design', 'Debugging', 'Code review',
    'Compiler design|compilers', 'Operating systems|operating system|os', 'Computer architecture|computer organization|computer organisation and architecture|coa',
    'Distributed systems', 'Blockchain', 'Internet of Things|iot', 'Embedded systems|embedded', 'Theory of computation|automata|toc', 'Software engineering',
  ],
  'Electronics and electrical': [
    'VLSI', 'Digital electronics|digital logic|digital design', 'Analog electronics|analog circuits|analog design', 'Signal processing|digital signal processing|dsp',
    'Communication systems|wireless communication|communications', 'Microcontrollers|microcontroller|arduino|8051', 'Microprocessors|microprocessor',
    'Raspberry Pi', 'PCB design', 'Power systems|power system', 'Power electronics', 'Control systems|control system', 'Electrical machines',
    'Renewable energy|solar energy|wind energy', 'PLC|scada', 'Antenna design|antennas|rf design', 'FPGA', 'Cadence', 'Xilinx|vivado', 'LabVIEW',
  ],
  'Mechanical and civil': [
    'AutoCAD', 'SolidWorks', 'CATIA', 'ANSYS', 'Finite element analysis|fea|fem|finite element method', 'CFD|computational fluid dynamics',
    'Thermodynamics', 'Fluid mechanics', 'Manufacturing|manufacturing processes', 'Robotics', 'Mechatronics', 'Structural engineering|structural analysis',
    'STAAD Pro|staad', 'Surveying', 'Geotechnical engineering', 'Transportation engineering', 'Environmental engineering', 'Construction management',
    'Revit', 'GIS|arcgis|qgis|geographic information systems', 'Remote sensing', 'HVAC', '3D printing|additive manufacturing',
  ],
  'Life sciences and health': [
    'Molecular biology', 'Biotechnology', 'Microbiology', 'Genomics|bioinformatics', 'Cell culture', 'PCR|qpcr|rt-pcr', 'Clinical research|clinical trials',
    'Pharmacology', 'Pharmaceutics', 'Pharmaceutical analysis|hplc', 'Biochemistry', 'Neuroscience', 'Neuroimaging|fmri|mri|dti|eeg',
    'Public health|epidemiology', 'Nursing', 'Medical education', 'Biostatistics', 'Good laboratory practice|glp', 'Organic chemistry', 'Analytical chemistry',
  ],
  'Business and management': [
    'Project management|project planning', 'Program management', 'Product management', 'Business analysis|business analyst', 'Requirements gathering|requirement analysis',
    'Stakeholder management', 'Financial analysis|financial modelling|financial modeling', 'Accounting|tally|tally erp', 'Marketing|digital marketing',
    'SEO|search engine optimization', 'Sales', 'Human resource management|hrm|human resources|hr', 'Operations management|operations', 'Supply chain management|supply chain|scm',
    'Risk management', 'Strategic planning|strategy', 'Budgeting', 'Entrepreneurship', 'Business development', 'CRM|salesforce', 'ERP|sap', 'Six Sigma|lean six sigma|lean',
    'Economics', 'Corporate law|company law', 'Labour law|labor law', 'Constitutional law', 'Intellectual property|ipr|patents law',
  ],
  'Teaching and academics': [
    'Teaching|lecturing|classroom teaching', 'Curriculum design|curriculum development|syllabus design|syllabus framing', 'Outcome-based education|obe|outcome based education',
    'NAAC|naac accreditation', 'NBA accreditation|nba', 'NIRF', 'Course design|course development', 'Pedagogy|teaching methodology|teaching methods',
    'Student mentoring|mentoring|mentorship|student counselling|counseling', 'Lesson planning|lesson plans', 'Assessment design|question paper setting|evaluation|examination work',
    'Laboratory instruction|lab instruction|laboratory teaching|lab sessions', 'Academic administration|department administration', 'E-learning|online teaching|moodle|lms|google classroom',
    'Project guidance|project supervision|guiding student projects', 'PhD supervision|research supervision|guiding phd scholars', 'Faculty development programmes|fdp|faculty development',
    'Blended learning', 'Flipped classroom', 'Educational technology|edtech', 'Accreditation', 'ISO 9001|quality management',
  ],
  'Research': [
    'Research methodology|research methods', 'Scientific writing|academic writing|technical writing|research writing', 'Literature review|systematic review|meta-analysis',
    'Grant writing|research proposals|proposal writing|funding proposals', 'Peer review|reviewer', 'Experimental design|design of experiments|doe',
    'Qualitative research', 'Quantitative research', 'Data collection', 'Survey design|questionnaire design', 'Patent filing|patents|patent drafting',
    'LaTeX|latex|overleaf', 'SPSS', 'Stata', 'NVivo', 'Mendeley|zotero|endnote|reference management', 'Scopus', 'Web of Science', 'Research ethics',
    'Interdisciplinary research', 'Laboratory management|lab management', 'Simulation|modelling and simulation|modeling and simulation',
  ],
  'Tools and software': [
    'Microsoft Office|ms office|msoffice', 'Word|ms word|microsoft word', 'PowerPoint|ms powerpoint', 'Google Workspace|g suite|google docs', 'Jira',
    'Confluence', 'Figma', 'Adobe Photoshop|photoshop', 'Adobe Illustrator|illustrator', 'Canva', 'Postman', 'Visual Studio Code|vs code|vscode',
    'Eclipse', 'IntelliJ IDEA|intellij', 'Jupyter|jupyter notebook', 'Google Colab|colab', 'Anaconda', 'Simulink', 'Proteus', 'Multisim', 'NS2|ns-2|ns3|ns-3',
  ],
  'Soft skills': [
    'Communication|communication skills|verbal communication|written communication', 'Leadership|team leadership', 'Teamwork|team player|collaboration|collaborative',
    'Problem solving|problem-solving', 'Critical thinking|analytical thinking|analytical skills', 'Time management', 'Adaptability|flexibility',
    'Creativity|creative thinking', 'Presentation skills|public speaking|presentations', 'Interpersonal skills', 'Decision making|decision-making',
    'Attention to detail|detail oriented|detail-oriented', 'Conflict resolution', 'Negotiation', 'Emotional intelligence', 'Organisational skills|organizational skills|organization skills',
    'Self-motivation|self motivated|self-motivated', 'Work ethic', 'Customer service', 'Multitasking',
  ],
  'Languages': [
    'English', 'Hindi', 'Tamil', 'Telugu', 'Kannada', 'Malayalam', 'Marathi', 'Bengali', 'Gujarati', 'Punjabi', 'Odia', 'Urdu', 'Sanskrit',
    'French', 'German', 'Spanish', 'Japanese', 'Arabic', 'Amharic',
  ],
};

export interface Skill { name: string; category: SkillCategory; aliases: string[] }

/** Each alias as written in the list (case kept, for the case-sensitive checks below). */
const WRITTEN: Map<Skill, string[]> = new Map();

export const SKILLS: Skill[] = (Object.entries(RAW) as [SkillCategory, string[]][]).flatMap(([category, lines]) =>
  lines.map(line => {
    const written = line.split('|').map(s => s.trim()).filter(Boolean);
    const skill: Skill = { name: written[0], category, aliases: [...new Set(written.map(a => a.toLowerCase()))] };
    WRITTEN.set(skill, written);
    return skill;
  }));

/**
 * Short forms that are also ordinary words or letters ("AI", "OS", "Go", "Node", "REST", "Word"): they only count
 * when written exactly as listed (case-sensitive), so "go to" or "the os" don't count as skills.
 */
const EXACT_CASE = new Set(['ai', 'ml', 'dl', 'cv', 'os', 'rl', 'hr', 'qa', 'dsp', 'nba', 'toc', 'doe', 'coa', 'js', 'gnn', 'gnns', 'go', 'node', 'rest', 'express', 'spring', 'oracle', 'word', 'lean', 'vue', 'r', 'sap', 'erp', 'crm', 'lms', 'iot', 'xai', 'llm', 'llms', 'cnn', 'rnn', 'ann', 'fea', 'fem', 'cfd', 'gis', 'plc', 'pcr', 'glp', 'hrm', 'scm', 'seo', 'oop', 'oops', 'dsa', 'uml', 'sdlc', 'dbms', 'etl', 'hplc', 'mri', 'fmri', 'dti', 'eeg', 'obe', 'fdp', 'nirf', 'naac', 'ipr', 'aws', 'gcp', 'vlsi', 'fpga', 'pcb', 'hvac', 'ios']);

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function compile(): { skill: Skill; ci: RegExp | null; cs: RegExp | null }[] {
  return SKILLS.map(skill => {
    const ci: string[] = [], cs: string[] = [];
    for (const w of WRITTEN.get(skill) || []) {
      const body = escapeRe(w).replace(/ /g, '[\\s-]+');
      if (EXACT_CASE.has(w.toLowerCase())) {
        // Written in lower case in the list ("os", "js"): only the capitalised form counts ("OS", "JS"); a form with
        // capitals ("Go", "Node", "GNN") counts as written. Plurals ("GNNs", "LLMs") count too.
        const forms = w === w.toLowerCase() ? [w.toUpperCase()] : [w, ...(w.length <= 4 && w !== w.toUpperCase() ? [w.toUpperCase()] : [])];
        for (const f of forms) cs.push(`${escapeRe(f).replace(/ /g, '[\\s-]+')}s?`);
      } else ci.push(body);
    }
    const wrap = (alts: string[], flags: string) => (alts.length ? new RegExp(`(?<![A-Za-z0-9+#.])(?:${alts.join('|')})(?![A-Za-z0-9+#])`, flags) : null);
    return { skill, ci: wrap(ci, 'gi'), cs: wrap(cs, 'g') };
  });
}
let COMPILED: ReturnType<typeof compile> | null = null;

/** Skills found in a text, with how many times each appears. */
export function findSkills(text: string): { skill: Skill; count: number }[] {
  COMPILED ||= compile();
  const out: { skill: Skill; count: number }[] = [];
  for (const m of COMPILED) {
    let count = 0;
    if (m.ci) count += (text.match(m.ci) || []).length;
    if (m.cs) count += (text.match(m.cs) || []).length;
    if (count) out.push({ skill: m.skill, count });
  }
  return out;
}

export function skillByName(name: string): Skill | undefined {
  const n = name.toLowerCase();
  return SKILLS.find(s => s.name.toLowerCase() === n || s.aliases.includes(n));
}

/** Free learning resources to suggest for a missing skill (by category). */
export const LEARNING_HINTS: Partial<Record<SkillCategory, string>> = {
  'Programming languages': 'NPTEL / SWAYAM programming courses, or the language’s official tutorial',
  'Web and mobile': 'freeCodeCamp, MDN Web Docs, or the framework’s official documentation',
  'Data and databases': 'NPTEL Data Science courses, Kaggle Learn, or vendor certifications (e.g. Microsoft PL-300 for Power BI)',
  'AI and machine learning': 'NPTEL Deep Learning / Machine Learning (IIT), Kaggle Learn, or fast.ai',
  'Cloud and DevOps': 'AWS / Azure / Google Cloud free training and their associate-level certifications',
  'Software engineering': 'NPTEL Software Engineering and Data Structures courses',
  'Electronics and electrical': 'NPTEL electronics and electrical courses (IITs)',
  'Mechanical and civil': 'NPTEL courses and the software vendor’s training portal',
  'Teaching and academics': 'AICTE ATAL FDPs, SWAYAM ARPIT refresher courses, NITTTR courses',
  'Research': 'SWAYAM “Research Methodology”, UGC-CARE guidelines, and your library’s research-skills workshops',
  'Business and management': 'NPTEL management courses or the relevant professional certification',
};
