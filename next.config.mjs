import { execSync } from 'node:child_process';

/**
 * Which commit this build was made from.
 *
 * Read once, here, and baked in — a built app has no git to ask and no
 * business shelling out at runtime. It answers one question, which comes up
 * every time something is checked on a machine that is not this one: is the
 * thing I am looking at the thing that was just built?
 *
 * Unknown rather than a crash when there is no git: a build from a tarball is
 * a perfectly good build, and refusing to make one over a missing label would
 * be absurd.
 */
function commit() {
  if (process.env.BUILD_COMMIT) return process.env.BUILD_COMMIT;
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: { BUILD_COMMIT: commit() },

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
