'use strict';

// Run with: npm run reset-password
//
// Generates a new admin password and updates ONLY the ADMIN_PASSWORD line
// in .env. The database (data/sessions.db) and everything else in .env
// (API key, session secret, port, model) are left completely untouched.

const crypto = require('node:crypto');
const readline = require('node:readline');
const { envExists, updateEnv } = require('./envUtil');

const SYMBOLS = '!@$%&*+-?';

function randomAdminPassword() {
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
  if (!envExists()) {
    console.log('No .env file found. Run "npm run setup" first to create one.');
    return;
  }

  const answer = await ask(
    'This will set a new admin password. Anyone using the current password will need ' +
    'the new one. Your session data (data/sessions.db) is not affected. Continue? (y/N): '
  );
  if (answer.toLowerCase() !== 'y') {
    console.log('Password not changed.');
    return;
  }

  const newPassword = randomAdminPassword();
  updateEnv({ ADMIN_PASSWORD: newPassword });

  console.log('\nAdmin password updated. New password (write this down):');
  console.log('  ' + newPassword);
  console.log('\nRestart the server (if it is running) for this to take effect.\n');
}

main();
