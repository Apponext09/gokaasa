import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { isSpeechRecognitionSupported, isSpeechSynthesisSupported, SpeechRecognizer, speak, stopSpeaking, pickVoice } from '../../src/features/support/speech.js';

/** A fake SpeechRecognition constructor: records lifecycle calls and lets tests fire events manually. */
class FakeRecognition {
  constructor() {
    this.lang = null;
    this.interimResults = null;
    this.continuous = null;
    this.started = false;
    FakeRecognition.lastInstance = this;
  }
  start() {
    this.started = true;
    this.onstart?.();
  }
  stop() {
    this.started = false;
    this.onend?.();
  }
  emitResult(transcripts) {
    const results = transcripts.map(([text, isFinal]) => ({ 0: { transcript: text }, isFinal, length: 1 }));
    this.onresult?.({ resultIndex: 0, results });
  }
  emitError(code) {
    this.onerror?.({ error: code });
  }
}

const realWindow = globalThis.window;

beforeEach(() => {
  globalThis.window = {};
});

afterEach(() => {
  globalThis.window = realWindow;
  delete globalThis.SpeechSynthesisUtterance;
});

test('isSpeechRecognitionSupported is false with no browser API at all (no window)', () => {
  globalThis.window = undefined;
  assert.equal(isSpeechRecognitionSupported(), false);
  globalThis.window = {};
});

test('isSpeechRecognitionSupported is false when neither SpeechRecognition nor webkitSpeechRecognition exists', () => {
  assert.equal(isSpeechRecognitionSupported(), false);
});

test('isSpeechRecognitionSupported is true for either the standard or webkit-prefixed constructor', () => {
  globalThis.window.SpeechRecognition = FakeRecognition;
  assert.equal(isSpeechRecognitionSupported(), true);
  delete globalThis.window.SpeechRecognition;
  globalThis.window.webkitSpeechRecognition = FakeRecognition;
  assert.equal(isSpeechRecognitionSupported(), true);
});

test('isSpeechSynthesisSupported reflects window.speechSynthesis presence', () => {
  assert.equal(isSpeechSynthesisSupported(), false);
  globalThis.window.speechSynthesis = {};
  assert.equal(isSpeechSynthesisSupported(), true);
});

test('SpeechRecognizer reports "unsupported" instead of throwing when the browser has no recognition API', () => {
  let reportedError = null;
  const recognizer = new SpeechRecognizer('en-IN', { onError: (code) => { reportedError = code; } });
  recognizer.start();
  assert.equal(reportedError, 'unsupported');
});

test('SpeechRecognizer starts with the exact selected language and reaches the listening state', () => {
  globalThis.window.SpeechRecognition = FakeRecognition;
  let started = false;
  const recognizer = new SpeechRecognizer('hi-IN', { onStart: () => { started = true; } });
  recognizer.start();
  assert.equal(started, true);
  assert.equal(FakeRecognition.lastInstance.lang, 'hi-IN');
  assert.equal(FakeRecognition.lastInstance.continuous, false, 'never continuous background recording');
});

test('SpeechRecognizer surfaces interim and final transcripts separately, exactly as recognized', () => {
  globalThis.window.SpeechRecognition = FakeRecognition;
  let interim = null;
  let final = null;
  const recognizer = new SpeechRecognizer('en-IN', { onInterim: (t) => { interim = t; }, onFinal: (t) => { final = t; } });
  recognizer.start();
  FakeRecognition.lastInstance.emitResult([['a resort in', false]]);
  assert.equal(interim, 'a resort in');
  FakeRecognition.lastInstance.emitResult([['a resort in lonavala', true]]);
  assert.equal(final, 'a resort in lonavala');
});

test('SpeechRecognizer maps real browser error codes through unchanged (permission denied, no speech, network, no mic)', () => {
  globalThis.window.SpeechRecognition = FakeRecognition;
  const seen = [];
  const recognizer = new SpeechRecognizer('en-IN', { onError: (c) => seen.push(c) });
  recognizer.start();
  FakeRecognition.lastInstance.emitError('not-allowed');
  FakeRecognition.lastInstance.emitError('no-speech');
  FakeRecognition.lastInstance.emitError('network');
  FakeRecognition.lastInstance.emitError('audio-capture');
  assert.deepEqual(seen, ['not-allowed', 'no-speech', 'network', 'audio-capture']);
});

test('SpeechRecognizer.stop() ends the session and fires onEnd', () => {
  globalThis.window.SpeechRecognition = FakeRecognition;
  let ended = false;
  const recognizer = new SpeechRecognizer('en-IN', { onEnd: () => { ended = true; } });
  recognizer.start();
  recognizer.stop();
  assert.equal(ended, true);
  assert.equal(recognizer.active, false);
});

test('calling start() twice while already listening does not start a second recognition session (no duplicate events)', () => {
  globalThis.window.SpeechRecognition = FakeRecognition;
  let startCount = 0;
  const recognizer = new SpeechRecognizer('en-IN', { onStart: () => { startCount += 1; } });
  recognizer.start();
  recognizer.start();
  assert.equal(startCount, 1);
});

test('speak() and stopSpeaking() are safe no-ops when speechSynthesis is unsupported (never throw)', () => {
  assert.doesNotThrow(() => speak('hello', 'en-IN'));
  assert.doesNotThrow(() => stopSpeaking());
});

test('speak() cancels anything already speaking before starting a new utterance', () => {
  let cancelCalls = 0;
  let speakCalls = 0;
  globalThis.window.speechSynthesis = { cancel: () => { cancelCalls += 1; }, speak: () => { speakCalls += 1; }, getVoices: () => [] };
  globalThis.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
  speak('first message', 'en-IN');
  speak('second message', 'en-IN');
  assert.equal(cancelCalls, 2, 'cancel runs before every speak call, including the first');
  assert.equal(speakCalls, 2);
});

test('pickVoice prefers an exact language match, falling back to the same primary subtag', () => {
  const voices = [{ lang: 'en-GB' }, { lang: 'hi-IN' }];
  globalThis.window.speechSynthesis = { getVoices: () => voices };
  assert.equal(pickVoice('hi-IN'), voices[1]);
  assert.equal(pickVoice('en-IN'), voices[0], 'falls back to any en-* voice when en-IN is not installed');
});

test('pickVoice returns null (not a crash) when no voices are installed at all', () => {
  globalThis.window.speechSynthesis = { getVoices: () => [] };
  assert.equal(pickVoice('hi-IN'), null);
});
