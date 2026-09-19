#!/usr/bin/env node
/**
 * Regenerates `THIRD_PARTY_NOTICES.md` from the installed dependency manifests.
 *
 * Why this file exists: permissive licences (MIT, ISC, BSD, Apache-2.0), weak copyleft licences
 * (MPL-2.0, LGPL-3.0) and the SIL Open Font License all require their copyright notice and licence
 * text to travel with copies of the software. A copy is distributed whenever a release archive, a
 * container image, or a self-hosted instance is handed to someone else — so the notices have to
 * ship with the application, not live only in the repository.
 *
 * What it does: asks the package manager which licences the installed tree declares, groups the
 * packages by licence expression, reads each package's own copyright line out of the licence file
 * it ships, fetches the canonical text of each licence from the SPDX licence list, and writes one
 * file. Prettier formats the result so the generated file passes `pnpm format:check` without a
 * follow-up edit.
 *
 * Notes:
 * - The reproduced licence texts are never edited; a template placeholder such as
 *   `<year> <copyright holders>` is left as published, and the real notices are the per-package
 *   copyright lines listed above each text.
 * - No timestamp is written, so regenerating an unchanged tree produces an unchanged file.
 * - Licence texts are fetched at generation time; run this with network access.
 * - The web app's typefaces are not npm dependencies (`next/font` downloads and self-hosts them at
 *   build time), so they are declared by hand in `BUNDLED_FONTS` below.
 */
import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const OUTPUT_FILE = path.join(REPO_ROOT, 'THIRD_PARTY_NOTICES.md');
const SPDX_TEXT_BASE =
  'https://raw.githubusercontent.com/spdx/license-list-data/main/text';

/** Files a package may ship its licence in, in the order they are worth reading. */
const LICENSE_FILE_NAMES = [
  'LICENSE',
  'LICENSE.md',
  'LICENSE.txt',
  'license',
  'license.md',
  'COPYING',
  'COPYING.md',
  'NOTICE',
];

/** Placeholders SPDX uses in licence templates, so a reader is told they are not an oversight. */
const TEMPLATE_PLACEHOLDER = /<(?:year|copyright holders|owner|organization)>/;

/**
 * Typefaces bundled into the web app by `next/font`. Used unmodified, so the OFL clause about
 * Reserved Font Names does not apply.
 */
const BUNDLED_FONTS = [
  {
    font: 'Inter',
    copyright:
      'Copyright (c) 2016 The Inter Project Authors (https://github.com/rsms/inter)',
    license: 'OFL-1.1',
  },
  {
    font: 'Geist and Geist Mono',
    copyright:
      'Copyright (c) 2023 Vercel, in collaboration with basement.studio',
    license: 'OFL-1.1',
  },
];

/**
 * Licences whose text has to travel alongside another one. LGPL-3.0 is written as a supplement to
 * the GNU GPL version 3, so both texts are included when an LGPL-3.0 package is present.
 */
const COMPANION_LICENSES = {
  'LGPL-3.0-or-later': ['GPL-3.0-only'],
  'LGPL-3.0-only': ['GPL-3.0-only'],
};

async function readLicenseTree() {
  // npm_execpath is set by the package manager when this runs as a package script — it keeps the
  // script working in environments where `pnpm` itself is not on PATH.
  const packageManagerCli = process.env.npm_execpath;
  const command = packageManagerCli ? process.execPath : 'pnpm';
  const prefix = packageManagerCli ? [packageManagerCli] : [];

  const { stdout } = await execFileAsync(
    command,
    [...prefix, '-r', 'licenses', 'list', '--json'],
    { cwd: REPO_ROOT, maxBuffer: 64 * 1024 * 1024 },
  );

  // Licence texts inside the manifest metadata contain raw control characters that JSON.parse
  // rejects; they are irrelevant for name/version/licence extraction, so strip them first.
  // eslint-disable-next-line no-control-regex
  return JSON.parse(stdout.replace(/[\u0000-\u001f]/g, ' '));
}

/**
 * Reads the copyright line a package declares in its own licence file. This is the notice the
 * licences require to travel with a copy; packages that declare none simply have no line.
 */
async function readCopyrightLine(packagePath) {
  for (const name of LICENSE_FILE_NAMES) {
    let contents;
    try {
      contents = await readFile(path.join(packagePath, name), 'utf8');
    } catch {
      continue;
    }

    const line = contents
      .slice(0, 4000)
      .split('\n')
      .map((entry) => entry.trim().replace(/\s+/g, ' '))
      .find((entry) => entry.length > 0 && /copyright/i.test(entry));

    if (line) {
      return line.length > 120 ? `${line.slice(0, 117)}...` : line;
    }
  }

  return undefined;
}

/**
 * Splits an SPDX licence expression into the identifiers whose texts have to travel with it.
 * `A OR B` (dual licensed — the recipient may pick) and `A AND B` (both apply) both end up needing
 * every named text; a `WITH <exception>` clause keeps the base licence and is visible in the
 * bucket heading itself.
 */
function parseLicenseExpression(expression) {
  return expression
    .replace(/[()]/g, '')
    .split(/\s+(?:AND|OR)\s+/i)
    .map((part) => part.split(/\s+WITH\s+/i)[0].trim())
    .filter(Boolean);
}

async function fetchLicenseText(identifier) {
  const response = await fetch(`${SPDX_TEXT_BASE}/${identifier}.txt`);
  if (!response.ok) {
    throw new Error(
      `Could not fetch the text for ${identifier} (${response.status}). ` +
        'Check the SPDX identifier in the dependency manifest.',
    );
  }
  return (await response.text()).trimEnd();
}

function buildSummaryRows(buckets) {
  return [...buckets.entries()]
    .sort((a, b) => b[1].size - a[1].size)
    .map(([expression, packages]) => `| ${expression} | ${packages.size} |`);
}

function buildPackageSections(buckets) {
  return [...buckets.entries()]
    .sort((a, b) => b[1].size - a[1].size)
    .map(([expression, packages]) => {
      const entries = [...packages.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([id, copyright]) =>
          copyright ? `- \`${id}\` — ${copyright}` : `- \`${id}\``,
        );
      const label = packages.size === 1 ? 'package' : 'packages';
      return `### ${expression} — ${packages.size} ${label}\n\n${entries.join(
        '\n',
      )}`;
    });
}

function buildLicenseTextSections(texts, owners) {
  return [...texts.keys()].sort().map((identifier) => {
    const usedBy = [...(owners.get(identifier) ?? [])].sort();
    const parts = [`### ${identifier}\n`];

    if (identifier in COMPANION_LICENSES) {
      parts.push(
        `This text is included because ${identifier} is written as a supplement to it.\n`,
      );
    }

    if (usedBy.length > 0) {
      const sample = usedBy
        .slice(0, 3)
        .map((entry) => `\`${entry}\``)
        .join(', ');
      const label = usedBy.length === 1 ? 'package' : 'packages';
      parts.push(
        `Declared by ${usedBy.length} ${label}, including ${sample}.\n`,
      );
    }

    if (TEMPLATE_PLACEHOLDER.test(texts.get(identifier))) {
      parts.push(
        'The reproduced text is the template SPDX publishes; the copyright notices for the ' +
          'packages that use it are the lines listed with each package above.\n',
      );
    }

    return `${parts.join('\n')}\n\`\`\`text\n${texts.get(identifier)}\n\`\`\``;
  });
}

async function main() {
  const licenseTree = await readLicenseTree();

  const buckets = new Map();
  let packageCount = 0;

  for (const [expression, entries] of Object.entries(licenseTree)) {
    const bucket = buckets.get(expression) ?? new Map();
    for (const entry of entries) {
      // One copyright line per package name: the copied licences are identical across versions.
      const copyright = entry.paths?.[0]
        ? await readCopyrightLine(entry.paths[0])
        : undefined;
      for (const version of entry.versions ?? []) {
        bucket.set(`${entry.name}@${version}`, copyright);
        packageCount += 1;
      }
    }
    buckets.set(expression, bucket);
  }

  // One text per distinct SPDX identifier, plus any companion licences it references.
  const identifiers = new Set(['OFL-1.1']);
  for (const expression of buckets.keys()) {
    for (const identifier of parseLicenseExpression(expression)) {
      identifiers.add(identifier);
      for (const companion of COMPANION_LICENSES[identifier] ?? []) {
        identifiers.add(companion);
      }
    }
  }

  const texts = new Map();
  for (const identifier of identifiers) {
    texts.set(identifier, await fetchLicenseText(identifier));
  }

  // Which packages pull each licence in, so a text can name a few of them.
  const owners = new Map();
  const addOwners = (identifier, packages) => {
    const set = owners.get(identifier) ?? new Set();
    for (const id of packages.keys()) set.add(id);
    owners.set(identifier, set);
  };

  for (const [expression, packages] of buckets) {
    for (const identifier of parseLicenseExpression(expression)) {
      addOwners(identifier, packages);
    }
  }

  // Companion licences inherit the packages that reference them.
  for (const [identifier, companions] of Object.entries(COMPANION_LICENSES)) {
    for (const companion of companions) {
      addOwners(companion, buckets.get(identifier) ?? new Map());
    }
  }

  const markdown = [
    '# Third-party notices',
    '',
    'Shipyard itself is licensed under the MIT License — see [`LICENSE`](LICENSE). This file covers',
    "the other people's software and assets Shipyard uses, and the licences they are used under.",
    '',
    'Licences such as MIT, Apache-2.0, BSD and the SIL Open Font License require their copyright',
    'notice and licence text to travel with copies of the software. Handing someone a copy includes',
    'publishing a release archive, building a container image, or running a self-hosted instance for',
    'other people — so these notices ship with those artefacts.',
    '',
    'Every package appears with the copyright line it declares in its own licence file, followed by',
    'the full text of each licence in use. Generated from the installed dependency manifests — do not',
    'edit by hand. After any dependency change, regenerate and commit:',
    '',
    '```bash',
    'pnpm licenses:notices',
    '```',
    '',
    '## Summary',
    '',
    '| Licence | Packages |',
    '| --- | ---: |',
    ...buildSummaryRows(buckets),
    `| **Total** | **${packageCount}** |`,
    '',
    '## Packages by licence',
    '',
    ...buildPackageSections(buckets).map((section) => `${section}\n`),
    '## Bundled fonts',
    '',
    'The web app loads its typefaces through `next/font`, which downloads and self-hosts the font',
    'files into the build, so they are distributed with the application instead of being declared as',
    'a dependency.',
    '',
    '| Font | Copyright | Licence |',
    '| --- | --- | --- |',
    ...BUNDLED_FONTS.map(
      ({ font, copyright, license }) =>
        `| ${font} | ${copyright} | ${license} |`,
    ),
    '',
    'Both typefaces are used unmodified, so the Reserved Font Name clause of the SIL Open Font',
    'License does not apply.',
    '',
    '## Licence texts',
    '',
    'Texts are reproduced as published by SPDX and are never edited; where a template placeholder',
    'appears, the actual notices are the per-package lines above.',
    '',
    ...buildLicenseTextSections(texts, owners).map((section) => `${section}\n`),
  ].join('\n');

  const prettier = await import('prettier');
  const prettierConfig = (await prettier.resolveConfig(OUTPUT_FILE)) ?? {};
  const formatted = await prettier.format(markdown, {
    ...prettierConfig,
    parser: 'markdown',
  });

  await writeFile(OUTPUT_FILE, formatted, 'utf8');

  console.log(
    `Wrote ${path.relative(REPO_ROOT, OUTPUT_FILE)} — ${packageCount} packages, ` +
      `${buckets.size} licence expressions, ${texts.size} licence texts.`,
  );
}

await main();
