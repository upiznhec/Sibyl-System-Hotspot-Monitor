// Terminal prompts for the scripts the person runs themselves (save-secret.js, instagram-token.js).
// A hidden prompt shows nothing as the person types or pastes, so a key never appears on screen.

const readline = require('readline');

// The first line of standard input, for --from-stdin (scripts and tests).
function readLine(input = process.stdin) {
  return new Promise((resolve, reject) => {
    let data = '';
    input.setEncoding('utf8');
    input.on('data', chunk => { data += chunk; });
    input.on('end', () => resolve(data.split(/\r?\n/)[0]));
    input.on('error', reject);
  });
}

// All lines of standard input, for --from-stdin when a script asks several questions.
function readLines(input = process.stdin) {
  return new Promise((resolve, reject) => {
    let data = '';
    input.setEncoding('utf8');
    input.on('data', chunk => { data += chunk; });
    input.on('end', () => resolve(data.split(/\r?\n/)));
    input.on('error', reject);
  });
}

// Nothing is echoed. Pasting works, Backspace deletes, Return finishes and Ctrl+C cancels.
function readHidden(input = process.stdin, output = process.stdout) {
  return new Promise((resolve, reject) => {
    let value = '';
    const finish = (error, result) => {
      input.removeListener('data', onData);
      input.setRawMode(false);
      input.pause();
      output.write('\n');
      if (error) reject(error);
      else resolve(result);
    };
    function onData(chunk) {
      // Some terminals wrap a paste in bracketed-paste markers.
      for (const char of String(chunk).replace(/\u001b\[20[01]~/g, '')) {
        if (char === '\r' || char === '\n') return finish(null, value);
        if (char === '\u0003') return finish(new Error('cancelled'));
        if (char === '\u007f' || char === '\b') {
          value = value.slice(0, -1);
          continue;
        }
        if (char >= ' ') value += char;
      }
      return undefined;
    }
    input.setRawMode(true);
    input.setEncoding('utf8');
    input.on('data', onData);
    input.resume();
  });
}

// A visible question, answered with Return.
function readVisible(question, input = process.stdin, output = process.stdout) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input, output });
    rl.question(question, answer => {
      rl.close();
      resolve(answer);
    });
  });
}

module.exports = {
  readHidden,
  readLine,
  readLines,
  readVisible
};
