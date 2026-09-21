'use strict';

// Run with: npm run setup
//
// First-time setup: creates .env with a random admin password and a
// random session-cookie secret, so the researcher never has to invent
// (or forget to change) either one.
//
// To change just the admin password later, use `npm run reset-password`.
// To change just the API key later, use `npm run set-api-key`.
// Both leave everything else in .env untouched -- prefer them over
// re-running this script once you already have real data flowing.

const crypto = require('node:crypto');
const readline = require('node:readline');
const { envExists, parseEnv, readEnvRaw, updateEnv } = require('./envUtil');

const SYMBOLS = '!@$%&*+-?';

function randomAdminPassword() {
  // Mnemonic, easy to write on a paper log and type on a shared laptop:
  // NLBP + 3 digits + 1 symbol (e.g. NLBP482!). This trades some entropy
  // for recall -- a reasonable tradeoff for a single, physically-secured,
  // offline study laptop, but a much weaker password than a random
  // string. If this laptop's threat model ever changes (network-exposed,
  // shared building, etc), use a longer random password instead.
  const digits = crypto.randomInt(0, 1000).toString().padStart(3, '0');
  const symbol = SYMBOLS[crypto.randomInt(0, SYMBOLS.length)];
  return `NLBP${digits}${symbol}`;
}

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (answer) => {
    rl.close();
    resolve(answer.trim());
  }));
}

async function main() {
  let currentApiKey = null;

  if (envExists()) {
    currentApiKey = parseEnv(readEnvRaw()).ANTHROPIC_API_KEY;
    const answer = await ask(
      '.env already exists. Running setup again regenerates the admin password AND the ' +
      'session-cookie secret (this will invalidate the current admin password). ' +
      'If you only want to change the password, run "npm run reset-password" instead, ' +
      'or "npm run set-api-key" to change only the API key.\n' +
      'Continue and regenerate everything now? (y/N): '
    );
    if (answer.toLowerCase() !== 'y') {
      console.log('Left .env unchanged.');
      return;
    }
  }

  const keyPrompt = currentApiKey
    ? 'Paste your Anthropic API key (leave blank to keep the current one): '
    : 'Paste your Anthropic API key (or leave blank to fill in later): ';
  const apiKeyInput = await ask(keyPrompt);
  const apiKey = apiKeyInput || currentApiKey || 'sk-ant-your-key-here';

  const adminPassword = randomAdminPassword();
  const sessionSecret = crypto.randomBytes(32).toString('hex');

  updateEnv({
    ANTHROPIC_API_KEY: apiKey,
    ADMIN_PASSWORD: adminPassword,
    SESSION_SECRET: sessionSecret,
  });

  console.log('\n.env created.\n');
  console.log('Admin password (write this down / share only with whoever runs sessions):');
  console.log('  ' + adminPassword);
  console.log('\nA random session-cookie secret was also generated -- no action needed there.');
  if (!apiKeyInput && !currentApiKey) {
    console.log('\nReminder: you left the Anthropic API key blank -- open .env and set ANTHROPIC_API_KEY before running npm start.');
  }
  console.log('\nForgot the password later? Run "npm run reset-password". Need to change the API key later? Run "npm run set-api-key".\n');
}

main();
