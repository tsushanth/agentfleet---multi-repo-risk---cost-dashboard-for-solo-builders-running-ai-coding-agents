'use strict';

const fs = require('fs');
const path = require('path');

// Reads a local sample/fixture cost log shaped like what a real Anthropic
// billing export would produce. Live billing API integration is out of
// scope for this MVP (see plan.md).
function loadCostLog(configPath) {
  const raw = fs.readFileSync(path.resolve(configPath), 'utf8');
  const data = JSON.parse(raw);
  return data.entries;
}

function aggregateByProject(entries) {
  const byProject = new Map();
  for (const e of entries) {
    if (!byProject.has(e.project)) {
      byProject.set(e.project, { project: e.project, entries: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 });
    }
    const agg = byProject.get(e.project);
    agg.entries += 1;
    agg.inputTokens += e.inputTokens;
    agg.outputTokens += e.outputTokens;
    agg.costUsd += e.costUsd;
  }
  return Array.from(byProject.values()).sort((a, b) => b.costUsd - a.costUsd);
}

function formatTable(rows) {
  const header = ['Project', 'Entries', 'Input Tokens', 'Output Tokens', 'Cost (USD)'];
  const dataRows = rows.map((r) => [
    r.project,
    String(r.entries),
    r.inputTokens.toLocaleString('en-US'),
    r.outputTokens.toLocaleString('en-US'),
    `$${r.costUsd.toFixed(2)}`,
  ]);
  const widths = header.map((h, i) => Math.max(h.length, ...dataRows.map((row) => row[i].length)));
  const formatRow = (cells) => cells.map((c, i) => c.padEnd(widths[i])).join('  ');

  const lines = [formatRow(header), widths.map((w) => '-'.repeat(w)).join('  '), ...dataRows.map(formatRow)];
  const total = rows.reduce((sum, r) => sum + r.costUsd, 0);
  lines.push('');
  lines.push(`Total spend: $${total.toFixed(2)}`);
  return lines.join('\n');
}

module.exports = { loadCostLog, aggregateByProject, formatTable };
