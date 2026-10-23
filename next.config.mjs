/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Loaded from node_modules at runtime instead of being bundled (the PDF reader loads its worker dynamically).
  serverExternalPackages: ['unpdf'],
};

export default nextConfig;
