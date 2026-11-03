# AcadeXMatch Resume Intelligence (Phase 1)

In-house, rule-based resume checker and builder. No outside AI service and no API keys.

## What candidates get (free)
- Upload a PDF, DOCX or TXT resume (5 MB max; scanned PDFs and old .doc files get a clear message).
- ATS score (0–100) from six weighted dimensions: keywords 25, skills 20, experience 20, formatting 15,
  education/certifications 10, summary 10. The administrator can change the weights.
  Bands: 90+ excellent, 75–89 strong, 60–74 needs improvement, 40–59 significant, below 40 major.
- Job match against a pasted job description or an open AcadeXMatch vacancy: required and preferred skills,
  keywords, experience, degree, NET/SET, certifications and responsibilities.
- ATS formatting checks (tables, text boxes, images, columns, contact details in the header, headings, dates, length).
- Weak bullet points with rewrites that keep the candidate's own facts. Suggestions never invent qualifications or numbers.
- Academic CV analysis: Ph.D., NET/SET, teaching and research years, publications, patents, grants, memberships, FDPs,
  and an indicative check against the UGC Regulations 2018 (as amended) for Assistant, Associate and Professor posts.
- Matching open vacancies.
- Resume builder: four single-column templates (ATS Classic, Academic CV, Modern Professional, Fresher),
  pre-fill from an analysed resume, PDF (browser print) and Word (.docx) download, and scoring of the built resume.
- History, deletion of one analysis, and "delete all my resume data".

## Privacy
- Each user's data is in a private store (`json:resume-<userId>` in `acx_kv`). It is not part of the shared database snapshot.
- Only the owner can read their analyses and drafts. Institutions and administrators cannot.
- The original file is not stored, only its extracted text, so the resume can be re-checked against another job.
- Explicit consent before the first check. Analyses older than the retention period (default 365 days) are removed daily.
- Deleting an account removes its resume data.
- The admin page (Admin → Resume checker) shows settings and content-free totals only.

## Code
- `lib/resume/` – skills dictionary, parser, job description reader, scoring, academic analyzer, vacancy matching, builder model.
- `lib/server/resumeExtract.ts` (PDF/DOCX/TXT), `lib/server/resumes.ts` (storage, limits, stats), `lib/server/docx.ts` (Word writer).
- APIs: `/api/resume`, `/api/resume/[id]`, `/api/resume/builder`, `/api/resume/docx`, `/api/admin/resume`.
- Pages: `/candidate/resume-checker`, `/candidate/resume-checker/[id]`, `/candidate/resume-builder`.
- Tests: `tests/resume.ts` with synthetic resumes and job descriptions in `tests/fixtures/`.

## Phase 2 (planned, paid "AI pack")
Rewriting assistance, cover letters, interview questions from the resume, LinkedIn profile review, version comparison.
