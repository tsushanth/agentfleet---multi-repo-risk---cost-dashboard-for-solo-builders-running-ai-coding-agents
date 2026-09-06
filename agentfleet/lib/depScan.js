'use strict';

const MANIFEST_FILES = [
  'package.json',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'requirements.txt',
  'Pipfile.lock',
  'Gemfile.lock',
  'Cargo.lock',
  'go.mod',
  'go.sum',
];

function isManifestFile(filePath) {
  const base = filePath.split('/').pop();
  return MANIFEST_FILES.includes(base);
}

// Top-level package.json metadata keys that happen to look like
// `"key": "value"` but aren't dependencies — excluded so a version bump or
// description edit isn't reported as a dependency change.
const NON_DEPENDENCY_KEYS = new Set([
  'name', 'version', 'description', 'main', 'license', 'author', 'private',
  'type', 'homepage', 'repository', 'bugs', 'keywords',
]);

// Detects that a manifest/lockfile changed, and for package.json specifically
// tries to pair up a removed `"name": "version"` line with the added one that
// replaces it so the digest can show a from -> to version bump.
function scanDependencyChanges(diffText) {
  const lines = diffText.split('\n');
  let currentFile = null;
  const filesChanged = new Set();
  const dependencyChanges = [];
  const removedVersions = new Map();

  for (const line of lines) {
    const fileMatch = /^\+\+\+ b\/(.+)$/.exec(line);
    if (fileMatch) {
      currentFile = fileMatch[1];
      continue;
    }
    if (!currentFile || !isManifestFile(currentFile)) continue;
    if (line.startsWith('+++') || line.startsWith('---')) continue;
    if (!line.startsWith('+') && !line.startsWith('-')) continue;

    filesChanged.add(currentFile);

    if (!currentFile.endsWith('package.json')) continue;
    const depLineMatch = /^([+-])\s*"([^"]+)"\s*:\s*"([^"]+)"/.exec(line);
    if (!depLineMatch) continue;
    const [, sign, name, version] = depLineMatch;
    if (NON_DEPENDENCY_KEYS.has(name)) continue;
    if (sign === '-') {
      removedVersions.set(name, version);
    } else {
      const from = removedVersions.get(name) || null;
      dependencyChanges.push({ name, from, to: version });
    }
  }

  return {
    manifestChanged: filesChanged.size > 0,
    files: Array.from(filesChanged),
    dependencyChanges,
  };
}

module.exports = { scanDependencyChanges, MANIFEST_FILES, isManifestFile };
