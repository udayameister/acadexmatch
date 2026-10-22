# AcadeXMatch — Academic Recruitment Platform for Indian Higher Education

AcadeXMatch connects faculty candidates with universities, IITs, NITs and colleges. Vacancies are mapped to UGC / AICTE norms and the 7th CPC pay matrix, candidates get an estimated UGC Table 3A academic score, and every match score comes with a criterion-by-criterion explanation.

Built with Next.js 15 (App Router), React 19, TypeScript and Tailwind CSS.

---

## Features

### Candidates
- **Account & academic profile** — degrees with grades, experience with dates, publications, NET/SLET, Ph.D. details, research interests, scholarly links.
- **CV import** — upload a PDF/TXT CV or paste text; a rule-based parser extracts education, appointments, publications, NET/JRF, Ph.D. and interests. Runs entirely in the browser.
- **UGC Table 3A academic score** — computed from your real profile data (graduation & PG grades, Ph.D., NET/JRF/SLET, indexed papers, academic experience, awards).
- **Explainable match score** — qualifications 35%, research alignment 30%, indexed publications 20%, experience 15%; capped below 50% when a mandatory Ph.D./NET criterion is unmet.
- **Apply & track** — screening questions, deadline checks, duplicate protection, stage timeline, withdraw while in screening.
- **Data rights** — download your data, request erasure, or withdraw consent for automated matching.

### Institutions
- **Registration** — join a listed institute with an email on its official domain, or register a new institute (pending until the administrator verifies its AISHE code).
- **Post vacancies** — 7th CPC level, reservation category, Ph.D./NET norms, publication & experience benchmarks, screening questions; close / reopen postings.
- **Applicant pipeline** — 8-stage board (applied → joined), applicant dossier view, "not selected" handling, interview scheduling and confidential committee scoring (research 30, teaching 25, API 20, interview 25).

### Platform administrator
- Institution verification queue, data-rights request desk (completing an erasure really deletes the account, profile and applications), filterable audit log with CSV export, and the university vacancy scraper.

---

## Getting started

```bash
npm install
npm run dev            # http://localhost:3000
```

**First run:** open `/register`. While no administrator exists, the registration page offers a one-time **Platform admin** option — create that account first, then register candidate and institution accounts.

Institutions already listed (IIT Bombay, IISc, BITS Pilani, Delhi University, Anna University, Ashoka University) require an email on their domain (e.g. `name@iitb.ac.in`).

### Scripts

| Command | Description |
| :--- | :--- |
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build / server |
| `npm test` | All tests (app flows, CV parser, scraper heuristics) |
| `npm run typecheck` | TypeScript check |
| `npm run scrape -- <url>` | Run the university scraper from the CLI |

The scraper needs Python 3.10+ and `pip install httpx beautifulsoup4`. Set `PYTHON_BIN` if Python is not on the PATH as `python` (Windows) / `python3`.

---

## Architecture

```text
app/
  page.tsx                 Home page
  login/, register/        Authentication
  jobs/, institutes/       Public job board and institution directory
  candidate/               Dashboard, profile, CV import, applications   (candidate only)
  institute/               Dashboard, post vacancy, applicant pipeline  (institute admin only)
  admin/                   Admin console                                 (platform admin only)
  scraper/                 University vacancy import                    (platform admin only)
  api/scrape/route.ts      Runs scraper.py and maps results to Job records
components/                Navbar, Footer, JobCard, modals, CvParserPanel, RequireRole guard
lib/
  storage.ts               StorageService — accounts, sessions, jobs, applications, DPDP, audit log
  scoring.ts               Table 3A score, match score, profile completeness
  ai-engine.ts             CV text extraction (PDF via pdfjs-dist) and parsing
  useAuth.ts               useCurrentUser / useStorageValue hooks
  data.ts                  Seed institutions and vacancies
tests/                     storage-flows.ts, cv-parser.ts
scraper.py, test_engine.py Python scraper and its tests
```

### Data & security model — read before deploying

All application data lives in the **browser's `localStorage`** (keys `acad_*_v3`). Passwords are hashed with PBKDF2-SHA256 (120k iterations, per-user salt) via Web Crypto, and routes are protected by client-side role guards.

This makes the app fully functional on a single machine with no backend, but **it is not a multi-user production deployment**: data is not shared between browsers, and client-side guards can be bypassed by anyone with dev tools. For production, move `StorageService` behind server API routes with a real database and server-side sessions — its method signatures are designed so pages need minimal changes.

Other notes:
- The match and Table 3A scores are estimates for short-listing guidance, not official UGC determinations.
- Journal indexing is estimated from the venue name; candidates can correct it, and the official UGC-CARE list remains authoritative.
- The scraper disables TLS verification (many institutional sites have broken certificates) and blocks private/local addresses.

---

## License

MIT — see `LICENSE`.
