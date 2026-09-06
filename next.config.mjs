/** @type {import('next').NextConfig} */
const nextConfig = {
  // puppeteer-core and @sparticuz/chromium must stay external to the server bundle:
  // they resolve native binaries at runtime and cannot be traced/bundled.
  serverExternalPackages: ['puppeteer-core', '@sparticuz/chromium'],
};

export default nextConfig;
