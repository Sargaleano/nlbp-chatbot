(function () {
  'use strict';

  const sessionId = window.location.pathname.split('/')[3];
  let currentSession = null;

  async function fetchJson(url, options) {
    const res = await fetch(url, options);
    if (res.status === 401) {
      window.location.href = '/admin';
      throw new Error('No autenticado');
    }
    let body = {};
    try {
      body = await res.json();
    } catch (e) {}
    if (!res.ok) throw new Error(body.error || 'La solicitud falló');
    return body;
  }

  function statusLabel(status) {
    const map = {
      not_started: 'No iniciada',
      in_progress: 'En curso',
      complete: 'Completa',
      red_flagged: 'Alerta clínica',
    };
    return map[status] || status;
  }

  function slotClass(val) {
    return 'slot-' + val;
  }

  function copyToClipboard(text, btnEl) {
    navigator.clipboard.writeText(text).then(() => {
      const original = btnEl.textContent;
      btnEl.textContent = 'Copiado';
      btnEl.classList.add('copied');
      setTimeout(() => {
        btnEl.textContent = original;
        btnEl.classList.remove('copied');
      }, 1400);
    });
  }

  function classificationLabel(code) {
    const map = {
      neuropathic: 'Neuropático (tentativo, generado por IA)',
      nociceptive: 'Nociceptivo (tentativo, generado por IA)',
      ambiguous: 'Ambiguo (tentativo, generado por IA)',
    };
    return map[code] || code || '—';
  }

  let classificationVisible = false;
  let explanationVisible = false;

  function renderClassificationBlock() {
    const cc = currentSession.chatbotClassification;
    const generateWrap = document.getElementById('chatbot-classification-generate');
    const classEyeBtn = document.getElementById('toggle-classification-btn');
    const explEyeBtn = document.getElementById('toggle-explanation-btn');
    const classField = document.getElementById('chatbot-classification');
    const explField = document.getElementById('chatbot-explanation');
    const meta = document.getElementById('chatbot-classification-meta');
    const generateBtn = document.getElementById('generate-classification-btn');

    if (!cc) {
      // Never generated yet for this session -- show the explicit,
      // admin-initiated trigger, and leave both fields showing a plain
      // placeholder rather than dots (nothing to hide yet). Never
      // auto-generated in the background.
      generateBtn.hidden = false;
      generateBtn.textContent = 'Generar evaluación con IA';
      classEyeBtn.hidden = true;
      explEyeBtn.hidden = true;
      classField.textContent = '—';
      explField.textContent = '—';
      meta.style.display = 'none';
      return;
    }

    generateBtn.hidden = true;
    classEyeBtn.hidden = false;
    explEyeBtn.hidden = false;
    meta.style.display = 'block';
    document.getElementById('chatbot-classification-generated-at').textContent =
      'Generado: ' + new Date(cc.generatedAt).toLocaleString('es-CO');

    if (classificationVisible) {
      classField.textContent = classificationLabel(cc.classification);
      classEyeBtn.textContent = '🙈';
      classEyeBtn.title = 'Ocultar';
    } else {
      classField.textContent = '••••••••••••••••••••';
      classEyeBtn.textContent = '👁';
      classEyeBtn.title = 'Mostrar';
    }

    if (explanationVisible) {
      explField.textContent = cc.rationale || '—';
      explEyeBtn.textContent = '🙈';
      explEyeBtn.title = 'Ocultar';
    } else {
      explField.textContent = '••••••••••••••••••••';
      explEyeBtn.textContent = '👁';
      explEyeBtn.title = 'Mostrar';
    }
  }

  function renderExcludeToggle() {
    const checkbox = document.getElementById('exclude-toggle-checkbox');
    const label = document.getElementById('exclude-toggle-label');
    checkbox.checked = !currentSession.excludedFromAnalysis;
    label.textContent = currentSession.excludedFromAnalysis ? 'Excluida' : 'Incluida';
    label.style.color = currentSession.excludedFromAnalysis ? 'var(--color-danger)' : 'var(--color-ok)';
  }

  async function load() {
    const { session } = await fetchJson(`/admin/sessions/${sessionId}`);
    currentSession = session;

    document.getElementById('session-title').textContent = `Ficha del paciente — ${session.patientId}`;
    document.getElementById('full-id-text').textContent = session.id;

    document.getElementById('summary-line').innerHTML =
      `ID de paciente: <span class="patient-id-pill">${session.patientId}</span> &nbsp;|&nbsp; ` +
      `Creado: ${new Date(session.createdAt).toLocaleString('es-CO')} &nbsp;|&nbsp; ` +
      `Modificado: ${new Date(session.updatedAt || session.createdAt).toLocaleString('es-CO')} &nbsp;|&nbsp; ` +
      `Consentimiento: ${session.consentGiven ? 'Sí' : 'Pendiente'} (${session.consentMode === 'onscreen' ? 'en pantalla' : 'en papel'}) &nbsp;|&nbsp; ` +
      `Estado: <strong>${statusLabel(session.status)}</strong> &nbsp;|&nbsp; ` +
      `Dominios resueltos: <strong>${session.domainsResolved}/${session.domainsTotal}</strong>` +
      (session.completedAt ? ` &nbsp;|&nbsp; Completada: ${new Date(session.completedAt).toLocaleString('es-CO')}` : '');

    if (session.redFlag) {
      const banner = document.getElementById('red-flag-banner');
      banner.style.display = 'block';
      banner.textContent = 'ALERTA CLÍNICA: ' + (session.redFlagReason || 'Se reportó un síntoma de alerta durante esta entrevista.');
    }

    renderExcludeToggle();

    const slotGrid = document.getElementById('slot-grid');
    slotGrid.innerHTML = '';
    for (const [key, val] of Object.entries(session.slots || {})) {
      const div = document.createElement('div');
      div.innerHTML = `<span>${key}:</span> <span class="${slotClass(val)}">${val}</span>`;
      slotGrid.appendChild(div);
    }

    const transcriptView = document.getElementById('transcript-view');
    transcriptView.innerHTML = '';
    if (session.transcript.length === 0) {
      transcriptView.innerHTML = '<p class="empty-state" style="margin:0;">Aún no hay conversación registrada.</p>';
    }
    for (const turn of session.transcript) {
      const div = document.createElement('div');
      div.className = 'msg ' + (turn.role === 'assistant' ? 'assistant' : 'user');
      div.style.margin = '10px';
      div.textContent = turn.content;
      transcriptView.appendChild(div);
    }

    document.getElementById('dn4-score').value = session.dn4Score ?? '';
    document.getElementById('ref-class').value = session.referenceClassification || '';
    document.getElementById('ref-notes').value = session.referenceNotes || '';

    const cs = session.chatbotSummary || { score: 0, maxScore: 7 };
    document.getElementById('chatbot-score').textContent = `${cs.score}/${cs.maxScore}`;
    renderClassificationBlock();
  }

  document.getElementById('copy-id-btn').addEventListener('click', (e) => {
    copyToClipboard(sessionId, e.target);
  });

  document.getElementById('toggle-classification-btn').addEventListener('click', () => {
    classificationVisible = !classificationVisible;
    renderClassificationBlock();
  });

  document.getElementById('toggle-explanation-btn').addEventListener('click', () => {
    explanationVisible = !explanationVisible;
    renderClassificationBlock();
  });

  async function generateClassification(buttonEl) {
    const statusEl = document.getElementById('generate-status');
    buttonEl.disabled = true;
    statusEl.textContent = 'Generando... (puede tardar unos segundos)';
    try {
      const result = await fetchJson(`/admin/sessions/${sessionId}/generate-classification`, {
        method: 'POST',
      });
      currentSession.chatbotClassification = result.chatbotClassification;
      classificationVisible = false;
      explanationVisible = false;
      statusEl.textContent = '';
      renderClassificationBlock();
    } catch (err) {
      statusEl.textContent = '';
      alert('No se pudo generar la evaluación: ' + err.message);
      buttonEl.disabled = false;
    }
  }

  document.getElementById('generate-classification-btn').addEventListener('click', (e) => {
    generateClassification(e.target);
  });

  document.getElementById('regenerate-classification-btn').addEventListener('click', (e) => {
    e.preventDefault();
    if (!confirm('¿Regenerar la evaluación de IA? Esto reemplazará la evaluación actual con una nueva llamada al modelo.')) {
      return;
    }
    generateClassification(document.getElementById('generate-classification-btn'));
  });

  document.getElementById('exclude-toggle-checkbox').addEventListener('change', async (e) => {
    const wantIncluded = e.target.checked;
    e.target.disabled = true;
    try {
      await fetchJson(`/admin/sessions/${sessionId}/exclude`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ excluded: !wantIncluded }),
      });
      await load();
    } catch (err) {
      alert('No se pudo actualizar: ' + err.message);
      e.target.checked = !wantIncluded;
      e.target.disabled = false;
    }
  });

  document.getElementById('save-reference-btn').addEventListener('click', async () => {
    const dn4ScoreRaw = document.getElementById('dn4-score').value;
    const dn4Score = dn4ScoreRaw === '' ? null : Number(dn4ScoreRaw);
    const referenceClassification = document.getElementById('ref-class').value || null;
    const referenceNotes = document.getElementById('ref-notes').value || null;

    try {
      await fetchJson(`/admin/sessions/${sessionId}/reference`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dn4Score, referenceClassification, referenceNotes }),
      });
      const status = document.getElementById('save-status');
      status.textContent = 'Guardado.';
      setTimeout(() => (status.textContent = ''), 2000);
    } catch (e) {
      alert('No se pudo guardar: ' + e.message);
    }
  });

  document.getElementById('logout-btn').addEventListener('click', async () => {
    await fetch('/admin/logout', { method: 'POST' });
    window.location.href = '/admin';
  });

  load();
})();
