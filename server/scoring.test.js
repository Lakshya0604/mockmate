import test from 'node:test';
import assert from 'node:assert/strict';
import { clampScore, overallScore, verdict, wordCount } from './scoring.js';

test('clampScore keeps scores in 0..10', () => {
  assert.equal(clampScore(12), 10);
  assert.equal(clampScore(-3), 0);
  assert.equal(clampScore('7.6'), 8);
  assert.equal(clampScore('abc'), 0);
});

test('overallScore averages answers on a 100 scale', () => {
  assert.equal(overallScore([{ score: 8 }, { score: 6 }]), 70);
  assert.equal(overallScore([]), 0);
  assert.equal(overallScore([{ score: 10 }, {}, { score: 5 }]), 75);
});

test('verdict bands', () => {
  assert.equal(verdict(85), 'Interview ready');
  assert.equal(verdict(65), 'Getting there');
  assert.equal(verdict(45), 'Needs practice');
  assert.equal(verdict(10), 'Start with the basics');
});

test('wordCount', () => {
  assert.equal(wordCount('  one two   three '), 3);
});
