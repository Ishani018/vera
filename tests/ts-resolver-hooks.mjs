import { existsSync } from 'node:fs';
import { dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolvePath(dirname(fileURLToPath(import.meta.url)), '..');

function candidates(specifier, parentURL) {
  const base = specifier.startsWith('@/')
    ? resolvePath(ROOT, specifier.slice(2))
    : specifier.startsWith('.') && parentURL
      ? resolvePath(dirname(fileURLToPath(parentURL)), specifier)
      : null;
  if (!base) return [];
  return [`${base}.ts`, `${base}.tsx`, resolvePath(base, 'index.ts')];
}

// Synchronous because `registerHooks` runs it in the caller's thread. It never
// awaited anything, so this costs nothing.
export function resolve(specifier, context, nextResolve) {
  if (!specifier.endsWith('.ts') && !specifier.endsWith('.tsx')) {
    for (const candidate of candidates(specifier, context.parentURL)) {
      if (existsSync(candidate)) {
        // No `format`: Node infers TypeScript from the .ts extension, which is
        // what makes --experimental-strip-types kick in.
        return { url: pathToFileURL(candidate).href, shortCircuit: true };
      }
    }
  }
  return nextResolve(specifier, context);
}
