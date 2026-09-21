'use strict';

const path = require('node:path');
const fs = require('node:fs');

// Load .env if present (tiny hand-rolled loader -- avoids adding a
// dependency just for this).
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

const express = require('express');
const cookieSession = require('cookie-session');

const db = require('./lib/db');
const { login, requireAdmin } = require('./lib/adminAuth');
const orchestrator = require('./lib/orchestrator');
const { DOMAIN_KEYS, DOMAIN_ES_LABELS } = require('./lib/domains');

// Prints the actual cause of an Anthropic API (or other) error to the
// server console -- the generic message shown to the patient in the chat
// UI deliberately says nothing more than "an error occurred" (never leaks
// internals to the browser), so this is the one place the real reason is
// visible. Check this console when something fails.
function logApiError(label, err) {
  console.error(`\n=== ${label} ===`);
  if (err && err.status) {
    console.error('HTTP status:', err.status);
  }
  if (err && err.error) {
    console.error('API error body:', JSON.stringify(err.error, null, 2));
  } else if (err && err.message) {
    console.error('Message:', err.message);
  } else {
    console.error(err);
  }
  console.error('===\n');
}

const app = express();
app.use(express.json());

app.use(
  cookieSession({
    name: 'nlbp_admin_session',
    keys: [process.env.SESSION_SECRET || 'changeme-generate-a-real-random-secret'],
    maxAge: 8 * 60 * 60 * 1000, // 8 hours
    httpOnly: true,
    sameSite: 'lax',
  })
);

// ---------------------------------------------------------------------
// Static frontends
// ---------------------------------------------------------------------
app.use('/admin-assets', express.static(path.join(__dirname, 'admin')));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/admin', (req, res) => {
  if (req.session && req.session.isAdmin) {
    res.sendFile(path.join(__dirname, 'admin', 'dashboard.html'));
  } else {
    res.sendFile(path.join(__dirname, 'admin', 'login.html'));
  }
});

app.get('/admin/sessions/:id/view', (req, res) => {
  if (!(req.session && req.session.isAdmin)) {
    return res.redirect('/admin');
  }
  res.sendFile(path.join(__dirname, 'admin', 'session.html'));
});

app.get('/interview/:id', (req, res) => {
  const session = db.getSession(req.params.id);
  if (!session) {
    return res.status(404).send('Session not found.');
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ---------------------------------------------------------------------
// Admin auth
// ---------------------------------------------------------------------
app.post('/admin/login', (req, res) => {
  const { password } = req.body || {};
  if (login(password)) {
    req.session.isAdmin = true;
    return res.json({ ok: true });
  }
  return res.status(401).json({ error: 'Incorrect password' });
});

app.post('/admin/logout', (req, res) => {
  req.session = null;
  res.json({ ok: true });
});

// ---------------------------------------------------------------------
// Admin session management
// ---------------------------------------------------------------------
function computeStatus(s) {
  if (s.redFlag) return 'red_flagged';
  if (s.interviewComplete) return 'complete';
  if (s.transcript.length > 0) return 'in_progress';
  return 'not_started';
}

function countDomainsResolved(slots) {
  return DOMAIN_KEYS.filter((k) => slots[k] && slots[k] !== 'unknown').length;
}

// Chatbot-side auto-summary for the admin "Resumen DN4-interview" panel.
// Score and justification are a plain restatement of data already
// tracked (a count of "yes" domains) -- safe, not a judgment call. The
// tentative classification itself is NOT computed here: it now comes
// from an admin-triggered Claude call (see lib/orchestrator.js
// classifySession and the /generate-classification route below), cached
// on the session as chatbotClassification, rather than a rigid numeric
// cutoff.
function computeChatbotSummary(session) {
  const slots = session.slots || {};
  const positive = DOMAIN_KEYS.filter((k) => slots[k] === 'yes');
  const negative = DOMAIN_KEYS.filter((k) => slots[k] === 'no');
  const unresolved = DOMAIN_KEYS.filter((k) => !slots[k] || slots[k] === 'unknown');

  const label = (k) => DOMAIN_ES_LABELS[k] || k;
  const parts = [];
  parts.push(
    positive.length > 0
      ? `Dominios positivos: ${positive.map(label).join(', ')}.`
      : 'Dominios positivos: ninguno.'
  );
  parts.push(
    negative.length > 0
      ? `Dominios negativos: ${negative.map(label).join(', ')}.`
      : 'Dominios negativos: ninguno.'
  );
  if (unresolved.length > 0) {
    parts.push(`Sin resolver: ${unresolved.map(label).join(', ')}.`);
  }

  return {
    score: positive.length,
    maxScore: DOMAIN_KEYS.length,
    justification: parts.join(' '),
  };
}

app.get('/admin/sessions', requireAdmin, (req, res) => {
  const sessions = db.listSessions().map((s) => ({
    id: s.id,
    patientId: s.patientId,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    consentMode: s.consentMode,
    consentGiven: s.consentGiven,
    status: computeStatus(s),
    domainsResolved: countDomainsResolved(s.slots),
    domainsTotal: DOMAIN_KEYS.length,
    excludedFromAnalysis: s.excludedFromAnalysis,
  }));
  res.json({ sessions });
});

app.post('/admin/sessions/new', requireAdmin, (req, res) => {
  const { consentMode } = req.body || {};
  if (consentMode !== 'onscreen' && consentMode !== 'external') {
    return res.status(400).json({ error: "consentMode must be 'onscreen' or 'external'" });
  }
  const session = db.createSession(consentMode);
  res.json({
    sessionId: session.id,
    patientId: session.patientId,
    interviewUrl: `/interview/${session.id}`,
  });
});

app.post('/admin/sessions/:id/generate-classification', requireAdmin, async (req, res) => {
  const session = db.getSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'Not found' });
  if (session.transcript.length === 0) {
    return res.status(400).json({ error: 'No hay conversación para analizar' });
  }
  try {
    const result = await orchestrator.classifySession(session);
    const updated = db.setChatbotClassification(req.params.id, {
      classification: result.classification,
      rationale: result.rationale,
      generatedAt: new Date().toISOString(),
    });
    res.json({ chatbotClassification: updated.chatbotClassification });
  } catch (err) {
    logApiError('Error generating chatbot classification', err);
    res.status(500).json({ error: 'No se pudo generar la evaluación' });
  }
});

app.get('/admin/sessions/:id', requireAdmin, (req, res) => {
  const session = db.getSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'Not found' });
  res.json({
    session: {
      ...session,
      status: computeStatus(session),
      domainsResolved: countDomainsResolved(session.slots),
      domainsTotal: DOMAIN_KEYS.length,
      chatbotSummary: computeChatbotSummary(session),
    },
  });
});

app.put('/admin/sessions/:id/exclude', requireAdmin, (req, res) => {
  const session = db.getSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'Not found' });
  const { excluded } = req.body || {};
  const updated = db.setExcluded(req.params.id, !!excluded);
  res.json({ excludedFromAnalysis: updated.excludedFromAnalysis });
});

app.put('/admin/sessions/:id/reference', requireAdmin, (req, res) => {
  const session = db.getSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'Not found' });
  const { dn4Score, referenceClassification, referenceNotes } = req.body || {};
  if (
    dn4Score !== undefined &&
    dn4Score !== null &&
    (typeof dn4Score !== 'number' || dn4Score < 0 || dn4Score > 7)
  ) {
    return res.status(400).json({ error: 'dn4Score must be an integer 0-7' });
  }
  const updated = db.setReferenceData(req.params.id, {
    dn4Score,
    referenceClassification,
    referenceNotes,
  });
  res.json({ session: updated });
});

app.get('/admin/export.csv', requireAdmin, (req, res) => {
  // Sessions toggled "excluded from analysis" are left out of the export
  // entirely (the toggle is reversible -- see PUT .../exclude -- so this
  // is not data loss, just a filter on this particular export).
  const sessions = db.listSessions().filter((s) => !s.excludedFromAnalysis);
  const header = [
    'id',
    'patient_id',
    'created_at',
    'updated_at',
    'consent_mode',
    'consent_given',
    'status',
    'red_flag',
    'red_flag_reason',
    'interview_complete',
    'completed_at',
    ...DOMAIN_KEYS,
    'dn4_score',
    'reference_classification',
    'reference_notes',
    'chatbot_dn4_score',
    'chatbot_ai_classification',
    'chatbot_ai_classification_generated_at',
    'chatbot_ai_rationale',
    'transcript',
  ];

  const csvEscape = (val) => {
    if (val === null || val === undefined) return '';
    const str = String(val);
    if (/[",\n]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const formatTranscript = (transcript) =>
    (transcript || [])
      .map((t) => `${t.role === 'assistant' ? 'Chatbot' : 'Paciente'}: ${t.content}`)
      .join('\n\n');

  const rows = sessions.map((s) => {
    const chatbotSummary = computeChatbotSummary(s);
    const row = [
      s.id,
      s.patientId,
      s.createdAt,
      s.updatedAt || s.createdAt,
      s.consentMode,
      s.consentGiven ? 1 : 0,
      computeStatus(s),
      s.redFlag ? 1 : 0,
      s.redFlagReason || '',
      s.interviewComplete ? 1 : 0,
      s.completedAt || '',
      ...DOMAIN_KEYS.map((k) => s.slots[k] || 'unknown'),
      s.dn4Score === null || s.dn4Score === undefined ? '' : s.dn4Score,
      s.referenceClassification || '',
      s.referenceNotes || '',
      chatbotSummary.score,
      // Only populated if the admin explicitly generated it on that
      // session's detail page -- never computed live during export, to
      // avoid surprise API calls/costs across a whole dataset at once.
      s.chatbotClassification ? s.chatbotClassification.classification : '',
      s.chatbotClassification ? s.chatbotClassification.generatedAt : '',
      s.chatbotClassification ? s.chatbotClassification.rationale : '',
      formatTranscript(s.transcript),
    ];
    return row.map(csvEscape).join(',');
  });

  const csv = [header.join(','), ...rows].join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="nlbp-sessions-export.csv"');
  res.send(csv);
});

// ---------------------------------------------------------------------
// Public patient-facing routes (no login -- gated only by the
// unguessable session URL)
// ---------------------------------------------------------------------
app.get('/api/sessions/:id', (req, res) => {
  const session = db.getSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'Not found' });
  res.json({
    consentMode: session.consentMode,
    consentGiven: session.consentGiven,
    interviewComplete: session.interviewComplete,
    redFlag: session.redFlag,
    transcript: session.transcript,
  });
});

app.post('/api/sessions/:id/consent', (req, res) => {
  const session = db.getSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'Not found' });
  if (session.consentMode !== 'onscreen') {
    return res.status(400).json({ error: 'This session does not use on-screen consent' });
  }
  const updated = db.setConsentGiven(req.params.id);
  res.json({ consentGiven: updated.consentGiven });
});

app.post('/api/sessions/:id/start', async (req, res) => {
  const session = db.getSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'Not found' });
  if (!session.consentGiven) {
    return res.status(400).json({ error: 'Consent has not been recorded for this session' });
  }
  if (session.transcript.length > 0) {
    // Already started -- just return the existing transcript's first turn
    // rather than generating a duplicate greeting.
    return res.json({
      reply: session.transcript[0]?.content || '',
      interviewComplete: session.interviewComplete,
      redFlag: session.redFlag,
    });
  }

  try {
    const result = await orchestrator.startInterview();
    const transcript = [{ role: 'assistant', content: result.displayReply }];
    const updated = db.saveTurn(req.params.id, {
      transcript,
      slots: result.slots || session.slots,
      redFlag: result.redFlag,
      redFlagReason: result.redFlagReason,
      interviewComplete: result.interviewComplete,
    });
    res.json({
      reply: result.displayReply,
      interviewComplete: updated.interviewComplete,
      redFlag: updated.redFlag,
    });
  } catch (err) {
    logApiError('Error starting interview', err);
    res.status(500).json({ error: 'Failed to start interview' });
  }
});

app.post('/api/sessions/:id/message', async (req, res) => {
  const session = db.getSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'Not found' });
  if (session.interviewComplete) {
    return res.status(400).json({ error: 'This interview has already ended' });
  }
  const { message } = req.body || {};
  if (typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'message is required' });
  }

  try {
    const result = await orchestrator.runTurn(session.transcript, message);
    const transcript = [
      ...session.transcript,
      { role: 'user', content: message },
      { role: 'assistant', content: result.displayReply },
    ];
    const updated = db.saveTurn(req.params.id, {
      transcript,
      slots: result.slots || session.slots,
      redFlag: result.redFlag,
      redFlagReason: result.redFlagReason,
      interviewComplete: result.interviewComplete,
    });
    res.json({
      reply: result.displayReply,
      interviewComplete: updated.interviewComplete,
      redFlag: updated.redFlag,
    });
  } catch (err) {
    logApiError('Error processing turn', err);
    res.status(500).json({ error: 'Failed to process message' });
  }
});

// ---------------------------------------------------------------------
const PORT = Number(process.env.PORT) || 3000;

// Bind ONLY to loopback addresses -- this app must never be reachable over
// a network. Do not change '127.0.0.1' or '::1' to '0.0.0.0' or any real
// network interface address.
//
// Two listeners (IPv4 loopback + IPv6 loopback) rather than one: some
// operating systems resolve the hostname "localhost" to the IPv6 loopback
// (::1) first. Binding only '127.0.0.1' would make http://localhost work
// on some machines and stall or fail on others, depending on that
// resolution order. Both addresses are still pure loopback -- this does
// not expose the app to any network.
const http = require('node:http');

http.createServer(app).listen(PORT, '127.0.0.1', () => {
  console.log(`NLBP chatbot prototype running at http://localhost:${PORT}`);
  console.log(`Admin dashboard: http://localhost:${PORT}/admin`);
});

http.createServer(app).listen(PORT, '::1', () => {
  // Second listener for IPv6 loopback -- same app, same port, no separate
  // log line needed.
}).on('error', () => {
  // IPv6 loopback isn't available on every machine (e.g. IPv6 disabled).
  // That's fine -- the IPv4 listener above still makes the app reachable.
});
