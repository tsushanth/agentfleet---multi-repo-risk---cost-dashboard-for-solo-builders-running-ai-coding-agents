'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Field separator unlikely to appear in commit metadata, used to split `git log` output.
const FIELD_SEP = '\x1f';

function loadRepoConfig(configPath) {
  const absConfigPath = path.resolve(configPath);
  const raw = fs.readFileSync(absConfigPath, 'utf8');
  const data = JSON.parse(raw);
  const baseDir = path.dirname(absConfigPath);
  return data.repos.map((r) => ({
    name: r.name,
    path: path.resolve(baseDir, r.path),
  }));
}

function parseSinceWindow(since) {
  const match = /^(\d+)d$/.exec(since || '');
  if (!match) {
    throw new Error(`Unsupported --since value: "${since}" (expected e.g. "7d", "30d")`);
  }
  return `${match[1]} days ago`;
}

function git(repoPath, args) {
  return execFileSync('git', args, { cwd: repoPath, encoding: 'utf8' });
}

function getCommitsSince(repoPath, since) {
  const sinceArg = parseSinceWindow(since);
  const format = `%H${FIELD_SEP}%an${FIELD_SEP}%aI${FIELD_SEP}%s`;
  const log = git(repoPath, ['log', `--since=${sinceArg}`, `--date=iso-strict`, `--pretty=format:${format}`]);
  if (!log.trim()) return [];
  return log
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [hash, author, date, subject] = line.split(FIELD_SEP);
      return { hash, author, date, subject };
    });
}

function getCommitDiff(repoPath, hash) {
  return git(repoPath, ['show', hash, '--unified=3', '--no-color']);
}

module.exports = { loadRepoConfig, getCommitsSince, getCommitDiff, parseSinceWindow };
