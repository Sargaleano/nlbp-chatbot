(function () {
  'use strict';

  const sessionId = window.location.pathname.split('/').filter(Boolean).pop();

  const screens = {
    loading: document.getElementById('loading-screen'),
    consent: document.getElementById('consent-screen'),
    chat: document.getElementById('chat-screen'),
    closing: document.getElementById('closing-screen'),
    notFound: document.getElementById('not-found-screen'),
  };

  function showScreen(name) {
    for (const key of Object.keys(screens)) {
      screens[key].hidden = key !== name;
    }
  }

  const messagesEl = document.getElementById('messages');
  const chatForm = document.getElementById('chat-form');
  const chatInput = document.getElementById('chat-input');
  const chatClosedRow = document.getElementById('chat-closed-row');
  const closeChatBtn = document.getElementById('close-chat-btn');
  const consentCheckbox = document.getElementById('consent-checkbox');
  const consentContinueBtn = document.getElementById('consent-continue');
  const closingText = document.getElementById('closing-text');

  function appendMessage(role, content) {
    const div = document.createElement('div');
    div.className = 'msg ' + (role === 'assistant' ? 'assistant' : 'user');
    div.textContent = content;
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function showTyping() {
    const div = document.createElement('div');
    div.className = 'typing-indicator';
    div.id = 'typing-indicator';
    div.textContent = 'Escribiendo...';
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function hideTyping() {
    const el = document.getElementById('typing-indicator');
    if (el) el.remove();
  }

  function renderTranscript(transcript) {
    messagesEl.innerHTML = '';
    for (const turn of transcript) {
      appendMessage(turn.role, turn.content);
    }
  }

  function lockChat() {
    // Hide the input row entirely rather than just disabling it, and
    // replace it with a "Cerrar" button -- disabled fields left sitting
    // on screen invite the patient to keep trying to type, whereas a
    // clear "you're done, close this" action is a cleaner end state.
    chatForm.hidden = true;
    chatClosedRow.hidden = false;
  }

  async function fetchJson(url, options) {
    const res = await fetch(url, options);
    let body = {};
    try {
      body = await res.json();
    } catch (e) {
      // no body
    }
    if (!res.ok) {
      throw new Error(body.error || 'Request failed');
    }
    return body;
  }

  async function init() {
    showScreen('loading');
    let session;
    try {
      session = await fetchJson(`/api/sessions/${sessionId}`);
    } catch (e) {
      showScreen('notFound');
      return;
    }

    if (session.transcript && session.transcript.length > 0) {
      // Resume an in-progress or completed interview (e.g. page refresh).
      renderTranscript(session.transcript);
      if (session.interviewComplete) {
        showChatThenMaybeClose(session);
      } else {
        showScreen('chat');
        chatInput.focus();
      }
      return;
    }

    if (!session.consentGiven) {
      if (session.consentMode === 'onscreen') {
        showScreen('consent');
        return;
      }
      // consentMode === 'external' but consentGiven somehow false: treat
      // conservatively and show consent screen rather than guessing.
      showScreen('consent');
      return;
    }

    // Consent already recorded (external, or onscreen-but-already-given on
    // a prior load) and no transcript yet: auto-start with zero clicks.
    await beginInterview();
  }

  function showChatThenMaybeClose(session) {
    showScreen('chat');
    if (session.interviewComplete) {
      lockChat();
    }
  }

  async function beginInterview() {
    showScreen('chat');
    showTyping();
    try {
      const result = await fetchJson(`/api/sessions/${sessionId}/start`, {
        method: 'POST',
      });
      hideTyping();
      appendMessage('assistant', result.reply);
      if (result.interviewComplete) {
        lockChat();
      } else {
        chatInput.focus();
      }
    } catch (e) {
      hideTyping();
      appendMessage('assistant', 'Lo sentimos, ocurrió un error al iniciar la entrevista.');
    }
  }

  consentCheckbox.addEventListener('change', () => {
    consentContinueBtn.disabled = !consentCheckbox.checked;
  });

  consentContinueBtn.addEventListener('click', async () => {
    consentContinueBtn.disabled = true;
    try {
      await fetchJson(`/api/sessions/${sessionId}/consent`, { method: 'POST' });
      // Single action both records consent AND starts the interview --
      // no separate "click here to begin" step.
      await beginInterview();
    } catch (e) {
      consentContinueBtn.disabled = false;
      alert('Ocurrió un error. Intente de nuevo.');
    }
  });

  chatForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const message = chatInput.value.trim();
    if (!message) return;
    chatInput.value = '';
    appendMessage('user', message);
    chatInput.disabled = true;
    showTyping();
    try {
      const result = await fetchJson(`/api/sessions/${sessionId}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      });
      hideTyping();
      appendMessage('assistant', result.reply);
      if (result.interviewComplete) {
        lockChat();
      } else {
        chatInput.disabled = false;
        chatInput.focus();
      }
    } catch (e) {
      hideTyping();
      appendMessage('assistant', 'Lo sentimos, ocurrió un error. Intente de nuevo.');
      chatInput.disabled = false;
    }
  });

  closeChatBtn.addEventListener('click', () => {
    // window.close() only works on a tab/window that was opened by
    // script (e.g. via window.open(), which is how the admin dashboard's
    // "Iniciar"/"Reanudar" buttons open this page) -- browsers silently
    // block it otherwise, with no error thrown. Detect that and fall
    // back to a plain instruction instead of a button that looks broken.
    window.close();
    setTimeout(() => {
      if (!window.closed) {
        closeChatBtn.hidden = true;
        const label = chatClosedRow.querySelector('span');
        if (label) label.textContent = 'La entrevista ha terminado. Puede cerrar esta pestaña.';
      }
    }, 300);
  });

  init();
})();
