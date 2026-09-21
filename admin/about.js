(function () {
  'use strict';

  const ABOUT_HTML = `
    <div id="about-modal-overlay" class="modal-overlay" hidden>
      <div class="modal-box" role="dialog" aria-modal="true" aria-labelledby="about-modal-title">
        <div class="modal-header">
          <h2 id="about-modal-title">Acerca de este software</h2>
          <button id="about-modal-close" class="modal-close" type="button" aria-label="Cerrar">&times;</button>
        </div>
        <div class="modal-body">
          <h3>NLBP</h3>
          <p>
            Nonspecific Low Back Pain (dolor lumbar no específico): dolor en la región lumbar sin
            una causa estructural específica identificable (por ejemplo, hernia discal, fractura o
            infección), y la forma más frecuente de dolor lumbar en la práctica clínica. Se estima
            que hasta el 90% de los episodios de dolor lumbar corresponden a esta categoría, y las
            guías clínicas recomiendan un manejo conservador basado en evidencia para la gran
            mayoría de los casos, reservando estudios de imagen y derivaciones especializadas para
            señales de alarma específicas.
          </p>
          <p style="font-size:0.78rem;">
            Más info:
            <a href="https://es.wikipedia.org/wiki/Lumbalgia" target="_blank" rel="noopener">Lumbalgia — Wikipedia</a>
          </p>

          <h3>DN4-interview</h3>
          <p>
            Subconjunto de 7 ítems autorreportados del cuestionario Douleur Neuropathique 4 (DN4),
            un instrumento validado para detectar dolor de características neuropáticas a partir
            de cómo el propio paciente describe su dolor (ardor, frío doloroso, descargas
            eléctricas, hormigueo, alfileres/agujas, adormecimiento y picazón). El DN4 completo
            incluye además 3 ítems de examen físico que no se evalúan en este prototipo. Fue
            desarrollado en 2005 por Bouhassira, Attal y colaboradores del French Neuropathic Pain
            Group, y ha sido validado en más de 15 idiomas.
          </p>
          <p style="font-size:0.78rem;">
            Más info:
            <a href="https://es.wikimedecine.fr/Cuestionario_DN4" target="_blank" rel="noopener">Cuestionario DN4 — Wikimedicina</a>
          </p>

          <h3>Propósito de la herramienta</h3>
          <p>
            NLBP Chatbot es una aplicación desarrollada como herramienta de apoyo para estudios que
            investigan si un chatbot conversacional, mediante diálogo abierto y adaptativo — sin
            leer el DN4 como cuestionario ni reproducir su redacción exacta — puede elicitar los
            mismos conceptos clínicos que el DN4-interview, y alcanzar una concordancia sustancial
            con la clasificación obtenida mediante el DN4-interview administrado por un clínico,
            evaluando ambos frente a un estándar de referencia clínico ciego. La herramienta se
            libera como software libre para que otros equipos de investigación puedan replicar o
            adaptar el estudio.
          </p>

          <div class="about-notice-box">
            <strong>NLBP Chatbot</strong><br />
            © 2026 Sergio Rojas-Galeano · v1.0 · srojas@udistrital.edu.co
            <p style="margin:8px 0 0;">
              Aviso: NLBP Chatbot fue desarrollado mediante <em>vibe-coding</em> con la asistencia
              de Claude AI (Anthropic, modelo Sonnet 5). La idea original, el diseño conceptual, la
              elaboración de instrucciones (prompting), la supervisión, las pruebas, las
              correcciones, la documentación, el despliegue y la gestión del desarrollo estuvieron
              a cargo del autor.
            </p>
            <p style="margin:8px 0 0;">
              Licencia: <a href="https://opensource.org/license/mit" target="_blank" rel="noopener">MIT</a>
              (la carpeta de descarga contiene una copia del archivo <code>LICENSE</code>).
            </p>
          </div>
        </div>
      </div>
    </div>
  `;

  function init() {
    document.body.insertAdjacentHTML('beforeend', ABOUT_HTML);
    const overlay = document.getElementById('about-modal-overlay');
    const openBtn = document.getElementById('about-btn');
    const closeBtn = document.getElementById('about-modal-close');

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
