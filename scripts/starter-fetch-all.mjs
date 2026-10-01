import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { CATEGORIES } from '../lib/graphics/policy.ts';

/**
 * The whole starter collection, in one go.
 *
 * The same curated list the in-app browser offers as chips, run through the
 * same fetcher, one pack per category — so what somebody gets from the command
 * line and what they get from the Browse screen are the same pictures chosen by
 * the same rules.
 *
 *   npm run starter:fetch-all            # all six, 12 each, from Commons
 *   npm run starter:fetch-all 20         # 20 each
 *   npm run starter:fetch-all 12 smithsonian
 *
 * It is a shell round `starter:fetch` rather than a second copy of it: each
 * category is one run of that script, which means one set of rules, one rate
 * limit, one refusal message. A category that already has a folder is left
 * alone, so running it twice does not re-download what you have.
 *
 * Nothing it writes belongs in git. The downloaded packs are ignored by
 * `.gitignore`; what is committed is this list and the code that fetches it.
 */

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const grey = (s) => `\u001b[2m${s}\u001b[0m`;
const red = (s) => `\u001b[31m${s}\u001b[0m`;
const green = (s) => `\u001b[32m${s}\u001b[0m`;

const count = Number(process.argv[2] ?? 12);
const source = process.argv[3] ?? 'commons';
if (!Number.isInteger(count) || count < 1 || count > 100) {
  console.error(red(`"${process.argv[2]}" is not a number of items between 1 and 100.`));
  process.exit(1);
}

const run = (args) =>
  execFileSync(
    process.execPath,
    [
      '--experimental-strip-types',
      '--disable-warning=MODULE_TYPELESS_PACKAGE_JSON',
      '--import',
      './tests/ts-resolver.mjs',
      'scripts/starter-fetch.mjs',
      ...args,
    ],
    { cwd: ROOT, encoding: 'utf8', stdio: 'pipe' },
  );

console.log(
  `Fetching ${CATEGORIES.length} packs from ${grey(source)}, up to ${count} each.\n` +
    grey('One category at a time, at the rate the service asks for.\n'),
);

const done = [];
const skipped = [];
const failed = [];

for (const category of CATEGORIES) {
  const pack = category.label.toLowerCase();
  const folder = join(ROOT, 'starter', pack);
  if (existsSync(folder) && readdirSync(folder).length) {
    skipped.push(`${pack} (already here)`);
    console.log(`${grey('·')} ${pack} — already here, left alone`);
    continue;
  }
  process.stdout.write(`${grey('…')} ${pack} — ${category.query}\n`);
  try {
    const output = run([source, category.query, String(count), pack]);
    const kept = (output.match(/^\s+kept /gm) ?? []).length;
    done.push(`${pack} (${kept})`);
    console.log(`${green('✓')} ${pack} — ${kept} kept`);
  } catch (error) {
    const said = `${error.stdout ?? ''}${error.stderr ?? ''}`.trim().split('\n').pop() ?? error.message;
    failed.push(`${pack}: ${said}`);
    console.log(`${red('✗')} ${pack} — ${said}`);
    // A service saying "slow down" or "no" is about the next one too.
    if (/rate|429|403|401|key/i.test(said)) {
      console.log(red('\nStopping: the service is refusing. Nothing else is asked for.'));
      break;
    }
  }
}

// Built when anything is there to build, not only when something was just
// fetched: somebody who runs this twice wants the zips either way.
if (done.length || skipped.length) {
  console.log(grey('\nBuilding the zips…\n'));
  try {
    console.log(
      execFileSync(
        process.execPath,
        [
          '--experimental-strip-types',
          '--disable-warning=MODULE_TYPELESS_PACKAGE_JSON',
          '--import',
          './tests/ts-resolver.mjs',
          'scripts/starter-build.mjs',
        ],
        { cwd: ROOT, encoding: 'utf8' },
      ),
    );
  } catch (error) {
    console.log(`${error.stdout ?? ''}${error.stderr ?? ''}`);
    console.log(red('The build refused something. Read the report above — nothing was zipped for it.'));
    process.exitCode = 1;
  }
}

console.log(
  `\n${done.length} fetched${done.length ? `: ${done.join(', ')}` : ''}` +
    (skipped.length ? `\n${skipped.length} left alone: ${skipped.join(', ')}` : '') +
    (failed.length ? `\n${red(`${failed.length} failed:`)} ${failed.join(' · ')}` : ''),
);
if (failed.length && !done.length) process.exitCode = 1;
