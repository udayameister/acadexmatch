/** @type {import('next').NextConfig} */

// Private areas: never indexed, even if a link to them leaks (see also lib/site.ts and app/robots.ts).
const NOINDEX = ['/admin/:path*', '/admin', '/candidate/:path*', '/institute/:path*', '/account', '/account/:path*', '/unsubscribe', '/invoice/:path*', '/offer/:path*',
  '/scraper', '/login', '/register', '/forgot-password', '/reset-password', '/verify-email', '/api/:path*'];

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Loaded from node_modules at runtime instead of being bundled (PDF reader worker, MySQL driver).
  serverExternalPackages: ['unpdf', 'mysql2'],
  async headers() {
    return [
      { source: '/:path*', headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        // No framing of the site (clickjacking), HTTPS only in production, no camera/mic/location access.
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Content-Security-Policy', value: "frame-ancestors 'none'; base-uri 'self'" },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ...(process.env.NODE_ENV === 'production' ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000' }] : []),
      ] },
      ...NOINDEX.map(source => ({ source, headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }] })),
    ];
  },
  async rewrites() {
    // IndexNow key file must live at the site root: /<key>.txt (served only when it matches INDEXNOW_KEY).
    return [{ source: '/:key([a-zA-Z0-9-]{8,128}).txt', destination: '/api/indexnow-key/:key' }];
  },
};

export default nextConfig;
