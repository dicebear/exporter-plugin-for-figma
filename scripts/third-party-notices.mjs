/**
 * Collects the license notices of every package the plugin ships, so the
 * About dialog can show them. The bundles strip license comments, and the
 * MIT and BSD licenses ask for the notice to travel with every copy.
 *
 * Writes src/ui/generated/third-party-notices.json from the production
 * dependency tree. Runs before every build and can be run on its own with
 * `npm run notices`.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const output = join(root, 'src/ui/generated/third-party-notices.json');

const tree = JSON.parse(
  execFileSync('npm', ['ls', '--omit=dev', '--all', '--json', '--long'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  }),
);

const packages = new Map();

function walk(dependencies) {
  for (const [name, info] of Object.entries(dependencies ?? {})) {
    if (info.version && !packages.has(`${name}@${info.version}`)) {
      packages.set(`${name}@${info.version}`, { name, version: info.version, path: info.path });
    }

    walk(info.dependencies);
  }
}

walk(tree.dependencies);

function licenseFile(dir) {
  if (!dir || !existsSync(dir)) {
    return null;
  }

  const file = readdirSync(dir).find((entry) => /^(licen[cs]e|copying)(\.|$)/i.test(entry));

  return file ? readFileSync(join(dir, file), 'utf8').trim() : null;
}

const notices = [...packages.values()]
  .map(({ name, version, path }) => {
    const manifest = JSON.parse(readFileSync(join(path, 'package.json'), 'utf8'));
    const license = typeof manifest.license === 'string' ? manifest.license : (manifest.license?.type ?? 'unknown');
    const author =
      typeof manifest.author === 'string' ? manifest.author : manifest.author?.name ? manifest.author.name : null;
    const text = licenseFile(path);

    return { name, version, license, author, text };
  })
  .sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));

const missing = notices.filter((notice) => !notice.text);

if (missing.length > 0) {
  console.warn(`No license file for ${missing.map((n) => `${n.name}@${n.version}`).join(', ')}.`);
}

// Many packages ship the same license text word for word, so each distinct
// text is stored once and the packages point at it.
const texts = [];
const indexOf = new Map();

const packagesOut = notices.map(({ text, ...rest }) => {
  if (text === null) {
    return { ...rest, text: null };
  }

  if (!indexOf.has(text)) {
    indexOf.set(text, texts.length);
    texts.push(text);
  }

  return { ...rest, text: indexOf.get(text) };
});

mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, JSON.stringify({ texts, packages: packagesOut }, null, 2) + '\n');
console.log(`Wrote ${packagesOut.length} notices with ${texts.length} distinct license texts to ${output}.`);
