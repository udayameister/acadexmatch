# AcadeXMatch — SEO setup and runbook

Stack: Next.js 15 (App Router, React 19), hosted on GoDaddy Node.js Hosting (deployed from GitHub
`udayameister/acadexmatch`, branch `main`), data in MySQL. Canonical origin: `https://acadexmatch.com`
(`https://www.acadexmatch.com` redirects there — observed in the browser on 2026-10-23). Change with `SITE_URL`.

## How it works

| Piece | Where |
|---|---|
| Public pages are server-rendered with real content (public snapshot of published vacancies + verified institutions; no user data) | `app/layout.tsx` (`publicSnapshot`), `components/StoreSeed.tsx`, `lib/storage.ts` (`seedPublicSnapshot`), `components/AppBootstrap.tsx`, `lib/site.ts` (`isPublicPath`) |
| Titles, descriptions, canonicals, Open Graph, Twitter cards | `app/layout.tsx` (defaults + `%s \| AcadeXMatch` template) and `layout.tsx` / `page.tsx` per route |
| Vacancy and institution metadata + JSON-LD | `app/jobs/[id]/layout.tsx`, `app/institutes/[id]/layout.tsx`, `lib/server/seo.ts` |
| Organization + WebSite JSON-LD | `app/layout.tsx` |
| robots.txt | `app/robots.ts` → `/robots.txt` |
| XML sitemap (live from the database) | `app/sitemap.ts` → `/sitemap.xml` |
| noindex for private areas | `layout.tsx` metadata in each private route + `X-Robots-Tag` in `next.config.mjs` |
| Search Console / Bing verification, GA4 | env `GOOGLE_SITE_VERIFICATION`, `BING_SITE_VERIFICATION`, `GA_MEASUREMENT_ID` |
| IndexNow | env `INDEXNOW_KEY`; key file at `/<key>.txt`; pings from `lib/server/notify.ts` → `lib/server/indexnow.ts` |
| Automated checks | `npm run test:seo` (`tests/seo-check.mjs`; set `BASE_URL`) |

### Indexing rules
* **Indexed**: `/`, `/jobs`, `/jobs/<id>` (open vacancies), `/institutes`, `/institutes/<id>` (verified only),
  `/about`, `/premium`, `/salary-calculator`.
* **Kept reachable but `noindex, follow`**: closed or expired vacancies (no JobPosting markup).
* **404**: unknown vacancies and unverified institutions.
* **`noindex, nofollow` (meta + header)**: `/admin`, `/candidate/*`, `/institute/*`, `/account`, `/invoice/*`,
  `/offer/*`, `/scraper`, `/login`, `/register`, `/forgot-password`, `/reset-password`, `/verify-email`, `/api/*`.
  These are protected by sign-in and server-side permission checks; noindex is not the security control.
* **Canonical**: `/jobs?search=…` and other filters point to `/jobs`.

### JobPosting rules (`lib/server/seo.ts`)
Markup is added only for open, single-post vacancies (an advertisement listing several posts in `details.postGroups` gets none) with a known location and a description. Values come
only from the vacancy: title, description (+ minimum qualification and experience shown on the page),
`datePosted`, `validThrough` (deadline, end of day IST), employer name and website, city/state,
advertisement number. `baseSalary` only when the pay is a 7th CPC level with an explicit ₹ range (monthly).
Notice-style scraped titles ("Job Openings", "Recruitment notification") get no JobPosting markup.

## Keyword map (hypotheses — no search-volume data was available)

| Cluster | Landing page |
|---|---|
| academic jobs India, faculty recruitment India, higher education recruitment | `/` |
| faculty jobs in India, Assistant Professor jobs, university teaching jobs, college faculty vacancies | `/jobs` |
| "<role> at <institution>", "<institution> faculty recruitment" | `/jobs/<id>`, `/institutes/<id>` |
| universities hiring faculty, engineering colleges recruitment | `/institutes` |
| 7th CPC Assistant Professor salary, faculty pay calculator | `/salary-calculator` |
| academic recruitment platform / ATS for colleges | `/premium` (and future institution landing page) |

Proposed (not built — only worth it once each has enough live vacancies to avoid thin pages):
subject pages such as `/jobs/computer-science` (CS, AI & ML faculty jobs), state pages, and guides
(how to apply for Assistant Professor jobs, eligibility per UGC Regulations 2018 with official sources,
academic CV, faculty interview preparation).

## Search Console (Google)
1. https://search.google.com/search-console → **Add property** → **URL prefix** → `https://acadexmatch.com/`.
   (Or a **Domain** property `acadexmatch.com` verified with a DNS TXT record in GoDaddy DNS.)
2. Verification → **HTML tag** → copy only the `content` value → GoDaddy → Node.js app → Settings → Secrets
   (Publish tab) → `GOOGLE_SITE_VERIFICATION` = that value → Save (the live app restarts) → **Verify**.
3. **Sitemaps** → enter `sitemap.xml` → Submit.
4. **URL inspection** → `https://acadexmatch.com/` → *Test live URL* → check the rendered HTML shows the page content → *Request indexing*.
5. Enhancements → **Job postings** report: fix any errors shown there.

## Bing Webmaster Tools
1. https://www.bing.com/webmasters → **Import from Google Search Console** (simplest), or add `https://acadexmatch.com/`.
2. If adding manually: **HTML Meta Tag** → copy the `msvalidate.01` content value → secret `BING_SITE_VERIFICATION` → Save → Verify.
3. **Sitemaps** → submit `https://acadexmatch.com/sitemap.xml`.
4. Optional IndexNow: set secret `INDEXNOW_KEY` to a random UUID; `https://acadexmatch.com/<key>.txt` must then show the key.
   Vacancy changes are announced automatically.

## Google Analytics 4 (optional)
Create a GA4 web data stream for `https://acadexmatch.com`, copy the Measurement ID (`G-…`) into the secret
`GA_MEASUREMENT_ID`. Consider a cookie-consent notice before enabling (DPDP Act).

## Checks
```
BASE_URL=https://acadexmatch.com npm run test:seo     # against production
BASE_URL=http://localhost:3000   npm run test:seo     # against a local `next start`
```
Also validate a vacancy URL in https://search.google.com/test/rich-results and https://validator.schema.org.

## 30-day monitoring plan
* **Day 1**: deploy; run `test:seo` against production; verify Search Console and Bing; submit the sitemap; inspect `/`, `/jobs` and two vacancies.
* **Days 2–7**: Search Console → Pages (indexed vs. not indexed reasons), Sitemaps (discovered count), Job postings report; fix errors.
* **Days 8–14**: check that closed vacancies drop out (noindex) and new ones appear; Rich Results test on new vacancies; Core Web Vitals report (field data appears only with enough traffic).
* **Days 15–30**: Performance report — queries, impressions, CTR per page; improve titles/descriptions of pages with impressions but low CTR; decide whether subject/state landing pages have enough vacancies to be useful.
