/** @type {import('next').NextConfig} */
const nextConfig = {

  // puppeteer-core and @sparticuz/chromium must stay external to the server bundle:
  // they resolve native binaries at runtime and cannot be traced/bundled.
  serverExternalPackages: ['puppeteer-core', '@sparticuz/chromium'],

  // The export routes read the Paged.js polyfill off disk rather than importing
  // it, so tracing has to be told about it or it will not be deployed.
  outputFileTracingIncludes: {
    '/api/export/interior': ['./node_modules/pagedjs/dist/paged.polyfill.js'],
    '/api/export/cover': ['./node_modules/pagedjs/dist/paged.polyfill.js'],
  },
};

export default nextConfig;
