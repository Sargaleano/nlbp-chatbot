(function () {
  'use strict';

  let allSessions = [];

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

  function truncateId(id, len = 12) {
    return id.length > len ? id.slice(0, len) + '…' : id;
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

  // Compact two-line date/time rendering: a full toLocaleString() string
  // (e.g. "17/9/2026, 5:39:45 a. m.") wraps awkwardly onto three lines in
  // a narrow column, sometimes leaving "a. m." orphaned on its own line.
  // Splitting date and time into two short lines keeps it to exactly two.
  function formatDateCell(iso) {
    const d = new Date(iso);
    const datePart = d.toLocaleDateString('es-CO');
    const timePart = d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
    return `<div>${datePart}</div><div class="date-cell-time">${timePart}</div>`;
  }

  // Interpolates the progress-bar fill color from amber (low completion)
  // to green (high completion), rather than a single fixed color.
  function progressColor(pct) {
    const hue = 45 + (150 - 45) * (pct / 100);
    return `hsl(${hue}, 62%, 42%)`;
  }

  function renderRow(s) {
    const tr = document.createElement('tr');

    const tdPatient = document.createElement('td');
    tdPatient.innerHTML = `
      <span class="id-copy-group">
        <span class="patient-id-pill">${s.patientId}</span>
        <button type="button" class="copy-btn" data-copy="${s.patientId}">Copiar</button>
      </span>`;

    const tdSession = document.createElement('td');
    tdSession.innerHTML = `
      <span class="id-copy-group mono">
        ${truncateId(s.id)}
        <button type="button" class="copy-btn" data-copy="${s.id}">Copiar</button>
      </span>`;

    const tdCreated = document.createElement('td');
    tdCreated.className = 'date-cell';
    tdCreated.innerHTML = formatDateCell(s.createdAt);

    const tdModified = document.createElement('td');
    tdModified.className = 'date-cell';
    tdModified.innerHTML = formatDateCell(s.updatedAt || s.createdAt);

    const tdConsent = document.createElement('td');
    tdConsent.textContent = s.consentGiven
      ? (s.consentMode === 'onscreen' ? 'Sí (en pantalla)' : 'Sí (en papel)')
      : 'Pendiente (' + (s.consentMode === 'onscreen' ? 'en pantalla' : 'en papel') + ')';

    // Estado column: status pill + a slim, color-coded progress bar
    // showing how many of the 7 clinical domains have been resolved so
    // far (a plain count of tracked data, not a diagnostic judgment).
    const tdEstado = document.createElement('td');
    const statusPill = document.createElement('span');
    statusPill.className = `status-pill status-${s.status}`;
    statusPill.textContent = statusLabel(s.status);
    tdEstado.appendChild(statusPill);

    const pct = s.domainsTotal > 0 ? Math.round((s.domainsResolved / s.domainsTotal) * 100) : 0;
    const track = document.createElement('div');
    track.className = 'progress-bar-track';
    track.title = `${s.domainsResolved}/${s.domainsTotal} dominios clínicos resueltos (${pct}%)`;
    const fill = document.createElement('div');
    fill.className = 'progress-bar-fill';
    fill.style.width = pct + '%';
    fill.style.background = progressColor(pct);
    track.appendChild(fill);
    tdEstado.appendChild(track);

    // Just the fraction, not fraction + percentage -- the bar's width and
    // color already carry the proportion; the count of resolved domains
    // is the number worth reading at a glance.
    const progressLabel = document.createElement('div');
    progressLabel.className = 'progress-bar-label';
    progressLabel.textContent = `${s.domainsResolved}/${s.domainsTotal} dominios`;
    tdEstado.appendChild(progressLabel);

    // Inclusión column: a toggle switch (checked = incluida en el
    // análisis/CSV). Reversible at any time.
    const tdInclusion = document.createElement('td');
    const toggleWrap = document.createElement('div');
    toggleWrap.className = 'toggle-with-label';

    const label = document.createElement('label');
    label.className = 'toggle-switch';
    label.title = s.excludedFromAnalysis
      ? 'Volver a incluir esta sesión en la exportación CSV'
      : 'Excluir esta sesión de la exportación CSV (reversible)';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = !s.excludedFromAnalysis;
    const slider = document.createElement('span');
    slider.className = 'toggle-slider';
    label.append(checkbox, slider);

    const stateText = document.createElement('span');
    stateText.className = 'toggle-state-text';
    stateText.style.color = s.excludedFromAnalysis ? 'var(--color-danger)' : 'var(--color-ok)';
    stateText.textContent = s.excludedFromAnalysis ? 'Excluida' : 'Incluida';

    checkbox.addEventListener('change', async () => {
      checkbox.disabled = true;
      try {
        await fetchJson(`/admin/sessions/${s.id}/exclude`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ excluded: !checkbox.checked }),
        });
        await load();
      } catch (e) {
        alert('No se pudo actualizar: ' + e.message);
        checkbox.checked = !checkbox.checked;
        checkbox.disabled = false;
      }
    });

    toggleWrap.append(label, stateText);
    tdInclusion.appendChild(toggleWrap);

    // Acciones column: buttons live inside an inner wrapper div, not
    // directly on the <td>. Setting display:flex straight on a table
    // cell caused inconsistent effective row heights between rows with
    // one button (completed sessions) and two (not-started/in-progress),
    // which visually misaligned the borders across the whole column --
    // keeping the <td> a plain table cell and flexing only the inner div
    // avoids that.
    const tdActions = document.createElement('td');
    const actionsWrap = document.createElement('div');
    actionsWrap.style.display = 'flex';
    actionsWrap.style.gap = '6px';
    actionsWrap.style.flexWrap = 'wrap';

    if (s.status === 'not_started') {
      const startBtn = document.createElement('button');
      startBtn.type = 'button';
      startBtn.className = 'btn-small';
      startBtn.textContent = 'Iniciar';
      startBtn.addEventListener('click', () => window.open(`/interview/${s.id}`, '_blank'));
      actionsWrap.appendChild(startBtn);
    } else if (s.status === 'in_progress') {
      const resumeBtn = document.createElement('button');
      resumeBtn.type = 'button';
      resumeBtn.className = 'btn-small';
      resumeBtn.textContent = 'Reanudar';
      resumeBtn.addEventListener('click', () => window.open(`/interview/${s.id}`, '_blank'));
      actionsWrap.appendChild(resumeBtn);
    }

    const viewBtn = document.createElement('button');
    viewBtn.type = 'button';
    viewBtn.className = 'btn-small btn-info';
    viewBtn.textContent = 'Detalles';
    viewBtn.addEventListener('click', () => {
      window.location.href = `/admin/sessions/${s.id}/view`;
    });
    actionsWrap.appendChild(viewBtn);
    tdActions.appendChild(actionsWrap);

    tr.append(tdPatient, tdSession, tdCreated, tdModified, tdConsent, tdEstado, tdInclusion, tdActions);
    return tr;
  }

  function renderTable(sessions) {
    const tbody = document.getElementById('sessions-tbody');
    const emptyState = document.getElementById('empty-state');
    tbody.innerHTML = '';
    if (sessions.length === 0) {
      emptyState.style.display = 'block';
      return;
    }
    emptyState.style.display = 'none';
    for (const s of sessions) {
      tbody.appendChild(renderRow(s));
    }
    // Wire up copy buttons after render.
    tbody.querySelectorAll('.copy-btn').forEach((btn) => {
      btn.addEventListener('click', () => copyToClipboard(btn.dataset.copy, btn));
    });
  }

  function applySearch() {
    const q = document.getElementById('search-input').value.trim().toLowerCase();
    if (!q) {
      renderTable(allSessions);
      return;
    }
    const filtered = allSessions.filter(
      (s) => s.patientId.toLowerCase().includes(q) || s.id.toLowerCase().includes(q)
    );
    renderTable(filtered);
  }

  function renderTotals(sessions) {
    const counts = { not_started: 0, in_progress: 0, complete: 0, red_flagged: 0 };
    for (const s of sessions) {
      if (counts[s.status] !== undefined) counts[s.status]++;
    }
    const total = sessions.length;
    const el = document.getElementById('totals-label');
    el.innerHTML =
      `<strong>Total sesiones: ${total}</strong> ` +
      `<span class="status-pill status-not_started">No iniciadas: ${counts.not_started}</span> ` +
      `<span class="status-pill status-in_progress">En curso: ${counts.in_progress}</span> ` +
      `<span class="status-pill status-complete">Completadas: ${counts.complete}</span> ` +
      `<span class="status-pill status-red_flagged">Alerta clínica: ${counts.red_flagged}</span>`;
  }

  async function load() {
    const { sessions } = await fetchJson('/admin/sessions');
    allSessions = sessions;
    // Totals always reflect every session on file, independent of the
    // current search filter -- this is a standing summary, not a count
    // of the filtered view.
    renderTotals(allSessions);
    applySearch();
  }

  document.getElementById('search-input').addEventListener('input', applySearch);

  document.getElementById('new-patient-btn').addEventListener('click', async () => {
    const consentMode = document.getElementById('consent-mode-select').value;
    try {
      const result = await fetchJson('/admin/sessions/new', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ consentMode }),
      });
      const box = document.getElementById('new-link-box');
      const text = document.getElementById('new-link-text');
      const fullUrl = window.location.origin + result.interviewUrl;
      text.textContent = `ID de paciente: ${result.patientId}   —   ${fullUrl}`;
      box.style.display = 'block';
      load();
    } catch (e) {
      alert('No se pudo crear la sesión: ' + e.message);
    }
  });

  document.getElementById('logout-btn').addEventListener('click', async () => {
    await fetch('/admin/logout', { method: 'POST' });
    window.location.href = '/admin';
  });

  load();
})();
