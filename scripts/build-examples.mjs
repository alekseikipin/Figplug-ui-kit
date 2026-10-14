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

// tsc -p <project>, with the project path always one argument. The local TypeScript runs on this
// Node; a global tsc from PATH runs directly, except on Windows, where it is tsc.cmd and needs the
// shell: then it is one command string with the path quoted, never an args list joined unquoted.
function tsc(project) {
  const options = { cwd: root, stdio: 'inherit' };
  if (existsSync(local)) return spawnSync(process.execPath, [local, '-p', project], options);
  if (process.platform !== 'win32') return spawnSync('tsc', ['-p', project], options);
  if (/["%]/.test(project)) return { status: 1, error: { code: 'a " or % in the folder name, which cmd.exe cannot quote' } };
  return spawnSync(`tsc -p "${project}"`, { ...options, shell: true });
}

const dirs = existsSync(examples)
  ? readdirSync(examples, { withFileTypes: true })
      .filter((d) => d.isDirectory() && existsSync(path.join(examples, d.name, 'tsconfig.json')))
      .map((d) => d.name).sort()
  : [];
let failed = 0;
for (const name of dirs) {
  const project = path.join('examples', name);
  const run = tsc(project);
  if (run.error) console.error(`build-examples: could not run tsc for ${project} (${run.error.code ?? run.error.message}); run npm install first`);
  if (run.status !== 0) failed += 1;
}
console.log(dirs.length === 0 ? 'build-examples: no examples/ folders, nothing to build' : `build-examples: ${dirs.length - failed} of ${dirs.length} example(s) compiled`);
process.exit(failed ? 1 : 0);
