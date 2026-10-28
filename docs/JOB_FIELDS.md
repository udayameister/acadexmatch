# Vacancy fields (all job posts)

Every vacancy uses the same record (`Job` in `types/index.ts`), whether an institution posts it or the
crawler reads it from an advertisement. A field the source does not state stays empty and shows as
"Not specified". Nothing is filled in by guesswork.

## Where it is stored

| Store | What |
|---|---|
| MySQL `acx_kv`, key `db:acad_jobs_v3` | The vacancies the app reads and writes (JSON array of `Job`). |
| MySQL `acx_job_posts` | One row per vacancy with the main fields as columns plus `details` (JSON). It is a mirror for reports, exports and SQL (phpMyAdmin). It is rebuilt when the server starts and updated after every save (`lib/server/jobTable.ts`). The app never reads it back. |

## Core fields (`Job`)

| Field | Column in `acx_job_posts` | Meaning |
|---|---|---|
| `id` | `id` | Vacancy id |
| `status` | `status` | `published`, `draft`, `closed` … |
| `title` | `title` | Title as advertised |
| `instituteId`, `instituteName` | `institute_id`, `institute_name` | Recruiting institution (for crawled advertisements, the hiring organisation named on the page) |
| `instituteType` | `institute_type` | Central / State / Private university, college … |
| `department` | `department` | Department (single-department posts) |
| `designation` | `designation` | Cadre, e.g. Assistant Professor (Level 12) |
| `advertisementNumber` | `advertisement_number` | Advertisement / notification number |
| `location.city`, `location.state` | `city`, `state` | Place of posting |
| `payScale.cpcBand` | `pay_text` | Pay level or pay text as stated |
| `requiredQualifications.*` | `qualification`, `experience` | Minimum degree, NET/SET, Ph.D. norms, publications, experience |
| `reservationCategory` | `reservation` | Reservation category |
| `postedAt` | `posted_at` | Date posted |
| `applicationDeadline`, `deadlineText` | `deadline`, `deadline_text` | Closing date (ISO) and the text as printed |
| `externalApplyUrl` | `apply_url` | Where to apply (application link, otherwise the official website, otherwise the source page) |
| `specializationTags` | `departments` | Subjects / departments (searchable) |
| `description`, `responsibilities`, `benefits`, `selectionProcess`, `screeningQuestions` | `details` | Text sections |
| `isPremium`, `applicantCount` | `is_premium`, `applicant_count` | |
| `source.url`, `source.kind`, `source.siteName` | `source_url`, `source_kind`, `source_site`, `is_scraped` | Crawled vacancies only. `kind` is `aggregator` when the page is a job-listing site rather than the institution's own website |

## Full advertisement details (`Job.details`, type `JobDetails`)

All optional. The crawler fills them from advertisement pages; institutions fill them in the
"Full advertisement details" section of **Post a vacancy**.

| Field | Type | Advertisement heading it comes from |
|---|---|---|
| `summary` | text | Opening paragraph |
| `hiringOrganization` | text | Hiring Organization Name |
| `postGroups` | `{group, items[]}[]` | Job Title / Designation (Academic Posts, Non-Teaching Posts …) |
| `numberOfPosts` | text | Number of posts / vacancies |
| `departmentGroups` | `{group, items[]}[]` | Vacancy available in departments (with sub-headings, e.g. "Professors › Engineering and Technology") |
| `qualifications` | `{post, text}[]` | Required Qualifications (per post) |
| `preferredQualifications` | `{post, text}[]` | Preferred / Desirable Qualifications |
| `experience` | `{post, text}[]` | Required Experience |
| `candidateProfile` | list | Candidate Profile |
| `responsibilities` | list | Responsibilities / Duties |
| `salaryText` | text | Salary Details / Pay Scale |
| `employmentType` | text | FULL_TIME, PART_TIME, CONTRACTOR, TEMPORARY |
| `locationText` | text | Job Location |
| `ageLimit` | text | Age limit |
| `applicationFee` | text | Application fee |
| `reservation` | text | Reservation |
| `selectionProcess` | list | Selection Process |
| `importantDates` | `{label, value}[]` | Important Dates table |
| `notificationDate`, `lastDateText`, `interviewText` | text | Notification date, Last date to apply (as printed), Walk-in / interview |
| `deadlineEstimated` | yes/no | The closing date was worked out from "within N days" and the posting date |
| `applyModes` | list | Apply Mode: online, email, offline, walk-in, post |
| `howToApply` | text | How to Apply |
| `applicationProcedure` | list | Application Procedure (steps) |
| `applyEmails` | `{email, note}[]` | E-mail addresses to apply (Cloudflare-protected addresses are decoded) |
| `contactPhones` | list | Phone numbers |
| `applicationLink`, `officialWebsite`, `notificationLink` | URL | Important Links table |
| `documentsRequired` | list | Documents Required |
| `organizationAddress` | text | Organization address |
| `benefits` | list | Benefits of joining |

Not taken from listing sites: FAQ, disclaimers, "reference source" notes, menus and adverts.

## Crawler

`lib/server/noticeParser.ts` reads an advertisement page section by section. In `lib/server/crawler.ts`,
a page with at least 4 recognised sections (`NOTICE_MIN_SECTIONS`) becomes **one** vacancy with all
details, instead of one thin vacancy per post name. When the start address itself is such a page
(e.g. a FacultyPlus notice), the crawler stops there and does not crawl the rest of that site.
Vacancies from listing sites show "Listed on …" and a note to confirm on the official website.

Test: `npm run test:notice` (fixture `tests/fixtures/notice-aggregator.html`, fictional data).

## Example SQL

```sql
-- Open vacancies closing in the next 7 days
SELECT title, institute_name, state, deadline FROM acx_job_posts
WHERE status = 'published' AND deadline BETWEEN CURDATE() AND CURDATE() + INTERVAL 7 DAY ORDER BY deadline;

-- Vacancies that accept e-mail applications
SELECT title, institute_name, apply_emails FROM acx_job_posts WHERE FIND_IN_SET('email', apply_modes);

-- One department across all advertisements
SELECT title, institute_name FROM acx_job_posts WHERE departments LIKE '%Pharmacology%';
```
