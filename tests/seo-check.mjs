// SEO checks against a running site. No dependencies.
//   node tests/seo-check.mjs                       (http://localhost:3000, canonical https://acadexmatch.com)
//   BASE_URL=https://acadexmatch.com node tests/seo-check.mjs
//   BASE_URL=http://localhost:3300 SITE_URL=https://acadexmatch.com node tests/seo-check.mjs
const BASE = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const SITE = (process.env.SITE_URL || 'https://acadexmatch.com').replace(/\/$/, '');
const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`); };
const toLocal = u => u.replace(SITE, BASE);

async function get(path) {
  const r = await fetch(path.startsWith('http') ? path : BASE + path, { redirect: 'manual', headers: { 'User-Agent': 'AcadeXMatch-SEO-check' } });
  return { status: r.status, headers: r.headers, text: await r.text() };
}
const meta = (html, re) => (html.match(re) || [])[1] || '';
const title = h => meta(h, /<title[^>]*>([^<]*)<\/title>/i).trim();
const description = h => meta(h, /<meta name="description" content="([^"]*)"/i);
const canonical = h => meta(h, /<link rel="canonical" href="([^"]*)"/i);
const robotsMeta = h => meta(h, /<meta name="robots" content="([^"]*)"/i);
const jsonLd = h => [...h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m => { try { return JSON.parse(m[1]); } catch { return { __invalid: m[1].slice(0, 80) }; } });
const visibleText = h => h.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

const today = new Date().toISOString().slice(0, 10);

(async () => {
  // Home page
  const home = await get('/');
  check('home returns 200', home.status === 200, String(home.status));
  check('home has a title', !!title(home.text), title(home.text));
  check('home has a meta description', description(home.text).length > 50, `${description(home.text).length} chars`);
  check('home canonical is the site root', canonical(home.text) === SITE || canonical(home.text) === `${SITE}/`, canonical(home.text));
  check('home has exactly one h1', (home.text.match(/<h1[\s>]/g) || []).length === 1);
  check('home HTML has real content (not just a spinner)', /Open vacancies/.test(visibleText(home.text)) && /Meet the founders/.test(visibleText(home.text)));
  const graph = jsonLd(home.text).flatMap(d => d['@graph'] || [d]);
  check('Organization and WebSite structured data', graph.some(d => d['@type'] === 'Organization') && graph.some(d => d['@type'] === 'WebSite'));
  check('Open Graph image set', /<meta property="og:image" content="[^"]+"/.test(home.text));
  check('no private data in public HTML', !/passwordHash|"salt"|acad_session|candidateEmail/.test(home.text));

  // robots.txt
  const robots = await get('/robots.txt');
  check('robots.txt returns 200', robots.status === 200);
  check('robots.txt points to the sitemap', robots.text.includes(`Sitemap: ${SITE}/sitemap.xml`), robots.text.match(/Sitemap:.*/)?.[0]);
  check('robots.txt does not block CSS/JS', !/Disallow:\s*\/_next/.test(robots.text));

  // Sitemap
  const sm = await get('/sitemap.xml');
  check('sitemap.xml returns 200', sm.status === 200);
  check('sitemap is a urlset', /^<\?xml[^>]*>\s*<urlset[^>]*xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9"/.test(sm.text.trim()));
  const locs = [...sm.text.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1].replace(/&amp;/g, '&'));
  check('sitemap URLs use the canonical origin', locs.length > 0 && locs.every(u => u.startsWith(`${SITE}/`)), `${locs.length} URLs`);
  check('sitemap has no private URLs', !locs.some(u => /\/(admin|candidate|institute\/|account|login|register|invoice|offer|api)\b/.test(u)));

  const titles = new Map(), descs = new Map();
  let jobPages = 0, postings = 0;
  for (const loc of locs) {
    const p = await get(toLocal(loc));
    const t = title(p.text), d = description(p.text), c = canonical(p.text), rb = robotsMeta(p.text);
    const ok = p.status === 200 && !!t && d.length > 30 && c === loc.replace(/\/$/, loc === `${SITE}/` ? '' : '') && !/noindex/.test(rb) && !/noindex/.test(p.headers.get('x-robots-tag') || '');
    check(`sitemap URL is indexable: ${loc.replace(SITE, '') || '/'}`, ok || (loc === `${SITE}/` && p.status === 200 && (c === SITE || c === loc)), `${p.status} canonical=${c} robots=${rb || '-'}`);
    titles.set(t, [...(titles.get(t) || []), loc]);
    descs.set(d, [...(descs.get(d) || []), loc]);
    if (/\/jobs\/[^/]+$/.test(loc)) {
      jobPages++;
      const items = jsonLd(p.text);
      check(`structured data is valid JSON: ${loc.replace(SITE, '')}`, !items.some(x => x.__invalid));
      const jp = items.find(x => x['@type'] === 'JobPosting');
      if (jp) {
        postings++;
        const okJp = jp.title && jp.description && jp.datePosted && jp.hiringOrganization?.name && jp.jobLocation?.address && (!jp.validThrough || jp.validThrough.slice(0, 10) >= today);
        check(`JobPosting has required fields: ${loc.replace(SITE, '')}`, !!okJp);
        check(`JobPosting title is shown on the page: ${loc.replace(SITE, '')}`, visibleText(p.text).includes(jp.title.slice(0, 40)));
      }
      check(`BreadcrumbList present: ${loc.replace(SITE, '')}`, items.some(x => x['@type'] === 'BreadcrumbList'));
    }
  }
  check('no duplicate titles across sitemap pages', [...titles.values()].every(v => v.length === 1), [...titles.entries()].filter(([, v]) => v.length > 1).map(([k]) => k).join(' | '));
  check('no duplicate descriptions across sitemap pages', [...descs.values()].every(v => v.length === 1));
  console.log(`      (${jobPages} job pages, ${postings} with JobPosting markup)`);

  // Listing pages must not carry JobPosting
  const jobsList = await get('/jobs');
  check('/jobs has no JobPosting markup', !jsonLd(jobsList.text).some(x => x['@type'] === 'JobPosting'));
  const searched = await get('/jobs?search=computer');
  check('/jobs?search=… canonicalises to /jobs', canonical(searched.text) === `${SITE}/jobs`, canonical(searched.text));

  // Unknown pages
  const missing = await get('/jobs/does-not-exist-123');
  check('unknown vacancy returns 404', missing.status === 404, String(missing.status));

  // Private pages
  for (const path of ['/admin', '/candidate/dashboard', '/institute/dashboard', '/account', '/login', '/register', '/api/data']) {
    const p = await get(path);
    const xr = p.headers.get('x-robots-tag') || '';
    const metaNo = path.startsWith('/api') || /noindex/.test(robotsMeta(p.text));
    check(`private ${path} is noindex`, /noindex/.test(xr) && metaNo, `x-robots-tag=${xr} meta=${robotsMeta(p.text) || '-'}`);
    check(`private ${path} has no canonical to itself`, !canonical(p.text) || !canonical(p.text).endsWith(path));
  }

  // Internal links on the home page
  const links = [...new Set([...home.text.matchAll(/href="(\/[^"#?]*)"/g)].map(m => m[1]).filter(h => !h.startsWith('/_next')))].slice(0, 60);
  const broken = [];
  for (const href of links) {
    const r = await get(href);
    if (r.status >= 400) broken.push(`${href} ${r.status}`);
  }
  check('internal links from the home page resolve', broken.length === 0, broken.join(', ') || `${links.length} links`);

  const failed = results.filter(x => !x).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
