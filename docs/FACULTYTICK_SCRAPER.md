# FacultyTick scraping

A separate scraping engine for [facultytick.com](https://facultytick.com), with its own tab in the admin console
(**Admin console → FacultyTick**). It does not share settings or a queue with the college-website scraper
("Job scraping").

## How it works

1. **Reading.** FacultyTick is a WordPress site. The engine reads its public posts API
   (`/wp-json/wp/v2/posts`), which its robots.txt allows. It reads only recent posts (from the newest post already
   read, or the last few days on the first run) in the chosen categories.
2. **Parsing** (`lib/facultytick.ts`). Almost every post uses one template of labelled headings. These become
   vacancy fields:

   | FacultyTick heading | AcadeXMatch field |
   |---|---|
   | NAME OF THE INSTITUTION | Institution (casing from the post title, e.g. "National Institute of Technology Calicut (NITC)") |
   | DESIGNATION / JOB POSITION | Post(s); the title lists up to three |
   | DEPARTMENT / DISCIPLINE / SPECIALIZATION | Departments and subject tags |
   | PROJECT DETAILS | Summary (project, sponsor, duration) |
   | QUALIFICATION & EXPERIENCE | Qualification text, years of experience |
   | SALARY / REMUNERATION / PAY SCALE | Pay |
   | JOB LOCATION / ADDRESS FOR COMMUNICATION | City, state, address |
   | HOW TO APPLY | How to apply, apply modes (email / online / post / walk-in) |
   | IMPORTANT DATE | Last date (the date after "on or before", "last date", "to" …); interview date |
   | CONTACT INFORMATION | Emails, phones, official website |
   | OFFICIAL SOURCE / REFERENCE | Link to the official notification |

   Posts outside the template are read from their headings and text and flagged. **Not copied:** FacultyTick's
   "About institution" paragraphs, introductions, conclusions, images and its stock sentences. Candidates apply
   through the institution's official notification or website. FacultyTick's page is used only when neither is
   given. Vacancies show the existing "Please confirm these details with the recruiting institution" note.
3. **Queue.** New posts wait under **To approve**. Posts whose last date has already passed are skipped. Each card
   shows the main facts, links to the official notification, the institution website and the FacultyTick post,
   and warnings to check:
   - Last date estimated ("within 21 days of publication", worked out from the post date)
   - Last date not found, or a rolling advertisement
   - No link to the official notification (common for private colleges)
   - Includes non-teaching posts
   - Not in FacultyTick's usual layout
   - Already on the job board
4. **Approval.** **Approve & publish** (one or a selection) publishes the vacancy to all candidates (Free and
   Premium). Post names and last dates can be corrected on the card first. **Reject** keeps the post out, and
   **Reconsider** brings it back.

## Running

- **Run now**, or daily after the configured time (default 07:30 IST) through the server's 10-minute scheduler.
- **Add one post** by pasting its facultytick.com address (works for posts already read or past their last date).
- **Settings:** daily on/off and time, categories, look-back days for the first run, and the most posts per run
  (default 150). The default categories are the higher-education ones; School, Junior College and Announcement
  are off.

## Politeness and safety

- One request at a time, at least 1.5 s apart, with a 25 s timeout and a single retry when the site asks to slow down.
- Identifies itself: `AcadeXMatchBot/1.0 (+https://acadexmatch.com/about; info@acadexmatch.com)`.
- A daily run normally needs 1–3 requests.
- Admin only: every API call checks the platform administrator's session (`/api/admin/facultytick`).
- State is kept in the `facultytick` store (database table or `data/facultytick.json`).

## Tests

`npx tsx tests/facultytick.ts` (part of `npm run test:app`) parses three real posts saved in
`tests/fixtures/facultytick-posts.json`: the NIT Calicut Research Associate sample, a college with three posts
and five departments, and a post outside the template. It also checks that no FacultyTick-written text is copied.
`FACULTYTICK_API_ORIGIN` points the engine at a local stand-in server for end-to-end tests. Never set it in
production.
