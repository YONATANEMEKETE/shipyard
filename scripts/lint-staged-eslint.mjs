import { execFileSync } from 'node:child_process';
import path from 'node:path';

const files = process.argv.slice(2);
const workspaces = [
  { directory: 'apps/web', packageName: '@shipyard/web' },
  { directory: 'apps/api', packageName: '@shipyard/api' },
  { directory: 'packages/shared', packageName: '@shipyard/shared' },
];

const groups = new Map(
  workspaces.map((workspace) => [workspace.packageName, []]),
);

for (const file of files) {
  const relativePath = path.relative(process.cwd(), path.resolve(file));
  const workspace = workspaces.find(
    ({ directory }) =>
      relativePath === directory ||
      relativePath.startsWith(`${directory}${path.sep}`),
  );

  if (workspace) {
    groups
      .get(workspace.packageName)
      .push(path.relative(workspace.directory, relativePath));
  }
}

const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

for (const [packageName, workspaceFiles] of groups) {
  if (workspaceFiles.length === 0) continue;

  execFileSync(
    pnpmCommand,
    ['--filter', packageName, 'exec', 'eslint', '--fix', ...workspaceFiles],
    { stdio: 'inherit' },
  );
}
