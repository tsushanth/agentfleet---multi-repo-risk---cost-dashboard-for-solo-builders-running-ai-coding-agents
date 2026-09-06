'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { seedFixtures } = require('../fixtures/seed');
const { collectFindings, buildDigest } = require('../lib/digest');

const CONFIG_PATH = path.join(__dirname, '..', 'config', 'repos.json');

test.before(() => {
  seedFixtures();
});

test('digest separates security risk, dependency change, and clean commits', () => {
  const commits = collectFindings(CONFIG_PATH, '365d');
  const digest = buildDigest(commits, { since: '365d' });

  // demo-repo-a: init (clean) + deploy helper (security risk)
  // demo-repo-b: init (introduces package.json -> dependency change) +
  //              left-pad bump (dependency change) + readme (clean)
  assert.equal(digest.securityRisk.length, 1);
  assert.equal(digest.securityRisk[0].repo, 'demo-repo-a');
  assert.match(digest.securityRisk[0].message, /deploy helper/);

  assert.equal(digest.dependencyOnly.length, 2);
  assert.ok(digest.dependencyOnly.every((c) => c.repo === 'demo-repo-b'));
  const bumpCommit = digest.dependencyOnly.find((c) => /bump left-pad/.test(c.message));
  assert.ok(bumpCommit, 'expected the left-pad bump commit to be flagged');
  assert.ok(bumpCommit.reasons.some((r) => r.includes('1.3.0') && r.includes('1.4.0')));

  assert.equal(digest.clean.length, 2);

  const queueKeys = digest.reviewQueue.map((c) => `${c.repo}:${c.shortHash}`).sort();
  assert.equal(queueKeys.length, 3);
  assert.ok(digest.markdown.includes('Needs Review'));
  assert.ok(digest.markdown.includes('Dependency Changes'));
});
