#!/usr/bin/env node
'use strict';

// Creates the two tiny demo git repos that `scan`/`digest` point at.
//
// These are real, local `.git` repos generated on demand (git doesn't let a
// parent repo cleanly track a nested one's history — it just stores a
// dangling gitlink), rather than committed here, so they aren't checked
// into agentfleet's own repo. Both this file and the tests call
// `seedFixtures()`, which is idempotent: it skips a repo that already exists.

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const FIXTURES_DIR = __dirname;

function run(cwd, args) {
  execFileSync('git', args, { cwd, stdio: 'ignore' });
}

function initRepo(repoPath) {
  fs.mkdirSync(repoPath, { recursive: true });
  run(repoPath, ['init', '-q']);
  run(repoPath, ['config', 'user.name', 'AgentFleet Demo']);
  run(repoPath, ['config', 'user.email', 'demo@agentfleet.local']);
  run(repoPath, ['config', 'commit.gpgsign', 'false']);
}

function commitAll(repoPath, message, author) {
  run(repoPath, ['add', '-A']);
  const args = ['commit', '-q', '-m', message];
  if (author) args.push('--author', author);
  run(repoPath, args);
}

function seedRepoA() {
  const repoPath = path.join(FIXTURES_DIR, 'demo-repo-a');
  if (fs.existsSync(path.join(repoPath, '.git'))) return;
  initRepo(repoPath);

  fs.writeFileSync(path.join(repoPath, 'README.md'), '# demo-repo-a\n\nFixture repo used by AgentFleet.\n');
  commitAll(repoPath, 'chore: init project', null);

  // Seeded with a fake secret and a risky shell idiom, as if an agent wrote it.
  fs.writeFileSync(
    path.join(repoPath, 'deploy.sh'),
    [
      '#!/bin/bash',
      '# one-shot environment setup',
      'curl -sSL https://example.com/install.sh | bash',
      'export AWS_ACCESS_KEY_ID=AKIAABCDEFGHIJKLMNOP',
      'STRIPE_SECRET_KEY = "sk_live_51H8fixturefakekeyABCDEFGH"',
      'chmod 777 ./run.sh',
      '',
    ].join('\n')
  );
  commitAll(repoPath, 'agent: add deploy helper script', 'claude-code-agent <agent@local>');
}

function seedRepoB() {
  const repoPath = path.join(FIXTURES_DIR, 'demo-repo-b');
  if (fs.existsSync(path.join(repoPath, '.git'))) return;
  initRepo(repoPath);

  fs.writeFileSync(
    path.join(repoPath, 'package.json'),
    JSON.stringify({ name: 'demo-repo-b', version: '1.0.0', dependencies: { 'left-pad': '^1.3.0' } }, null, 2) + '\n'
  );
  fs.writeFileSync(path.join(repoPath, 'README.md'), '# demo-repo-b\n\nFixture repo used by AgentFleet.\n');
  commitAll(repoPath, 'chore: init project', null);

  // A dependency bump with no secrets/risky shell content — should be
  // surfaced as "unreviewed dependency change", not a security flag.
  fs.writeFileSync(
    path.join(repoPath, 'package.json'),
    JSON.stringify({ name: 'demo-repo-b', version: '1.0.0', dependencies: { 'left-pad': '^1.4.0' } }, null, 2) + '\n'
  );
  commitAll(repoPath, 'agent: bump left-pad to 1.4.0', 'claude-code-agent <agent@local>');

  // A fully clean commit that should not appear in either flagged section.
  fs.writeFileSync(
    path.join(repoPath, 'README.md'),
    '# demo-repo-b\n\nFixture repo used by AgentFleet. Now with more detail.\n'
  );
  commitAll(repoPath, 'docs: expand readme', null);
}

// `node --test` runs each *.test.js file in its own process, in parallel, and
// both test files seed on `before()` — so two processes can race to `git
// init` the same directory. A simple lockfile serializes them: whoever loses
// the race waits for the winner to finish, then finds the repos already
// seeded and no-ops.
const LOCK_PATH = path.join(FIXTURES_DIR, '.seed.lock');

function withLock(fn) {
  for (;;) {
    try {
      fs.closeSync(fs.openSync(LOCK_PATH, 'wx'));
      break;
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
      execFileSync(process.execPath, ['-e', 'setTimeout(() => {}, 50)']);
    }
  }
  try {
    fn();
  } finally {
    fs.rmSync(LOCK_PATH, { force: true });
  }
}

function seedFixtures() {
  withLock(() => {
    seedRepoA();
    seedRepoB();
  });
}

if (require.main === module) {
  seedFixtures();
  console.log('Fixtures ready at fixtures/demo-repo-a and fixtures/demo-repo-b');
}

module.exports = { seedFixtures };
