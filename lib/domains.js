'use strict';

/**
 * The 7 self-reported DN4-interview domains this chatbot must resolve
 * through open conversation. These keys are internal identifiers only --
 * the chatbot must never read the associated label to the patient as a
 * checklist item or quote any instrument's wording verbatim.
 */
const DOMAINS = [
  {
    key: 'burning',
    label: 'Burning sensation (sensación de quemazón / ardor)',
  },
  {
    key: 'painful_cold',
    label: 'Painful sensation of cold (sensación de frío doloroso)',
  },
  {
    key: 'electric_shocks',
    label: 'Electric shocks (descargas eléctricas)',
  },
  {
    key: 'tingling',
    label: 'Tingling (hormigueo)',
  },
  {
    key: 'pins_and_needles',
    label: 'Pins and needles (sensación de alfileres / agujas, picoteo)',
  },
  {
    key: 'numbness',
    label: 'Numbness (adormecimiento / entumecimiento)',
  },
  {
    key: 'itching',
    label: 'Itching in the painful area (picazón en la zona dolorosa)',
  },
];

const DOMAIN_KEYS = DOMAINS.map((d) => d.key);

// Short Spanish terms for each domain, used only to generate the
// chatbot-side auto-justification text in the admin "Resumen
// DN4-interview" panel -- never shown to the patient, and never used as
// checklist wording during the interview itself.
const DOMAIN_ES_LABELS = {
  burning: 'ardor',
  painful_cold: 'frío doloroso',
  electric_shocks: 'descargas eléctricas',
  tingling: 'hormigueo',
  pins_and_needles: 'alfileres/agujas',
  numbness: 'adormecimiento',
  itching: 'picazón',
};

/**
 * Red-flag symptoms that require immediate escalation and termination of
 * the interview. These are described here only to inform the model's
 * system prompt about what counts as a red flag -- the escalation MESSAGE
 * shown to the patient is fixed and hard-coded elsewhere (see
 * orchestrator.js: RED_FLAG_MESSAGE), never model-generated.
 */
const RED_FLAG_DESCRIPTIONS = [
  'Loss of bowel or bladder control',
  'Saddle anesthesia (numbness in the genital/perineal area)',
  'Fever associated with the back pain',
  'Significant unexplained weight loss',
  'Personal history of cancer',
  'Significant recent trauma to the back',
  'Progressive leg weakness',
];

function emptySlots() {
  const slots = {};
  for (const key of DOMAIN_KEYS) {
    slots[key] = 'unknown';
  }
  return slots;
}

module.exports = {
  DOMAINS,
  DOMAIN_KEYS,
  DOMAIN_ES_LABELS,
  RED_FLAG_DESCRIPTIONS,
  emptySlots,
};
