'use strict';

const fs = require('fs');
const path = require('path');
const { loadRepoConfig, getCommitsSince, getCommitDiff } = require('./repos');
const { scanDiff } = require('./secretScan');
const { scanDependencyChanges } = require('./depScan');

function collectFindings(configPath, since) {
  const repos = loadRepoConfig(configPath);
  const results = [];
  for (const repo of repos) {
    const commits = getCommitsSince(repo.path, since);
    for (const commit of commits) {
      const diff = getCommitDiff(repo.path, commit.hash);
      const secretFindings = scanDiff(diff);
      const depFindings = scanDependencyChanges(diff);
      results.push({
        repo: repo.name,
        hash: commit.hash,
        shortHash: commit.hash.slice(0, 7),
        author: commit.author,
        date: commit.date,
        message: commit.subject,
        secrets: secretFindings.secrets,
        shellCommands: secretFindings.shellCommands,
        dependency: depFindings,
      });
    }
  }
  return results;
}

function describeDependencyChanges(dependency) {
  if (dependency.dependencyChanges.length > 0) {
    return dependency.dependencyChanges.map((d) =>
      d.from ? `${d.name}: ${d.from} → ${d.to}` : `${d.name}: added at ${d.to}`
    );
  }
  return [`Manifest changed: ${dependency.files.join(', ')}`];
}

// A commit needs human review if it touches a secret/risky-shell pattern, or
// if it silently bumps a dependency manifest — those are the two review
// reasons the MVP proves out. Anything else is "clean" and stays out of the
// queue, which is the whole point: surface only what actually needs a look.
function classify(commit) {
  const securityReasons = [];
  for (const s of commit.secrets) {
    securityReasons.push(`Leaked secret (${s.rule}) in ${s.file} — \`${s.snippet}\``);
  }
  for (const s of commit.shellCommands) {
    securityReasons.push(`Risky shell command (${s.rule}) in ${s.file} — \`${s.snippet}\``);
  }

  return {
    isSecurityRisk: securityReasons.length > 0,
    securityReasons,
    hasDependencyChange: commit.dependency.manifestChanged,
    dependencyReasons: describeDependencyChanges(commit.dependency),
  };
}

function buildDigest(commits, { since }) {
  const byRepo = new Map();
  for (const c of commits) {
    if (!byRepo.has(c.repo)) byRepo.set(c.repo, []);
    byRepo.get(c.repo).push(c);
  }

  const securityRisk = [];
  const dependencyOnly = [];
  const clean = [];

  for (const c of commits) {
    const { isSecurityRisk, securityReasons, hasDependencyChange, dependencyReasons } = classify(c);
    if (isSecurityRisk) {
      securityRisk.push({ ...c, reasons: securityReasons });
    } else if (hasDependencyChange) {
      dependencyOnly.push({ ...c, reasons: dependencyReasons });
    } else {
      clean.push(c);
    }
  }

  const lines = [];
  lines.push('# AgentFleet Digest');
  lines.push('');
  lines.push(`Window: since ${since} · ${commits.length} commit(s) across ${byRepo.size} repo(s).`);
  lines.push('');
  lines.push('## Repos Scanned');
  for (const [repo, list] of byRepo) {
    lines.push(`- **${repo}** — ${list.length} commit(s)`);
  }
  lines.push('');

  lines.push(`## Needs Review — Security (${securityRisk.length})`);
  if (securityRisk.length === 0) lines.push('_None._');
  for (const c of securityRisk) {
    lines.push(`### ${c.repo} · \`${c.shortHash}\` — ${c.message}`);
    lines.push(`_${c.author} · ${c.date}_`);
    for (const r of c.reasons) lines.push(`- ${r}`);
    lines.push('');
  }

  lines.push(`## Dependency Changes — Unreviewed (${dependencyOnly.length})`);
  if (dependencyOnly.length === 0) lines.push('_None._');
  for (const c of dependencyOnly) {
    lines.push(`### ${c.repo} · \`${c.shortHash}\` — ${c.message}`);
    lines.push(`_${c.author} · ${c.date}_`);
    for (const r of c.reasons) lines.push(`- ${r}`);
    lines.push('');
  }

  lines.push(`## Clean (${clean.length})`);
  if (clean.length === 0) lines.push('_None._');
  for (const c of clean) {
    lines.push(`- ${c.repo} · \`${c.shortHash}\` — ${c.message}`);
  }
  lines.push('');

  const reviewQueue = [...securityRisk, ...dependencyOnly].map((c) => ({
    repo: c.repo,
    hash: c.hash,
    shortHash: c.shortHash,
    author: c.author,
    date: c.date,
    message: c.message,
    reasons: c.reasons,
  }));

  return { markdown: lines.join('\n'), reviewQueue, securityRisk, dependencyOnly, clean };
}

function writeDigest(outPath, digest) {
  const resolvedOut = path.resolve(outPath);
  const outDir = path.dirname(resolvedOut);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(resolvedOut, digest.markdown, 'utf8');
  const queuePath = path.join(outDir, 'review-queue.json');
  fs.writeFileSync(queuePath, JSON.stringify(digest.reviewQueue, null, 2), 'utf8');
  return { outPath: resolvedOut, queuePath };
}

module.exports = { collectFindings, classify, buildDigest, writeDigest };
