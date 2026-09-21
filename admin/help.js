(function () {
  'use strict';

  // Each page sets `window.HELP_CONTEXT` to 'login' | 'dashboard' | 'session'
  // before including this script, so the same modal shows content relevant
  // to whichever page it's opened from.
  const CONTEXT = window.HELP_CONTEXT || 'dashboard';

  const PREVIEW = {
    // No `disabled` attribute: these are static previews with no click
    // handlers attached, so nothing is actually clickable regardless --
    // `disabled` would only trigger the muted-gray CSS button state,
    // which is what made these look "pale" instead of their real color.
    crear: '<button type="button" class="btn-small">Crear</button>',
    iniciar: '<button type="button" class="btn-small">Iniciar</button>',
    reanudar: '<button type="button" class="btn-small">Reanudar</button>',
    detalles: '<button type="button" class="btn-small btn-info">Detalles</button>',
    csv: '<button type="button">Exportar CSV</button>',
    toggle:
      '<label class="toggle-switch" onclick="return false;"><input type="checkbox" checked /><span class="toggle-slider"></span></label>',
    generar: '<button type="button" class="btn-small btn-secondary">Generar evaluación con IA</button>',
    regenerar: '<a href="#" onclick="return false;">Regenerar</a>',
    eye: '<button type="button" class="eye-btn">👁</button>',
    guardar: '<button type="button">Guardar datos clínicos</button>',
    copiar: '<button type="button" class="copy-btn">Copiar</button>',
    pillNotStarted: '<span class="status-pill status-not_started">No iniciada</span>',
    pillInProgress: '<span class="status-pill status-in_progress">En curso</span>',
    pillComplete: '<span class="status-pill status-complete">Completa</span>',
    pillRedFlag: '<span class="status-pill status-red_flagged">Alerta clínica</span>',
  };

  function item(previewKey, text) {
    return `<div class="help-item">${PREVIEW[previewKey]}<span>${text}</span></div>`;
  }

  const BODIES = {
    login: `
      <h3>Contraseña de administrador</h3>
      <p>
        Es la que se generó (o configuró) al ejecutar <code>npm run setup</code> en la carpeta del
        proyecto. Si la olvidó, ejecute <code>npm run reset-password</code> desde una terminal en
        esa misma carpeta para generar una nueva — esto no afecta ninguna sesión ya guardada.
      </p>
      <h3>Comandos (terminal, en la carpeta del proyecto)</h3>
      <p>
        <code>npm install</code> — instala dependencias (sin compilación nativa).<br />
        <code>npm run setup</code> — primera configuración: crea <code>.env</code> con una
        contraseña de administrador y una clave de sesión generadas automáticamente.<br />
        <code>npm run reset-password</code> — genera una nueva contraseña de administrador.<br />
        <code>npm run set-api-key</code> — actualiza la clave de la API de Anthropic si expira
        o se rota.<br />
        <code>npm start</code> — inicia el servidor en <code>http://localhost:3000</code>.
      </p>
      <p style="font-size:0.78rem;">Consulte <code>README.md</code> para la guía completa.</p>
    `,
    dashboard: `
      <h3>Acciones de esta página</h3>
      ${item('crear', 'Crea una nueva sesión de paciente con el modo de consentimiento elegido.')}
      ${item('iniciar', 'Abre la entrevista del paciente en una pestaña nueva (sesión aún no iniciada).')}
      ${item('reanudar', 'Reabre una entrevista en curso exactamente donde se quedó.')}
      ${item('detalles', 'Muestra la transcripción completa y los datos clínicos de esa sesión.')}
      ${item('toggle', 'Incluye o excluye la sesión de la exportación CSV (reversible, no borra datos).')}
      ${item('csv', 'Descarga todas las sesiones incluidas, con sus dominios y datos clínicos.')}
      <p style="margin-top:14px;">
        El cuadro de búsqueda filtra por ID de paciente o ID de sesión. Los totales bajo la tabla
        siempre reflejan todas las sesiones, sin importar el filtro de búsqueda activo.
      </p>
      <h3>Ciclo de estado de una entrevista</h3>
      <div class="help-item">${PREVIEW.pillNotStarted} → ${PREVIEW.pillInProgress} → ${PREVIEW.pillComplete}</div>
      <p>
        Una sesión pasa de "No iniciada" a "En curso" en cuanto el paciente escribe su primer
        mensaje, y a "Completa" cuando el chatbot determina que ya elicitó los 7 dominios clínicos
        (o agotó intentos razonables de aclararlos).
      </p>
      <div class="help-item">${PREVIEW.pillRedFlag}</div>
      <p>
        Se activa automáticamente, en cualquier momento de la conversación, si el paciente menciona
        alguno de estos síntomas de alerta: pérdida de control de esfínteres, anestesia en silla de
        montar, fiebre asociada al dolor, pérdida de peso inexplicada, antecedente personal de
        cáncer, trauma reciente significativo en la espalda, o debilidad progresiva en las piernas.
        Cuando esto ocurre, la entrevista se detiene de inmediato y se muestra un mensaje de
        seguridad fijo — nunca generado por el modelo — pidiendo al paciente avisar a la persona
        encargada de la sesión.
      </p>
    `,
    session: `
      <h3>Acciones de esta página</h3>
      ${item('toggle', 'Incluye o excluye esta sesión de la exportación CSV (reversible, no borra datos).')}
      ${item('copiar', 'Copia el ID completo (paciente o sesión) al portapapeles.')}
      ${item('generar', 'Analiza la conversación completa y genera una clasificación tentativa (no validada) con su explicación.')}
      ${item('regenerar', 'Vuelve a generar la evaluación, reemplazando la anterior con una nueva llamada al modelo.')}
      ${item('eye', 'Muestra u oculta un campo generado por IA (oculto por defecto).')}
      ${item('guardar', 'Guarda el puntaje y la clasificación clínica que usted ingresó manualmente.')}
      <p style="margin-top:14px;">
        Los campos del panel Clínico nunca se pre-completan a partir de la salida del chatbot.
      </p>
    `,
  };

  const HELP_HTML = `
    <div id="help-modal-overlay" class="modal-overlay" hidden>
      <div class="modal-box" role="dialog" aria-modal="true" aria-labelledby="help-modal-title">
        <div class="modal-header">
          <h2 id="help-modal-title">Ayuda</h2>
          <button id="help-modal-close" class="modal-close" type="button" aria-label="Cerrar">&times;</button>
        </div>
        <div class="modal-body">${BODIES[CONTEXT] || BODIES.dashboard}</div>
      </div>
    </div>
  `;

  function init() {
    document.body.insertAdjacentHTML('beforeend', HELP_HTML);
    const overlay = document.getElementById('help-modal-overlay');
    const openBtn = document.getElementById('help-btn');
    const closeBtn = document.getElementById('help-modal-close');

    if (openBtn) {
      openBtn.addEventListener('click', (e) => {
        e.preventDefault();
        overlay.hidden = false;
      });
    }
    closeBtn.addEventListener('click', () => {
      overlay.hidden = true;
    });
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.hidden = true;
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !overlay.hidden) overlay.hidden = true;
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
