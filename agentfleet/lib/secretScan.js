'use strict';

// Heuristic regex rules only — no ML/LLM-based review in this MVP (see plan.md).
const SECRET_RULES = [
  { name: 'AWS Access Key ID', pattern: /AKIA[0-9A-Z]{16}/ },
  {
    name: 'Generic API key/secret assignment',
    pattern: /(api[_-]?key|secret[_-]?key|access[_-]?token|auth[_-]?token)\s*[:=]\s*['"][A-Za-z0-9_\-/+]{16,}['"]/i,
  },
  { name: 'Private key block', pattern: /-----BEGIN (RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/ },
  { name: 'Slack token', pattern: /xox[baprs]-[0-9A-Za-z-]{10,}/ },
  { name: 'Stripe secret key', pattern: /sk_live_[0-9A-Za-z]{16,}/ },
];

const SHELL_RULES = [
  { name: 'Pipe remote script into shell', pattern: /(curl|wget)\s+.*\|\s*(sudo\s+)?(bash|sh|zsh)\b/ },
  { name: 'Recursive force delete of root/home', pattern: /rm\s+-rf\s+(\/|~)(\s|$)/ },
  { name: 'World-writable permissions', pattern: /chmod\s+777\b/ },
  { name: 'Eval of remote download', pattern: /eval\s+["'`]?\$\(\s*(curl|wget)/ },
];

// Only lines added by the commit (diff `+` lines) are scanned — pre-existing
// code that the commit doesn't touch shouldn't show up as a new risk.
function iterateAddedLines(diffText) {
  const lines = diffText.split('\n');
  let currentFile = null;
  const result = [];
  for (const line of lines) {
    const fileMatch = /^\+\+\+ b\/(.+)$/.exec(line);
    if (fileMatch) {
      currentFile = fileMatch[1];
      continue;
    }
    if (line.startsWith('+++') || line.startsWith('---')) continue;
    if (line.startsWith('+')) {
      result.push({ file: currentFile, content: line.slice(1) });
    }
  }
  return result.map((entry, idx) => ({ ...entry, lineNumber: idx + 1 }));
}

function scanDiff(diffText) {
  const addedLines = iterateAddedLines(diffText);
  const findings = { secrets: [], shellCommands: [] };

  for (const { file, content, lineNumber } of addedLines) {
    for (const rule of SECRET_RULES) {
      if (rule.pattern.test(content)) {
        findings.secrets.push({ rule: rule.name, file, lineNumber, snippet: content.trim().slice(0, 120) });
      }
    }
    for (const rule of SHELL_RULES) {
      if (rule.pattern.test(content)) {
        findings.shellCommands.push({ rule: rule.name, file, lineNumber, snippet: content.trim().slice(0, 120) });
      }
    }
  }

  return findings;
}

module.exports = { scanDiff, SECRET_RULES, SHELL_RULES };
