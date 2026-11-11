#!/usr/bin/env node
// Compares the output files of two run.js output folders, step by step.
// Usage: node tools/rewrite-check/compare.js <baseline out dir> <rewrite out dir>
// Exit code 0 = every output file is identical.

const fs = require('fs');
const path = require('path');

const filesIndex = process.argv.indexOf('--files');
const outputs = filesIndex === -1
  ? ['report-latest.md', 'clusters-latest.json', 'signals-latest.json', 'state.json']
  : process.argv[filesIndex + 1].split(',');
const positional = process.argv.slice(2).filter((arg, index, all) =>
  arg !== '--files' && all[index - 1] !== '--files'
);
const [baselineDir, rewriteDir] = positional.map(dir => path.resolve(dir));

if (!baselineDir || !rewriteDir) {
  console.error('Usage: node compare.js <baseline out dir> <rewrite out dir>');
  process.exit(2);
}

function steps(dir) {
  return fs.readdirSync(dir).filter(name => /^step-\d+$/.test(name))
    .sort((a, b) => Number(a.slice(5)) - Number(b.slice(5)));
}

function firstDifference(a, b) {
  const linesA = a.split('\n');
  const linesB = b.split('\n');
  const length = Math.max(linesA.length, linesB.length);
  for (let i = 0; i < length; i++) {
    if (linesA[i] !== linesB[i]) {
      return `line ${i + 1}\n  baseline: ${linesA[i]}\n  rewrite:  ${linesB[i]}`;
    }
  }
  return 'files differ only in trailing bytes';
}

let differences = 0;
let compared = 0;
const baselineSteps = steps(baselineDir);
const rewriteSteps = steps(rewriteDir);
if (baselineSteps.join(',') !== rewriteSteps.join(',')) {
  console.log(`Different steps: baseline ${baselineSteps.join(',')} vs rewrite ${rewriteSteps.join(',')}`);
  differences++;
}

baselineSteps.forEach(step => {
  outputs.forEach(name => {
    const fileA = path.join(baselineDir, step, 'data', name);
    const fileB = path.join(rewriteDir, step, 'data', name);
    if (!fs.existsSync(fileA) || !fs.existsSync(fileB)) {
      console.log(`${step}/${name}: missing in ${fs.existsSync(fileA) ? 'rewrite' : 'baseline'}`);
      differences++;
      return;
    }
    const a = fs.readFileSync(fileA, 'utf8');
    const b = fs.readFileSync(fileB, 'utf8');
    compared++;
    if (a !== b) {
      differences++;
      console.log(`${step}/${name}: DIFFERENT at ${firstDifference(a, b)}`);
    } else {
      console.log(`${step}/${name}: identical (${Buffer.byteLength(a)} bytes)`);
    }
  });
});

console.log(differences === 0
  ? `All ${compared} output files are identical.`
  : `${differences} difference(s) found.`);
process.exit(differences === 0 ? 0 : 1);
