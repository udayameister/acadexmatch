/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Loaded from node_modules at runtime instead of being bundled (PDF reader worker, MySQL driver).
  serverExternalPackages: ['unpdf', 'mysql2'],
};

export default nextConfig;
