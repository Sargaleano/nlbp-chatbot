'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const ENV_PATH = path.join(ROOT, '.env');
const EXAMPLE_PATH = path.join(ROOT, '.env.example');

function envExists() {
  return fs.existsSync(ENV_PATH);
}

function readEnvRaw() {
  if (!fs.existsSync(ENV_PATH)) return null;
  return fs.readFileSync(ENV_PATH, 'utf8');
}

function readExampleRaw() {
  return fs.readFileSync(EXAMPLE_PATH, 'utf8');
}

function parseEnv(raw) {
  const values = {};
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    values[key] = trimmed.slice(eqIdx + 1).trim();
  }
  return values;
}

/**
 * Updates only the given keys in .env, leaving every other line (values,
 * comments, ordering) untouched. If .env does not exist yet, starts from
 * .env.example. If a key isn't present in the file at all, appends it.
 */
function updateEnv(updates) {
  let raw = readEnvRaw();
  if (raw === null) {
    raw = readExampleRaw();
  }
  const lines = raw.split('\n');
  const remainingKeys = new Set(Object.keys(updates));

  const newLines = lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return line;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) return line;
    const key = trimmed.slice(0, eqIdx).trim();
    if (Object.prototype.hasOwnProperty.call(updates, key)) {
      remainingKeys.delete(key);
      return `${key}=${updates[key]}`;
    }
    return line;
  });

  for (const key of remainingKeys) {
    newLines.push(`${key}=${updates[key]}`);
  }

  fs.writeFileSync(ENV_PATH, newLines.join('\n'), { mode: 0o600 });
}

module.exports = { envExists, readEnvRaw, parseEnv, updateEnv, ENV_PATH };
