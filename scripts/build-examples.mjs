// Compiles every examples/<name>/code.ts that exists (each folder has its own tsconfig.json).
// Separate from `npm run build` on purpose: deleting examples/ when you start your own plugin
// must not break the build of your plugin.
import { existsSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const examples = path.join(root, 'examples');
const local = path.join(root, 'node_modules', 'typescript', 'bin', 'tsc');
const tsc = existsSync(local) ? [process.execPath, local] : ['tsc'];

const dirs = existsSync(examples)
  ? readdirSync(examples, { withFileTypes: true })
      .filter((d) => d.isDirectory() && existsSync(path.join(examples, d.name, 'tsconfig.json')))
      .map((d) => d.name).sort()
  : [];
let failed = 0;
for (const name of dirs) {
  const run = spawnSync(tsc[0], [...tsc.slice(1), '-p', path.join('examples', name)], { cwd: root, stdio: 'inherit', shell: tsc.length === 1 });
  if (run.status !== 0) failed += 1;
}
console.log(dirs.length === 0 ? 'build-examples: no examples/ folders, nothing to build' : `build-examples: ${dirs.length - failed} of ${dirs.length} example(s) compiled`);
process.exit(failed ? 1 : 0);
