/**
 * Lets the test files import the app's TypeScript modules directly.
 *
 * The app is written for a bundler, so its imports are extensionless and use
 * the `@/` alias. Node's ESM resolver understands neither. This hook fills both
 * gaps; `--experimental-strip-types` then handles the TypeScript itself.
 */
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

register('./ts-resolver-hooks.mjs', pathToFileURL('./tests/'));
