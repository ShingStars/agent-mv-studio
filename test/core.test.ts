import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Clock, resolveTime } from '../src/core/time.js';
import { estimateWords, parseLRC, tokenize } from '../src/core/lyrics.js';
import { mixHex, luminance, PLATE_STATES, TUI_STATES } from '../src/core/palette.js';
import { hashString, Rng, frameRng } from '../src/core/prng.js';

test('clock: beats and bars on a fixed grid', () => {
  const clock = new Clock({ bpm: 120, firstBeat: 0 });
  assert.equal(clock.spb, 0.5);
  assert.equal(clock.beat(1), 0.5);
  assert.equal(clock.beat(4), 2);
  assert.equal(clock.bar(2), 4);
  assert.equal(clock.barOf(2.6).bar, 1);
  assert.ok(Math.abs(clock.barOf(2.6).beat - 1.2) < 1e-9);
  assert.equal(clock.snap(1.26, 4), 1.25);
  assert.equal(clock.onGrid(1.26, 4, 0.02), true);
  assert.equal(clock.onGrid(1.3, 4, 0.02), false);
});

test('clock: measured beat times override the constant tempo', () => {
  const clock = new Clock({ bpm: 120, firstBeat: 0.25, beatTimes: [0.25, 0.75, 1.3, 1.9] });
  assert.equal(clock.beat(0), 0.25);
  assert.equal(clock.beat(1), 0.75);
  assert.equal(clock.beat(2), 1.3);
  assert.equal(clock.beatOf(0.75), 1);
});

test('time refs resolve bars, beats, lines and words', () => {
  const clock = new Clock({ bpm: 120, firstBeat: 0 });
  const lineStart = () => 3;
  const wordStart = () => 4.5;
  assert.equal(resolveTime({ beat: 2 }, { clock, lineStart, wordStart }).seconds, 1);
  assert.equal(resolveTime({ bar: 2, beat: 1 }, { clock, lineStart, wordStart }).seconds, 4.5);
  assert.equal(resolveTime({ line: 7 }, { clock, lineStart, wordStart }).seconds, 3);
  assert.equal(resolveTime({ word: [7, 2], offset: 0.5 }, { clock, lineStart, wordStart }).seconds, 5);
  assert.equal(resolveTime({ time: 12.5 }, { clock, lineStart, wordStart }).seconds, 12.5);
});

test('lyrics: lrc parsing, estimated words, progress', () => {
  const lyrics = parseLRC('[00:01.00]hello world\n[00:03.00]second line');
  assert.equal(lyrics.lines.length, 2);
  assert.equal(lyrics.lines[0]!.start, 1);
  assert.equal(lyrics.lines[1]!.start, 3);
  const ids = lyrics.lines.map((l) => l.id);
  assert.equal(ids[0], 1);
  assert.equal(lyrics.lineAt(2.2)?.id, 1);
  assert.equal(lyrics.revealedText(1, 1.4).length > 0, true);
  assert.equal(lyrics.revealedText(1, 1.4).length < 'hello world'.length, true);
  assert.equal(lyrics.duration(1) > 1.5, true);
});

test('lyrics: tokenizer keeps CJK characters apart and latin words whole', () => {
  const tokens = tokenize('你好，world this is 歌词');
  assert.deepEqual(tokens, ['你', '好', '，', 'world ', 'this ', 'is ', '歌', '词']);
  const words = estimateWords(tokens, 0, 2, 6);
  assert.equal(words.length, tokens.length);
  assert.equal(words[0]!.start, 0);
  assert.equal(words[words.length - 1]!.end, 2);
  for (let i = 1; i < words.length; i++) assert.ok(words[i]!.start >= words[i - 1]!.end - 1e-6);
});

test('palette: gamma-correct mixing and state lookup', () => {
  assert.equal(mixHex('#000000', '#ffffff', 0.5), '#bababa');
  assert.equal(mixHex('#ff0000', '#ff0000', 0.3), '#ff0000');
  assert.ok(luminance('#ffffff') > luminance('#000000'));
  assert.ok(PLATE_STATES.on);
  assert.ok(TUI_STATES.paper);
  assert.equal(PLATE_STATES.on.me, '#d97757');
});

test('prng: deterministic for the same seed, different across frames', () => {
  const a = new Rng('shot-a').float(0, 1);
  const b = new Rng('shot-a').float(0, 1);
  const c = new Rng('shot-b').float(0, 1);
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.equal(frameRng(7, 'x', 1).int(0, 10), frameRng(7, 'x', 1).int(0, 10));
  assert.equal(hashString('abc'), hashString('abc'));
  assert.notEqual(hashString('abc'), hashString('abd'));
});
