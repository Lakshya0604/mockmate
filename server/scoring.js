export function clampScore(n) {
  const x = Math.round(Number(n));
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(10, x));
}

// Overall score (0-100) is the plain average of per-answer scores (0-10).
export function overallScore(answers) {
  const scores = answers.filter((a) => a && typeof a.score === 'number').map((a) => a.score);
  if (scores.length === 0) return 0;
  return Math.round((scores.reduce((s, x) => s + x, 0) / scores.length) * 10);
}

export function verdict(score) {
  if (score >= 80) return 'Interview ready';
  if (score >= 60) return 'Getting there';
  if (score >= 40) return 'Needs practice';
  return 'Start with the basics';
}

export function wordCount(text) {
  return String(text || '').split(/\s+/).filter(Boolean).length;
}
