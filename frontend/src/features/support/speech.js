/**
 * Thin wrappers around the browser's native SpeechRecognition and SpeechSynthesis APIs. No audio is ever
 * recorded to a file or sent anywhere -- recognition results are plain recognized text, handled exactly
 * like typed text, and speech synthesis reads fixed strings aloud locally in the browser. Neither API is
 * called by this module unless the browser actually exposes it; every detection function below is safe
 * to call in a non-browser (test) environment too.
 *
 * LIMITATION (always true, not something this code controls): browser speech recognition quality,
 * language coverage, and even availability depend on the browser vendor's own speech service and the
 * device's internet connectivity. Chrome/Edge on desktop and Android have the best Web Speech API
 * support; Firefox and many iOS browsers do not implement SpeechRecognition at all. This module detects
 * support and degrades to text-only input rather than assuming it works everywhere.
 */

function getRecognitionCtor() {
  if (typeof window === 'undefined') return null;
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
}

function getSynthesis() {
  if (typeof window === 'undefined') return null;
  return window.speechSynthesis ?? null;
}

export function isSpeechRecognitionSupported() {
  return getRecognitionCtor() != null;
}

export function isSpeechSynthesisSupported() {
  return getSynthesis() != null;
}

/**
 * Wraps one recognition session. Never records or stores audio -- only ever surfaces recognized text via
 * callbacks, the same as a keystroke. `lang` is a BCP-47 tag ("hi-IN" or "en-IN"); recognition is never
 * started in a language the caller did not explicitly select.
 *
 * handlers: { onInterim(text), onFinal(text), onStart(), onEnd(), onError(code) }
 *   error codes surfaced: 'not-allowed' (permission denied), 'no-speech', 'network', 'audio-capture'
 *   (no microphone), 'aborted', or 'unsupported' (browser has no SpeechRecognition at all).
 */
export class SpeechRecognizer {
  constructor(lang, handlers = {}) {
    this.lang = lang;
    this.handlers = handlers;
    this.recognition = null;
    this.active = false;
  }

  start() {
    if (this.active) return; // Ignore a duplicate start while already listening.
    const Ctor = getRecognitionCtor();
    if (!Ctor) {
      this.handlers.onError?.('unsupported');
      return;
    }
    const recognition = new Ctor();
    recognition.lang = this.lang;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    // One utterance per press-and-confirm cycle -- never continuous background recording.
    recognition.continuous = false;

    recognition.onstart = () => {
      this.active = true;
      this.handlers.onStart?.();
    };
    recognition.onresult = (event) => {
      let interim = '';
      let final = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (result.isFinal) final += result[0].transcript;
        else interim += result[0].transcript;
      }
      if (interim) this.handlers.onInterim?.(interim);
      if (final) this.handlers.onFinal?.(final.trim());
    };
    recognition.onerror = (event) => {
      this.handlers.onError?.(event.error ?? 'network');
    };
    recognition.onend = () => {
      this.active = false;
      this.handlers.onEnd?.();
    };

    this.recognition = recognition;
    try {
      recognition.start();
    } catch {
      // start() throws if called while already running elsewhere -- treat as a no-op, not a crash.
      this.handlers.onError?.('aborted');
    }
  }

  stop() {
    this.active = false;
    this.recognition?.stop();
  }
}

let currentUtterance = null;

/** Stops any speech currently playing. Safe to call even when nothing is speaking or unsupported. */
export function stopSpeaking() {
  const synth = getSynthesis();
  if (synth) synth.cancel();
  currentUtterance = null;
}

/**
 * Picks the best available voice for `speechLang` (e.g. "hi-IN"), falling back to any voice whose
 * language starts with the same primary subtag (e.g. any "en-*" voice for "en-IN") since not every device
 * ships an exact regional voice. Returns null if nothing matches -- the browser's default voice is still
 * used in that case, so speech is attempted rather than silently skipped.
 */
export function pickVoice(speechLang) {
  const synth = getSynthesis();
  if (!synth) return null;
  const voices = synth.getVoices?.() ?? [];
  if (!voices.length) return null;
  const exact = voices.find((v) => v.lang === speechLang);
  if (exact) return exact;
  const primary = speechLang.split('-')[0];
  return voices.find((v) => v.lang?.toLowerCase().startsWith(primary)) ?? null;
}

/**
 * Speaks `text` in `speechLang`, cancelling anything already speaking first (so responses never overlap).
 * No-ops safely (does not throw) when synthesis is unsupported.
 */
export function speak(text, speechLang) {
  const synth = getSynthesis();
  if (!synth || !text) return;
  stopSpeaking();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = speechLang;
  const voice = pickVoice(speechLang);
  if (voice) utterance.voice = voice;
  currentUtterance = utterance;
  synth.speak(utterance);
}
