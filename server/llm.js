// Groq (preferred) or Gemini free tier. Returns parsed JSON.
function clip(s, n) { return String(s).length > n ? String(s).slice(0, n) : String(s); }

function parseJson(text) {
  try { return JSON.parse(text); } catch {
    const m = String(text).match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
    throw new Error('Model did not return JSON');
  }
}

async function groq(system, user) {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.GROQ_API_KEY}` },
    body: JSON.stringify({
      model: process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
      temperature: 0.4,
      response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }]
    })
  });
  if (!res.ok) throw new Error(`Groq error ${res.status}: ${clip(await res.text(), 200)}`);
  const data = await res.json();
  return parseJson(data.choices[0].message.content);
}

async function gemini(system, user) {
  const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: { temperature: 0.4, responseMimeType: 'application/json' }
    })
  });
  if (!res.ok) throw new Error(`Gemini error ${res.status}: ${clip(await res.text(), 200)}`);
  const data = await res.json();
  return parseJson(data.candidates[0].content.parts[0].text);
}

export const llmConfigured = () => Boolean(process.env.GROQ_API_KEY || process.env.GEMINI_API_KEY);
const callJson = (system, user) => (process.env.GROQ_API_KEY ? groq(system, user) : gemini(system, user));
const strs = (v, n) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.trim()).slice(0, n) : []);

export async function generateQuestions({ role, level, focus, count }) {
  const system = `You are a senior interviewer. Write realistic interview questions for the given role, level and focus.
Rules: questions must be answerable in 1-3 minutes out loud, specific to the role, progressive in difficulty, no duplicates, no multi-part essays.
Return ONLY JSON: {"questions":[{"question":"...","topic":"2-3 word topic"}]} with exactly ${count} items.`;
  const user = `Role: ${clip(role, 100)}\nLevel: ${level}\nFocus: ${focus}`;
  const raw = await callJson(system, user);
  const qs = (Array.isArray(raw.questions) ? raw.questions : [])
    .filter((q) => q && typeof q.question === 'string' && q.question.trim())
    .slice(0, count)
    .map((q) => ({ question: q.question.trim(), topic: String(q.topic || '').slice(0, 40) }));
  if (qs.length < count) throw new Error('Not enough questions generated');
  return qs;
}

export async function evaluateAnswer({ role, level, question, answer }) {
  const system = `You are a fair but honest interviewer scoring one answer. Score 0-10: 0-2 off-topic or empty, 3-4 weak, 5-6 acceptable but shallow, 7-8 good with specifics, 9-10 excellent with depth and a concrete example.
Judge only what the candidate wrote. Do not reward length. Do not invent things they did not say.
Return ONLY JSON: {"score":<int 0-10>,"feedback":"2-3 sentences","strengths":["max 3 short items"],"improvements":["max 3 specific items"],"better_answer":"a strong sample answer, 4-6 sentences, first person, that does not assume specific facts about the candidate's past"}`;
  const user = `Role: ${clip(role, 100)} (${level})\nQuestion: ${question}\nCandidate answer: ${clip(answer, 3000)}`;
  const raw = await callJson(system, user);
  return {
    score: raw.score,
    feedback: String(raw.feedback || ''),
    strengths: strs(raw.strengths, 3),
    improvements: strs(raw.improvements, 3),
    better_answer: String(raw.better_answer || '')
  };
}

export async function summarizeInterview({ role, level, items }) {
  const system = `You are an interview coach writing the final report for a mock interview. Use only the questions, answers and scores provided.
Return ONLY JSON: {"summary":"3 sentences","strengths":["max 4"],"weaknesses":["max 4"],"next_steps":["4 concrete practice actions"]}`;
  const body = items.map((i, n) => `Q${n + 1} (${i.score}/10): ${i.question}\nAnswer: ${clip(i.answer, 700)}`).join('\n\n');
  const raw = await callJson(system, `Role: ${clip(role, 100)} (${level})\n\n${body}`);
  return { summary: String(raw.summary || ''), strengths: strs(raw.strengths, 4), weaknesses: strs(raw.weaknesses, 4), next_steps: strs(raw.next_steps, 4) };
}
