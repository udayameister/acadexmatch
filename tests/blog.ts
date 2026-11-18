/* Blog: safe Markdown rendering, publishing rules, scheduling, addresses and files. Run: npx tsx tests/blog.ts */
import assert from 'assert';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { renderMarkdown, safeUrl, plainText, readingMinutes } from '../lib/markdown';
import { postState, weekStart } from '../lib/blog';

// ---------------------------------------------------------------- Markdown: safety
const evil = [
  '<script>alert(1)</script>',
  '<img src=x onerror=alert(1)>',
  '[click](javascript:alert(1))',
  '[click](JaVaScRiPt:alert(1))',
  '![x](javascript:alert(1))',
  '![x](data:text/html;base64,PHNjcmlwdD4=)',
  '[x](//evil.example/path)',
  '"><svg onload=alert(1)>',
  '<a href="javascript:alert(1)">x</a>',
  '[a](https://ok.example/" onmouseover="alert(1))',
  '> <iframe src="https://evil.example"></iframe>',
  '| <b onclick=x> | b |\n| --- | --- |\n| <script> | y |',
  '[^1] text\n\n[^1]: <script>alert(1)</script>',
  '`<script>`',
];
for (const src of evil) {
  const { html } = renderMarkdown(src);
  assert(!/<script|<iframe|<svg|<b /i.test(html), `raw tag leaked: ${src} -> ${html}`);
  assert(!/<[a-z][^>]*\son\w+\s*=/i.test(html), `event handler attribute leaked: ${src} -> ${html}`);
  assert(!/href="(javascript|data|\/\/)/i.test(html) && !/src="(javascript|data)/i.test(html), `unsafe URL leaked: ${src} -> ${html}`);
}
assert.equal(safeUrl('javascript:alert(1)'), null);
assert.equal(safeUrl('//evil.example'), null);
assert.equal(safeUrl('/api/blog/files/b-x.png'), '/api/blog/files/b-x.png');
assert.equal(safeUrl('https://ugc.gov.in'), 'https://ugc.gov.in');

// ---------------------------------------------------------------- Markdown: features
const doc = renderMarkdown(`# Executive summary

Some **bold** and *italic* text with a [link](https://ugc.gov.in) and \`code\`.

## Findings

### Detail

- one
- two

1. first
2. second

> **Key finding:** hiring is up.

| A | B |
| --- | --- |
| 1 | 2 |

![Chart](/api/blog/files/b-abc123.png "Figure 1")

Claim with a source.[^ugc]

[^ugc]: UGC Regulations 2018.

---
`);
const h = doc.html;
assert(/<h2 id="executive-summary">Executive summary<\/h2>/.test(h), 'single # becomes h2 (page title is the h1)');
assert(/<h3 id="detail">/.test(h));
assert(/<strong>bold<\/strong>/.test(h) && /<em>italic<\/em>/.test(h) && /<code>code<\/code>/.test(h));
assert(/<a href="https:\/\/ugc.gov.in" target="_blank" rel="noopener noreferrer">link<\/a>/.test(h), 'external links open safely in a new tab');
assert(/<ul><li>one<\/li><li>two<\/li><\/ul>/.test(h) && /<ol><li>first<\/li><li>second<\/li><\/ol>/.test(h));
assert(/<blockquote class="callout">/.test(h), 'key-finding call-out');
assert(/<table>[\s\S]*<th>A<\/th>[\s\S]*<td>2<\/td>/.test(h));
assert(/<figure><img src="\/api\/blog\/files\/b-abc123.png" alt="Chart"[^>]*><figcaption>Figure 1<\/figcaption><\/figure>/.test(h));
assert(/<sup class="fn-ref"><a href="#fn-1"/.test(h) && /<li id="fn-1">UGC Regulations 2018\./.test(h), 'footnotes');
assert(/<hr \/>/.test(h));
assert.deepEqual(doc.headings.map(x => x.id), ['executive-summary', 'findings', 'detail', 'references']);
assert(!/<em>/.test(renderMarkdown('[a](https://x.example/some_file_name_here)').html), 'underscores in URLs are not italicised');
assert.equal(renderMarkdown('## Same\n\n## Same').headings[1].id, 'same-2', 'duplicate heading ids made unique');
assert.equal(plainText('## Hi **there** [x](https://y)'), 'Hi there x');
assert.equal(readingMinutes('word '.repeat(1000)), 5);

// ---------------------------------------------------------------- states and weeks
assert.equal(postState({ status: 'draft' } as never), 'draft');
assert.equal(postState({ status: 'published', publishAt: new Date(Date.now() + 3600_000).toISOString() } as never), 'scheduled');
assert.equal(postState({ status: 'published', publishAt: new Date(Date.now() - 1000).toISOString() } as never), 'published');
// Wednesday 18 Nov 2026, 10:00 IST -> week starts Monday 16 Nov 2026 00:00 IST (= 15 Nov 18:30 UTC).
assert.equal(new Date(weekStart(Date.parse('2026-11-18T04:30:00Z'))).toISOString(), '2026-11-15T18:30:00.000Z');
// Monday 00:10 IST belongs to the new week; Sunday 23:50 IST to the old one.
assert.equal(new Date(weekStart(Date.parse('2026-11-15T18:40:00Z'))).toISOString(), '2026-11-15T18:30:00.000Z');
assert.equal(new Date(weekStart(Date.parse('2026-11-15T18:20:00Z'))).toISOString(), '2026-11-08T18:30:00.000Z');

// ---------------------------------------------------------------- store
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'acx-blog-'));
  process.chdir(dir);
  process.env.ACAD_STORAGE = 'file';
  delete process.env.DB_HOST;
  const b = await import('../lib/server/blog');
  const body = 'This white paper looks at how Indian universities recruit assistant professors under the 2018 UGC regulations. '.repeat(3);

  // Drafts are private.
  const d1 = await b.savePost({ title: 'Faculty Hiring in India: 2026', body, type: 'white_paper', status: 'draft' });
  assert.equal(d1.slug, 'faculty-hiring-in-india-2026');
  assert.equal(d1.status, 'draft');
  assert.equal((await b.livePosts()).length, 0, 'draft is not public');
  assert.equal(await b.livePostBySlug(d1.slug), null);
  assert(d1.summary.startsWith('This white paper looks'), 'summary falls back to the first words');

  // Publishing needs content.
  await assert.rejects(b.savePost({ title: 'Empty', body: 'Too short', status: 'published' }), /Write the article/);
  await assert.rejects(b.savePost({ title: '  ', body, status: 'draft' }), /title/);

  // Publish now -> public.
  const p1 = await b.savePost({ id: d1.id, status: 'published' });
  assert.equal(postState(p1), 'published');
  assert(p1.firstPublishedAt);
  assert.equal((await b.livePostBySlug('faculty-hiring-in-india-2026'))?.id, d1.id);

  // The address stays fixed after publishing when the title changes; a second post with the same title gets "-2".
  const p1b = await b.savePost({ id: d1.id, title: 'Faculty hiring in India: the 2026 picture' });
  assert.equal(p1b.slug, 'faculty-hiring-in-india-2026');
  const p2 = await b.savePost({ title: 'Faculty Hiring in India: 2026', body, status: 'draft' });
  assert.equal(p2.slug, 'faculty-hiring-in-india-2026-2');

  // Scheduled posts stay hidden until their time.
  const later = new Date(Date.now() + 2 * 86400_000).toISOString();
  const s1 = await b.savePost({ title: 'Next week: PhD norms explained', body, type: 'guide', status: 'published', publishAt: later });
  assert.equal(postState(s1), 'scheduled');
  assert(!(await b.livePosts()).some(p => p.id === s1.id), 'scheduled post hidden');
  await assert.rejects(b.savePost({ title: 'Bad date', body, status: 'published', publishAt: 'not a date' }), /Invalid publish date/);

  // Unpublish -> draft again (hidden), and only one post can be featured.
  await b.savePost({ id: p1.id, status: 'draft' });
  assert.equal(await b.livePostBySlug(p1.slug), null);
  await b.savePost({ id: p1.id, status: 'published', featured: true });
  await b.savePost({ id: p2.id, featured: true });
  assert.deepEqual((await b.listPosts()).filter(p => p.featured).map(p => p.id), [p2.id]);

  // Tags: trimmed, de-duplicated, max 8.
  const t = await b.savePost({ id: p2.id, tags: ' UGC , UGC, PhD,  ,a,b,c,d,e,f,g' });
  assert.deepEqual(t.tags, ['UGC', 'PhD', 'a', 'b', 'c', 'd', 'e', 'f']);
  await assert.rejects(b.savePost({ id: 'post-nope', title: 'x' }), /not found/);

  // Files: real type checked by content, size limits, safe names only.
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(100)]);
  const pdf = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(100)]);
  const img = await b.storeFile(png);
  const doc = await b.storeFile(pdf);
  assert.match(img.file, /^b-[a-z0-9-]+\.png$/);
  assert.equal(doc.mime, 'application/pdf');
  await assert.rejects(b.storeFile(Buffer.from('<html><script>')), /PNG, JPG or WebP/);
  await assert.rejects(b.storeFile(Buffer.concat([png, Buffer.alloc(b.MAX_IMAGE_BYTES)])), /2 MB/);
  assert.equal(await b.readFile('../../etc/passwd'), null);
  assert.equal(await b.readFile('b-x.html'), null);
  assert((await b.readFile(img.file))!.length > 0);

  // A post can only point at a cover image / PDF of the right kind.
  const withFiles = await b.savePost({ id: p2.id, coverFile: img.file, pdfFile: doc.file, pdfName: 'Hiring 2026.pdf', pdfSize: 109 });
  assert.equal(withFiles.coverFile, img.file);
  assert.equal(withFiles.pdfFile, doc.file);
  const wrong = await b.savePost({ id: p2.id, coverFile: doc.file, pdfFile: '../../secret.pdf' });
  assert.equal(wrong.coverFile, undefined, 'a PDF cannot be a cover');
  assert.equal(wrong.pdfFile, undefined, 'bad file names refused');

  // A PDF-only white paper can be published with little text.
  const pdfOnly = await b.savePost({ title: 'Annual report (PDF)', body: '', pdfFile: (await b.storeFile(pdf)).file, type: 'report', status: 'published' });
  assert.equal(postState(pdfOnly), 'published');

  // Deleting a post removes its files.
  const keep = await b.storeFile(png);
  const withCover = await b.savePost({ title: 'To delete', body, coverFile: keep.file, status: 'draft' });
  assert(await b.readFile(keep.file));
  assert.equal(await b.deletePost(withCover.id), true);
  assert.equal(await b.readFile(keep.file), null, 'cover removed with the post');
  assert.equal(await b.deletePost(withCover.id), false);

  fs.rmSync(dir, { recursive: true, force: true });
  console.log('blog: all checks passed');
})().catch(e => { console.error(e); process.exit(1); });
