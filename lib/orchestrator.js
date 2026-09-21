'use strict';

const Anthropic = require('@anthropic-ai/sdk');
const { DOMAINS, DOMAIN_KEYS, DOMAIN_ES_LABELS, RED_FLAG_DESCRIPTIONS } = require('./domains');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-5';

// ---------------------------------------------------------------------
// FIXED, HARD-CODED SAFETY MESSAGES
//
// These strings are shown to the patient verbatim and are NEVER passed
// through the model. This is a hard safety requirement: escalation
// wording must never depend on the LLM improvising well in a high-stakes
// moment. If a red flag fires, this text overrides whatever the model
// produced in that turn.
// ---------------------------------------------------------------------
const RED_FLAG_MESSAGE =
  'Gracias por contarme esto. Es importante que un profesional de la salud hable con usted directamente y lo antes posible. ' +
  'Por favor avise ahora mismo a la persona encargada de esta sesión. La entrevista se detiene aquí.';

const CLOSING_MESSAGE =
  'Hemos terminado con las preguntas de esta parte. Muchas gracias por su tiempo y por compartir esta información. ' +
  'Por favor avise a la persona encargada de la sesión de que ha terminado.';

function buildSystemPrompt() {
  const domainList = DOMAINS.map((d) => `- ${d.key}: ${d.label}`).join('\n');
  const redFlagList = RED_FLAG_DESCRIPTIONS.map((r) => `- ${r}`).join('\n');

  return `You are a research assistant chatbot conducting a structured but conversational interview with a patient about their low back pain, as part of a research study (Phase 1 prototype). You are NOT a clinician and you are gathering descriptive information only.

## Your goal
Through open, natural conversation, determine whether each of the following 7 clinical concepts is PRESENT or ABSENT in the patient's own experience of their pain:

${domainList}

## Critical methodological rules
- Ask the patient to describe their pain freely and in their own words FIRST. Do not open with a checklist.
- Never read the 7 concepts above as a list, never enumerate them to the patient, and never quote or closely paraphrase the exact wording of any published pain questionnaire (e.g. DN4, painDETECT). The specific phrasing of your questions must be your own, natural, conversational language -- open elicitation of these concepts is the object of the research, not a scripted read-through.
- Follow up conversationally only on whichever domains remain unclear after the patient's free description. If the patient's spontaneous description already covers a domain clearly, do not ask about it again.
- Adapt your register, tone, and vocabulary to how the patient expresses themselves (formal/informal, technical/plain language, etc). Respond in the same language the patient uses; default to Spanish (Colombia) if unclear, since this study is conducted in Bogotá.
- Keep your messages short and conversational -- this is a chat interface, not a form.

## What you must never do
- Never diagnose the patient or suggest what condition they might have. If asked "what do I have?" or similar, say clearly that a health professional will review this information with them -- you cannot and will not diagnose.
- Never give medical advice (treatment, medication, exercises, etc).
- Never reproduce or closely paraphrase copyrighted questionnaire text.

## Safety escalation (red flags)
If the patient volunteers any of the following during the conversation, you must set red_flag to true immediately and stop asking further questions:

${redFlagList}

Do not try to compose your own escalation message -- the system will show the patient a fixed safety message regardless of what you write in patient_reply when red_flag is true, so keep patient_reply brief and calm in that case (e.g. acknowledging what they said) since it will not be shown to them.

## Ending the interview
Once all 7 domains have been resolved to "yes" or "no" with reasonable confidence (or you have made genuine, natural attempts to clarify a domain and the patient's answer remains genuinely ambiguous -- mark it "unknown" rather than looping indefinitely), set interview_complete to true. Do not drag the conversation out once you have enough information. A typical interview should resolve in a modest number of turns.

## Structured output
After EVERY patient turn (including the very first, opening turn where there is no patient message yet), you must call the record_assessment tool. Its "patient_reply" field is the only thing shown to the patient -- put your entire conversational message there. The slot fields reflect your current best judgment of each domain given the WHOLE conversation so far (not just the latest turn), not a diff.`;
}

const RECORD_ASSESSMENT_TOOL = {
  name: 'record_assessment',
  description:
    'Report the next conversational message to show the patient, plus the current state of the clinical assessment. Must be called after every patient turn.',
  input_schema: {
    type: 'object',
    properties: {
      patient_reply: {
        type: 'string',
        description:
          'The next message to show to the patient. Natural, conversational, appropriately brief. Never a checklist, never diagnostic, never quoting a questionnaire verbatim.',
      },
      slots: {
        type: 'object',
        description: 'Current best-judgment state of each of the 7 domains given the whole conversation so far.',
        properties: Object.fromEntries(
          DOMAIN_KEYS.map((key) => [
            key,
            { type: 'string', enum: ['yes', 'no', 'unknown'] },
          ])
        ),
        required: DOMAIN_KEYS,
      },
      red_flag: {
        type: 'boolean',
        description: 'True if the patient has just volunteered a red-flag symptom requiring immediate escalation.',
      },
      red_flag_reason: {
        type: 'string',
        description: 'Brief internal note on which red-flag symptom was mentioned, if red_flag is true. Not shown to the patient.',
      },
      interview_complete: {
        type: 'boolean',
        description: 'True once all 7 domains are resolved (or genuinely exhausted) and the interview should end normally.',
      },
    },
    required: ['patient_reply', 'slots', 'red_flag', 'interview_complete'],
  },
};

function transcriptToMessages(transcript) {
  return transcript.map((turn) => ({
    role: turn.role === 'assistant' ? 'assistant' : 'user',
    content: turn.content,
  }));
}

async function callModel(messages) {
  const response = await anthropic.messages.create({
    model: MODEL,
    // Sonnet 5 has adaptive thinking on by default, which consumes part
    // of this budget before producing the tool call -- keep this
    // generous so thinking activity can't crowd out the actual
    // record_assessment response.
    max_tokens: 4096,
    system: buildSystemPrompt(),
    messages,
    tools: [RECORD_ASSESSMENT_TOOL],
    tool_choice: { type: 'tool', name: 'record_assessment' },
  });

  const toolUse = response.content.find((block) => block.type === 'tool_use');
  if (!toolUse) {
    // Defensive fallback: should not happen given forced tool_choice, but
    // never let the app crash mid-interview -- degrade to a safe holding
    // message rather than exposing an error to the patient. Logged so a
    // real pattern (e.g. repeatedly hitting max_tokens) is visible in the
    // server console rather than silently swallowed.
    console.error(
      'record_assessment tool_use block missing from model response. stop_reason:',
      response.stop_reason,
      'content types:',
      response.content.map((b) => b.type)
    );
    return {
      patient_reply: 'Perdón, ¿puede repetir eso?',
      slots: null,
      red_flag: false,
      red_flag_reason: null,
      interview_complete: false,
    };
  }
  return toolUse.input;
}

/**
 * Runs the opening turn of the interview (no patient message yet).
 */
async function startInterview() {
  const messages = [
    {
      role: 'user',
      content:
        '[System event: the interview session has just started. Greet the patient briefly and warmly, explain in one or two sentences that you will chat with them about their back pain, and invite them to describe it in their own words. Do not ask about specific sensations yet.]',
    },
  ];
  const result = await callModel(messages);
  return normalizeResult(result);
}

/**
 * Runs one conversational turn given the patient's message and the
 * existing transcript.
 */
async function runTurn(transcript, patientMessage) {
  const messages = [
    ...transcriptToMessages(transcript),
    { role: 'user', content: patientMessage },
  ];
  const result = await callModel(messages);
  return normalizeResult(result);
}

function normalizeResult(result) {
  const redFlag = !!result.red_flag;
  const interviewComplete = redFlag ? true : !!result.interview_complete;

  // Hard override: escalation wording is fixed and never model-generated.
  const displayReply = redFlag
    ? RED_FLAG_MESSAGE
    : interviewComplete
    ? `${result.patient_reply}\n\n${CLOSING_MESSAGE}`
    : result.patient_reply;

  return {
    displayReply,
    slots: result.slots,
    redFlag,
    redFlagReason: result.red_flag_reason || null,
    interviewComplete,
  };
}

// ---------------------------------------------------------------------
// On-demand, admin-triggered exploratory classification.
//
// This is NEVER run automatically -- only when the admin explicitly
// clicks "Generar evaluación con IA" on a completed session's detail
// page. It analyzes the already-collected transcript and domain values
// to produce a tentative classification (neuropathic / nociceptive /
// ambiguous) plus a rationale, for internal research comparison only.
// It is never shown to the patient, is hidden behind an "eye" toggle by
// default in the UI, and is deliberately never used to pre-fill the
// clinician's own independent "Clasificación clínica" field -- doing so
// would risk anchoring the very blinded judgment the study is validated
// against.
// ---------------------------------------------------------------------
const REPORT_CLASSIFICATION_TOOL = {
  name: 'report_classification',
  description:
    'Report a tentative, exploratory classification of the patient pain profile based on the interview transcript and domain values, for internal research comparison only.',
  input_schema: {
    type: 'object',
    properties: {
      classification: {
        type: 'string',
        enum: ['neuropathic', 'nociceptive', 'ambiguous'],
      },
      rationale: {
        type: 'string',
        description:
          'Concise rationale in Spanish: a bullet-style breakdown of each of the 7 domains and how it was resolved, followed by 2-4 sentences of overall reasoning for the chosen classification.',
      },
    },
    required: ['classification', 'rationale'],
  },
};

function buildClassificationPrompt(session) {
  const dialogue = session.transcript
    .map((t) => `${t.role === 'assistant' ? 'Chatbot' : 'Paciente'}: ${t.content}`)
    .join('\n\n');
  const domainLines = DOMAIN_KEYS.map(
    (k) => `- ${DOMAIN_ES_LABELS[k] || k}: ${session.slots[k] || 'unknown'}`
  ).join('\n');

  return `Conversación completa:\n\n${dialogue}\n\nEstado actual de los dominios clínicos:\n${domainLines}`;
}

/**
 * Analyzes a completed (or in-progress) session's transcript and domain
 * values and returns a tentative classification + rationale. Admin-
 * triggered only -- see comment above.
 */
async function classifySession(session) {
  const systemPrompt = `You are assisting clinical researchers in a Phase 1 study evaluating whether a chatbot-elicited conversation can produce a pain classification comparable to a clinician-administered DN4-interview. You will be given the full transcript of a structured-but-open conversational interview with a patient about their low back pain, along with the current tracked state of 7 sensory descriptor domains (each yes/no/unknown).

Based on the conversation and these domain values, provide your best tentative classification of whether the patient's pain profile is more consistent with neuropathic characteristics, nociceptive characteristics, or is ambiguous/mixed.

This is for internal research comparison only -- it is NOT a diagnosis, it will never be shown to the patient, and it will be displayed to the research team clearly labeled as an unvalidated, exploratory research output, kept separate from the independent blinded clinician's own classification.

Call the report_classification tool. Respond in Spanish.`;

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: systemPrompt,
    messages: [{ role: 'user', content: buildClassificationPrompt(session) }],
    tools: [REPORT_CLASSIFICATION_TOOL],
    tool_choice: { type: 'tool', name: 'report_classification' },
  });

  const toolUse = response.content.find((block) => block.type === 'tool_use');
  if (!toolUse) {
    throw new Error('El modelo no devolvió una clasificación (report_classification ausente).');
  }
  return toolUse.input;
}

module.exports = {
  startInterview,
  runTurn,
  classifySession,
  RED_FLAG_MESSAGE,
  CLOSING_MESSAGE,
};
