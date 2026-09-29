/**
 * Lets the test files import the app's TypeScript modules directly.
 *
 * The app is written for a bundler, so its imports are extensionless and use
 * the `@/` alias. Node's ESM resolver understands neither. This hook fills both
 * gaps; `--experimental-strip-types` then handles the TypeScript itself.
 *
 * `registerHooks` rather than `register`: the latter is deprecated, and loads
 * the hooks onto a thread of their own, which this resolver has no use for —
 * it only looks at file paths. These run in this thread and must therefore be
 * synchronous, which they already were in everything but their signature.
 */
import { registerHooks } from 'node:module';
import { resolve } from './ts-resolver-hooks.mjs';

registerHooks({ resolve });
