'use strict';

// Run with: npm run set-api-key
//
// Updates ONLY the ANTHROPIC_API_KEY line in .env -- for when the
// original key expires, is rotated, or is deleted from the PI's Claude
// Platform account. The admin password, session secret, and the entire
// session database (data/sessions.db) are left completely untouched.

const readline = require('node:readline');
const { envExists, parseEnv, readEnvRaw, updateEnv } = require('./envUtil');

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (answer) => {
    rl.close();
    resolve(answer.trim());
  }));
}

function mask(key) {
  if (!key || key.length < 10) return '(not set)';
  return key.slice(0, 10) + '...' + key.slice(-4);
}

async function main() {
  if (!envExists()) {
    console.log('No .env file found. Run "npm run setup" first to create one.');
    return;
  }

  const current = parseEnv(readEnvRaw()).ANTHROPIC_API_KEY;
  console.log('Current API key: ' + mask(current));

  const newKey = await ask('Paste the new Anthropic API key: ');
  if (!newKey) {
    console.log('No key entered -- nothing changed.');
    return;
  }

  updateEnv({ ANTHROPIC_API_KEY: newKey });
  console.log('\nAPI key updated.');
  console.log('Restart the server (if it is running) for this to take effect.\n');
}

main();
