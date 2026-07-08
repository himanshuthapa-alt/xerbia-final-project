/**
 * Thin wrapper around the Google Gemini REST API.
 * All AI calls in the app funnel through here so we have ONE place for:
 *   - auth (key comes from env, never from the client)
 *   - timeouts + error normalization
 *   - JSON-mode responses
 * Swapping providers later = rewrite this file only.
 */
const env = require('../../config/env');

const BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const TIMEOUT_MS = 30_000;

class AIUnavailableError extends Error {
  constructor(msg) {
    super(msg);
    this.statusCode = 502;
    this.isOperational = true;
  }
}

async function generate(prompt, { system, json = false } = {}) {
  if (!env.gemini.apiKey) {
    throw new AIUnavailableError('AI is not configured (GEMINI_API_KEY missing)');
  }

  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
    generationConfig: {
      temperature: 0.4,
      maxOutputTokens: 1024,
      ...(json ? { responseMimeType: 'application/json' } : {}),
    },
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let resp;
  try {
    resp = await fetch(`${BASE}/${env.gemini.model}:generateContent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': env.gemini.apiKey,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    throw new AIUnavailableError(
      err.name === 'AbortError' ? 'AI request timed out' : `AI service unreachable: ${err.message}`
    );
  } finally {
    clearTimeout(timer);
  }

  if (!resp.ok) {
    const detail = await resp.text().catch(() => '');
    console.warn(`[ai] gemini ${resp.status}:`, detail.slice(0, 300));
    if (resp.status === 429) throw new AIUnavailableError('AI rate limit hit — try again in a minute');
    throw new AIUnavailableError(`AI service error (HTTP ${resp.status})`);
  }

  const data = await resp.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '';
  if (!text) throw new AIUnavailableError('AI returned an empty response');
  return text.trim();
}

/**
 * Resume analysis used by the recruitment module.
 * Returns { score, matchedSkills, missingSkills, summary }.
 */
async function analyzeResume(resumeText, position, requiredSkills) {
  const raw = await generate(
    [
      `Analyze this resume for the position of "${position}".`,
      `Required skills: ${requiredSkills.join(', ')}.`,
      '',
      'Resume:',
      '"""',
      resumeText.slice(0, 12000), // keep prompt bounded
      '"""',
      '',
      'Respond with JSON only, using exactly this shape:',
      '{ "score": <0-100 integer fit score>, "matchedSkills": [..], "missingSkills": [..], "summary": "<2-3 sentence summary>" }',
    ].join('\n'),
    { json: true }
  );

  try {
    const parsed = JSON.parse(raw);
    return {
      score: Math.max(0, Math.min(100, Number(parsed.score) || 0)),
      matchedSkills: Array.isArray(parsed.matchedSkills) ? parsed.matchedSkills.slice(0, 20) : [],
      missingSkills: Array.isArray(parsed.missingSkills) ? parsed.missingSkills.slice(0, 20) : [],
      summary: String(parsed.summary || '').slice(0, 1000),
    };
  } catch {
    // Model ignored JSON mode — degrade to a summary-only result rather than failing.
    return { score: 0, matchedSkills: [], missingSkills: [], summary: raw.slice(0, 1000) };
  }
}

module.exports = { generate, analyzeResume, AIUnavailableError };
