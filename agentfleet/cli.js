#!/usr/bin/env node
'use strict';

const { loadRepoConfig, getCommitsSince, getCommitDiff } = require('./lib/repos');
const { scanDiff } = require('./lib/secretScan');
const { scanDependencyChanges } = require('./lib/depScan');
const { collectFindings, buildDigest, writeDigest } = require('./lib/digest');
const { loadCostLog, aggregateByProject, formatTable } = require('./lib/cost');

function parseFlags(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      const hasValue = argv[i + 1] !== undefined && !argv[i + 1].startsWith('--');
      flags[key] = hasValue ? argv[++i] : true;
    }
  }
  return flags;
}

function cmdScan(flags) {
  const configPath = flags.config || 'config/repos.json';
  const since = flags.since || '30d';
  const repos = loadRepoConfig(configPath);

  console.log(`Scanning ${repos.length} repo(s) for commits in the last ${since}...\n`);
  for (const repo of repos) {
    const commits = getCommitsSince(repo.path, since);
    let flagged = 0;
    for (const commit of commits) {
      const diff = getCommitDiff(repo.path, commit.hash);
      const secretFindings = scanDiff(diff);
      const depFindings = scanDependencyChanges(diff);
      if (secretFindings.secrets.length || secretFindings.shellCommands.length || depFindings.manifestChanged) {
        flagged++;
      }
    }
    console.log(`- ${repo.name}: ${commits.length} commit(s), ${flagged} flagged for review`);
  }
}

function cmdDigest(flags) {
  const configPath = flags.config || 'config/repos.json';
  const since = flags.since || '7d';
  const outPath = flags.out || 'output/digest.md';

  const commits = collectFindings(configPath, since);
  const digest = buildDigest(commits, { since });
  const { outPath: writtenPath, queuePath } = writeDigest(outPath, digest);

  console.log(`Digest written to ${writtenPath}`);
  console.log(`Review queue written to ${queuePath}`);
  console.log(
    `\n${digest.securityRisk.length} security flag(s), ${digest.dependencyOnly.length} dependency change(s), ${digest.clean.length} clean commit(s).`
  );
}

function cmdCost(flags) {
  const configPath = flags.config || 'config/cost-log.sample.json';
  const entries = loadCostLog(configPath);
  const rows = aggregateByProject(entries);
  console.log(formatTable(rows));
}

function main() {
  const [, , command, ...rest] = process.argv;
  const flags = parseFlags(rest);

  switch (command) {
    case 'scan':
      return cmdScan(flags);
    case 'digest':
      return cmdDigest(flags);
    case 'cost':
      return cmdCost(flags);
    default:
      console.error('Usage: node cli.js <scan|digest|cost> [--config path] [--since 7d] [--out path]');
      process.exitCode = 1;
  }
}

main();
