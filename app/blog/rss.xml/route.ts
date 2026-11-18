import { livePosts } from '@/lib/server/blog';
import { postUrl, typeLabel } from '@/lib/blog';
import { SITE_URL } from '@/lib/site';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const x = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** RSS feed of the latest 30 posts, for feed readers and newsletter tools. */
export async function GET() {
  const posts = (await livePosts()).slice(0, 30);
  const items = posts.map(p => `
    <item>
      <title>${x(p.title)}</title>
      <link>${SITE_URL}${postUrl(p)}</link>
      <guid isPermaLink="true">${SITE_URL}${postUrl(p)}</guid>
      <pubDate>${new Date(p.publishAt!).toUTCString()}</pubDate>
      <category>${x(typeLabel(p.type))}</category>
      <dc:creator>${x(p.author)}</dc:creator>
      <description>${x(p.summary)}</description>
    </item>`).join('');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>AcadeXMatch blog</title>
    <link>${SITE_URL}/blog</link>
    <atom:link href="${SITE_URL}/blog/rss.xml" rel="self" type="application/rss+xml" />
    <description>Articles, white papers, reports and guides on academic hiring in India.</description>
    <language>en-in</language>${posts[0] ? `\n    <lastBuildDate>${new Date(posts[0].publishAt!).toUTCString()}</lastBuildDate>` : ''}${items}
  </channel>
</rss>`;
  return new Response(xml, { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8', 'Cache-Control': 'public, max-age=600' } });
}
