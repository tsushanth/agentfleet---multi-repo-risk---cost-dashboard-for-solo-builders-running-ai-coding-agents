'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { seedFixtures } = require('../fixtures/seed');
const { getCommitsSince, getCommitDiff } = require('../lib/repos');
const { scanDiff } = require('../lib/secretScan');

const REPO_A = path.join(__dirname, '..', 'fixtures', 'demo-repo-a');
const REPO_B = path.join(__dirname, '..', 'fixtures', 'demo-repo-b');

test.before(() => {
  seedFixtures();
});

test('flags the fake secrets and risky shell commands in demo-repo-a', () => {
  const commits = getCommitsSince(REPO_A, '365d');
  const flaggedCommit = commits.find((c) => c.subject.includes('deploy helper'));
  assert.ok(flaggedCommit, 'expected to find the seeded deploy-helper commit');

  const diff = getCommitDiff(REPO_A, flaggedCommit.hash);
  const findings = scanDiff(diff);

  assert.ok(findings.secrets.some((s) => s.rule === 'AWS Access Key ID'));
  assert.ok(findings.secrets.some((s) => s.rule.includes('Stripe')));
  assert.ok(findings.shellCommands.some((s) => s.rule.includes('Pipe remote script')));
  assert.ok(findings.shellCommands.some((s) => s.rule.includes('World-writable')));
});

test('does not flag any commit in demo-repo-b for secrets or risky shell commands', () => {
  const commits = getCommitsSince(REPO_B, '365d');
  assert.ok(commits.length > 0);
  for (const commit of commits) {
    const diff = getCommitDiff(REPO_B, commit.hash);
    const findings = scanDiff(diff);
    assert.equal(findings.secrets.length, 0, `unexpected secret finding in "${commit.subject}"`);
    assert.equal(findings.shellCommands.length, 0, `unexpected shell finding in "${commit.subject}"`);
  }
});
