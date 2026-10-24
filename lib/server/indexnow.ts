import { SITE_URL } from '@/lib/site';

/*
 * IndexNow (Bing, Yandex, Seznam, Naver…): tells participating search engines that public URLs changed.
 * Off unless INDEXNOW_KEY is set (8–128 letters, digits or dashes). Google does not use IndexNow.
 */
export async function pingIndexNow(paths: string[]): Promise<void> {
  const key = process.env.INDEXNOW_KEY;
  if (!key || !/^[a-zA-Z0-9-]{8,128}$/.test(key) || !paths.length) return;
  const host = new URL(SITE_URL).host;
  try {
    await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ host, key, keyLocation: `${SITE_URL}/${key}.txt`, urlList: [...new Set(paths)].slice(0, 1000).map(p => `${SITE_URL}${p}`) }),
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    /* best effort */
  }
}
