'use strict';

// Uses Node's built-in node:sqlite module (DatabaseSync), NOT the
// better-sqlite3 npm package. better-sqlite3 requires compiling native
// C++ at install time (node-gyp, Python, a C++ toolchain), which broke a
// prior build attempt on a researcher's machine. node:sqlite ships inside
// Node itself (v22.13+) with zero native compilation, and its API
// (db.exec, db.prepare(sql).run(...), .get(...), .all()) is compatible
// enough with better-sqlite3 to be a safe, low-risk substitution.
const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { emptySlots } = require('./domains');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
const DB_PATH = path.join(DATA_DIR, 'sessions.db');

const db = new DatabaseSync(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    consent_mode TEXT NOT NULL,
    consent_given INTEGER NOT NULL DEFAULT 0,
    transcript_json TEXT NOT NULL DEFAULT '[]',
    slots_json TEXT NOT NULL,
    red_flag INTEGER NOT NULL DEFAULT 0,
    red_flag_reason TEXT,
    interview_complete INTEGER NOT NULL DEFAULT 0,
    completed_at TEXT,
    dn4_score INTEGER,
    reference_classification TEXT,
    reference_notes TEXT
  );
`);

// --- Migration: add columns introduced after the initial release, for
// anyone upgrading an existing data/sessions.db in place. Safe to run
// every startup -- each ALTER is skipped if the column already exists. ---
function columnExists(table, column) {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all();
  return rows.some((r) => r.name === column);
}

if (!columnExists('sessions', 'patient_id')) {
  db.exec(`ALTER TABLE sessions ADD COLUMN patient_id TEXT;`);
}
if (!columnExists('sessions', 'excluded_from_analysis')) {
  db.exec(`ALTER TABLE sessions ADD COLUMN excluded_from_analysis INTEGER NOT NULL DEFAULT 0;`);
}
if (!columnExists('sessions', 'updated_at')) {
  db.exec(`ALTER TABLE sessions ADD COLUMN updated_at TEXT;`);
  // Backfill existing rows so "Modificado" has a sensible value instead of
  // being blank for sessions created before this column existed.
  db.exec(`UPDATE sessions SET updated_at = created_at WHERE updated_at IS NULL;`);
}
if (!columnExists('sessions', 'chatbot_classification_json')) {
  db.exec(`ALTER TABLE sessions ADD COLUMN chatbot_classification_json TEXT;`);
}

function nowIso() {
  return new Date().toISOString();
}

// Human-mnemonic short patient code: 3 letters + 3 digits (e.g. LBP482).
// This is NOT the access-control token (the session's UUID `id` still
// serves that purpose in the interview URL) -- it exists purely as a
// short label the clinician can write on their own private
// patient-identity spreadsheet alongside the patient's real record.
// Ambiguous characters (I, O, 0, 1) are excluded to reduce transcription
// errors when copying it by hand.
const PATIENT_ID_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const PATIENT_ID_DIGITS = '23456789';

function randomPatientId() {
  let letters = '';
  for (let i = 0; i < 3; i++) {
    letters += PATIENT_ID_LETTERS[crypto.randomInt(0, PATIENT_ID_LETTERS.length)];
  }
  let digits = '';
  for (let i = 0; i < 3; i++) {
    digits += PATIENT_ID_DIGITS[crypto.randomInt(0, PATIENT_ID_DIGITS.length)];
  }
  return letters + digits;
}

function generateUniquePatientId() {
  for (let attempt = 0; attempt < 50; attempt++) {
    const candidate = randomPatientId();
    const existing = db
      .prepare('SELECT id FROM sessions WHERE patient_id = ?')
      .get(candidate);
    if (!existing) return candidate;
  }
  // Astronomically unlikely with ~9.5M combinations, but never loop forever.
  throw new Error('Could not generate a unique patient ID');
}

function createSession(consentMode) {
  if (consentMode !== 'onscreen' && consentMode !== 'external') {
    throw new Error("consentMode must be 'onscreen' or 'external'");
  }
  const id = crypto.randomUUID();
  const patientId = generateUniquePatientId();
  const createdAt = nowIso();
  const consentGiven = consentMode === 'external' ? 1 : 0;
  const slotsJson = JSON.stringify(emptySlots());

  db.prepare(
    `INSERT INTO sessions
      (id, patient_id, created_at, updated_at, consent_mode, consent_given, transcript_json, slots_json, red_flag, interview_complete, excluded_from_analysis)
     VALUES (?, ?, ?, ?, ?, ?, '[]', ?, 0, 0, 0)`
  ).run(id, patientId, createdAt, createdAt, consentMode, consentGiven, slotsJson);

  return getSession(id);
}

function rowToSession(row) {
  if (!row) return null;
  return {
    id: row.id,
    patientId: row.patient_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    consentMode: row.consent_mode,
    consentGiven: !!row.consent_given,
    transcript: JSON.parse(row.transcript_json),
    slots: JSON.parse(row.slots_json),
    redFlag: !!row.red_flag,
    redFlagReason: row.red_flag_reason,
    interviewComplete: !!row.interview_complete,
    completedAt: row.completed_at,
    dn4Score: row.dn4_score,
    referenceClassification: row.reference_classification,
    referenceNotes: row.reference_notes,
    excludedFromAnalysis: !!row.excluded_from_analysis,
    chatbotClassification: row.chatbot_classification_json
      ? JSON.parse(row.chatbot_classification_json)
      : null,
  };
}

function getSession(id) {
  const row = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id);
  return rowToSession(row);
}

function listSessions() {
  const rows = db
    .prepare('SELECT * FROM sessions ORDER BY created_at DESC')
    .all();
  return rows.map(rowToSession);
}

function setConsentGiven(id) {
  db.prepare('UPDATE sessions SET consent_given = 1, updated_at = ? WHERE id = ?').run(
    nowIso(),
    id
  );
  return getSession(id);
}

function saveTurn(id, { transcript, slots, redFlag, redFlagReason, interviewComplete }) {
  const wasComplete = getSession(id)?.interviewComplete;
  const completedAtClause = interviewComplete && !wasComplete ? nowIso() : null;
  const updatedAt = nowIso();

  if (completedAtClause) {
    db.prepare(
      `UPDATE sessions
       SET transcript_json = ?, slots_json = ?, red_flag = ?, red_flag_reason = ?,
           interview_complete = ?, completed_at = ?, updated_at = ?
       WHERE id = ?`
    ).run(
      JSON.stringify(transcript),
      JSON.stringify(slots),
      redFlag ? 1 : 0,
      redFlagReason || null,
      interviewComplete ? 1 : 0,
      completedAtClause,
      updatedAt,
      id
    );
  } else {
    db.prepare(
      `UPDATE sessions
       SET transcript_json = ?, slots_json = ?, red_flag = ?, red_flag_reason = ?,
           interview_complete = ?, updated_at = ?
       WHERE id = ?`
    ).run(
      JSON.stringify(transcript),
      JSON.stringify(slots),
      redFlag ? 1 : 0,
      redFlagReason || null,
      interviewComplete ? 1 : 0,
      updatedAt,
      id
    );
  }
  return getSession(id);
}

function setReferenceData(id, { dn4Score, referenceClassification, referenceNotes }) {
  db.prepare(
    `UPDATE sessions
     SET dn4_score = ?, reference_classification = ?, reference_notes = ?, updated_at = ?
     WHERE id = ?`
  ).run(
    dn4Score === undefined || dn4Score === null ? null : dn4Score,
    referenceClassification || null,
    referenceNotes || null,
    nowIso(),
    id
  );
  return getSession(id);
}

function setExcluded(id, excluded) {
  db.prepare('UPDATE sessions SET excluded_from_analysis = ?, updated_at = ? WHERE id = ?').run(
    excluded ? 1 : 0,
    nowIso(),
    id
  );
  return getSession(id);
}

function setChatbotClassification(id, data) {
  db.prepare(
    'UPDATE sessions SET chatbot_classification_json = ?, updated_at = ? WHERE id = ?'
  ).run(JSON.stringify(data), nowIso(), id);
  return getSession(id);
}

module.exports = {
  db,
  createSession,
  getSession,
  listSessions,
  setConsentGiven,
  saveTurn,
  setReferenceData,
  setExcluded,
  setChatbotClassification,
};
