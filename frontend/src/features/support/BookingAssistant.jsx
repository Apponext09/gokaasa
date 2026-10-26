import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, Scale, SearchX } from 'lucide-react';
import { Button } from '@/components/ui/button.jsx';
import { Card } from '@/components/ui/surfaces.jsx';
import { Checkbox } from '@/components/ui/form-controls.jsx';
import { EmptyState, formatMoney } from '@/components/shared/index.jsx';
import { DestinationField } from '@/features/search/components/DestinationField.jsx';
import { DateRangePicker } from '@/features/search/components/DateRangePicker.jsx';
import { GuestsPopover } from '@/features/search/components/GuestsPopover.jsx';
import { HotelCard, HotelCardSkeleton } from '@/features/search/components/HotelCard.jsx';
import { RoomCard, UnavailableRooms } from '@/features/rooms/components/RoomOffers.jsx';
import { formatOccupancy, summarizeOccupancy, toSearchParams, todayIso, validateStay, stayParams, slugifyPlace } from '@/features/search/searchParams.js';
import { discoveryApi, assistantApi, bookingApi } from '@/services/endpoints.js';
import { normalizeError } from '@/services/api.js';
import {
  AMENITY_PREFERENCE_OPTIONS,
  BUDGET_PRESETS,
  MAX_COMPARE,
  STAR_RATING_OPTIONS,
  STEP,
  clearDraft,
  firstIncompleteStep,
  initialAssistantState,
  isStepComplete,
  loadDraft,
  mergeExtractedCriteria,
  nextStep,
  previousStep,
  saveDraft,
  toSearchState,
  toggleCompare,
  totalBudgetToPerNightMax,
} from '@/features/support/assistantState.js';
import { LANGUAGES, t, AMENITY_LABELS, STAR_RATING_LABELS, BUDGET_PRESET_LABELS } from '@/features/support/bilingualContent.js';
import { parseUtterance, parseVoiceCommand } from '@/features/support/bilingualParser.js';
import { SpeechRecognizer, isSpeechRecognitionSupported, isSpeechSynthesisSupported, speak, stopSpeaking } from '@/features/support/speech.js';
import { AssistantHeader } from '@/features/support/components/AssistantHeader.jsx';
import { AssistantWelcome } from '@/features/support/components/AssistantWelcome.jsx';
import { AssistantBubble, UserBubble, TypingIndicator } from '@/features/support/components/ConversationMessage.jsx';
import { MessageComposer } from '@/features/support/components/MessageComposer.jsx';

function QuickReply({ selected, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`assistant-quick-reply rounded-full border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-1 focus-visible:outline-brand-500 ${
        selected
          ? 'border-brand-600 bg-brand-600 text-white'
          : 'border-[var(--border-subtle)] bg-[var(--surface-card)] text-[var(--text-body)] hover:border-brand-400 hover:text-brand-700'
      }`}
    >
      {children}
    </button>
  );
}

function StepFooter({ onBack, onNext, backLabel, nextLabel, nextDisabled = false, showBack = true }) {
  return (
    <div className="flex items-center justify-between gap-3 pt-1">
      {showBack ? (
        <Button type="button" variant="ghost" size="sm" onClick={onBack} className="h-7 px-2 text-xs">
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> {backLabel}
        </Button>
      ) : (
        <span />
      )}
      <Button type="button" size="sm" onClick={onNext} disabled={nextDisabled} className="h-7 px-2.5 text-xs">
        {nextLabel}
      </Button>
    </div>
  );
}

/** Distributes a parsed adult count across a parsed room count (default 1 room) -- the same occupancy
 * shape ([{adults, childAges}]) the guided GUESTS step and the backend AI path already produce. */
function buildOccupancyFromCounts(adults, rooms) {
  const totalAdults = Math.max(1, Math.floor(adults));
  const roomCount = Math.max(1, Math.min(Math.floor(rooms ?? 1) || 1, totalAdults));
  const base = Math.floor(totalAdults / roomCount);
  const remainder = totalAdults % roomCount;
  return Array.from({ length: roomCount }, (_, i) => ({ adults: base + (i < remainder ? 1 : 0), childAges: [] }));
}

/** Bilingual mirror of the backend's assistant.service.js#buildClarification, for the zero-network local
 * parser path (used whenever no AI provider is configured -- the default in this environment). */
function buildLocalClarification(missingInformation, destinationCandidates, destinationQuery, lang) {
  if (destinationCandidates.length > 1) {
    const names = destinationCandidates.map((c) => c.label).join(', ');
    return lang === 'hi'
      ? `"${destinationQuery}" se milti kuch jagah mili: ${names}. Aap kaunsi jagah kehna chahte hain?`
      : `I found a few places matching "${destinationQuery}": ${names}. Which one did you mean?`;
  }
  if (missingInformation.includes('destination')) {
    if (destinationQuery) {
      return lang === 'hi'
        ? `Mujhe "${destinationQuery}" nahi mila. Koi doosra city ya area try karein.`
        : `I couldn't find "${destinationQuery}" among our destinations. Could you try a different city or area?`;
    }
    return t('askDestination', lang);
  }
  if (missingInformation.includes('dates')) return t('askDates', lang);
  if (missingInformation.includes('budgetType')) return t('askBudgetType', lang);
  return null;
}

function summarizePreferences(state, lang) {
  const parts = [];
  if (state.stars) {
    const id = STAR_RATING_OPTIONS.find((o) => JSON.stringify(o.stars) === JSON.stringify(state.stars))?.id;
    if (id) parts.push(STAR_RATING_LABELS[lang][id]);
  }
  if (state.amenities.length) parts.push(state.amenities.map((code) => AMENITY_LABELS[lang][code]).join(', '));
  if (state.dinnerIncluded) parts.push(t('dinnerIncludedLabel', lang));
  if (state.freeCancellation) parts.push(t('freeCancellationLabel', lang));
  return parts.length ? parts.join(' · ') : t('noSpecificPreferences', lang);
}

function summarizeBudget(state, lang) {
  if (state.minPrice == null && state.maxPrice == null) return t('noBudgetLimit', lang);
  const min = state.minPrice != null ? `₹${state.minPrice.toLocaleString('en-IN')}` : 'Any';
  const max = state.maxPrice != null ? `₹${state.maxPrice.toLocaleString('en-IN')}` : 'Any';
  return t('currentBudgetLabel', lang, min, max);
}

const SPEECH_ERROR_KEYS = {
  'not-allowed': 'micDenied',
  'audio-capture': 'micUnavailable',
  'no-speech': 'noSpeechDetected',
  network: 'speechNetworkError',
  unsupported: 'speechUnsupported',
};

/**
 * The guided booking assistant, presented as a real concierge conversation. The transcript (`history`) is
 * a display-only layer -- every answer is still collected by the SAME step state machine and handlers as
 * before (goNext/patch/selectProperty/selectRoom/confirmAndReserve are unchanged), so nothing about
 * search, availability, holds or payment is duplicated or reimplemented here. Selecting a property hands
 * off to the existing, unmodified hotel-details -> room selection -> guest checkout -> hold -> Razorpay
 * flow via a normal navigation -- this file never creates a hold, collects payment details, or computes a
 * price.
 *
 * Voice and bilingual support are entirely client-side: the mic button uses the browser's native
 * SpeechRecognition API only to fill the SAME text box a typed message would (never auto-submitted), and
 * free text is parsed by the deterministic, no-network bilingualParser.js whenever no AI provider is
 * configured (the default here) -- never sent to any external AI/LLM service. `open` tells this component
 * when the parent chat panel is actually visible, since the panel is always mounted and only toggles CSS
 * visibility; without it, listening/speaking could keep running after the user "closes" the chat.
 */
export function BookingAssistant({ onClose, open = true }) {
  const navigate = useNavigate();
  const today = todayIso();
  const [state, setState] = useState(() => ({ ...initialAssistantState(), ...loadDraft() }));
  const lang = state.language;
  const speechLang = LANGUAGES.find((l) => l.code === lang)?.speechLang ?? 'en-IN';
  const [searchStatus, setSearchStatus] = useState('idle');
  const [searchResult, setSearchResult] = useState(null);
  const [searchError, setSearchError] = useState(null);
  const [customBudget, setCustomBudget] = useState({ mode: 'night', value: '' });
  const [showCompare, setShowCompare] = useState(false);
  const [aiStatus, setAiStatus] = useState({ checked: false, configured: false });
  const [availability, setAvailability] = useState({ status: 'idle', data: null, error: null });
  const [holdStatus, setHoldStatus] = useState({ status: 'idle', error: null });

  const [history, setHistory] = useState([]);
  const [aiMessage, setAiMessage] = useState('');
  const [aiState, setAiState] = useState({ status: 'idle', error: null, note: null, candidates: [] });
  const [listening, setListening] = useState(false);
  const [speechEnabled, setSpeechEnabled] = useState(false);
  const [lastSpokenText, setLastSpokenText] = useState(null);
  const recognizerRef = useRef(null);
  const inputRef = useRef(null);
  const speechSupported = isSpeechRecognitionSupported();
  const synthesisSupported = isSpeechSynthesisSupported();

  const scrollRef = useRef(null);
  const stickToBottomRef = useRef(true);
  const historyIdRef = useRef(0);

  const addMessage = (role, text) => {
    if (!text) return;
    historyIdRef.current += 1;
    setHistory((h) => [...h, { id: historyIdRef.current, role, text }]);
  };
  const addAssistantMessage = (text) => addMessage('assistant', text);
  const addUserMessage = (text) => addMessage('user', text);

  useEffect(() => {
    assistantApi.status().then((s) => setAiStatus({ checked: true, configured: s.configured })).catch(() => setAiStatus({ checked: true, configured: false }));
  }, []);

  useEffect(() => {
    saveDraft(state);
  }, [state]);

  const stopListening = () => {
    recognizerRef.current?.stop();
    setListening(false);
  };

  // The chat panel is always mounted (SupportLauncher toggles CSS visibility, not mount/unmount), so
  // listening/speaking must be stopped explicitly on close -- an unmount cleanup alone would never fire.
  useEffect(() => {
    if (!open) {
      stopListening();
      stopSpeaking();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(
    () => () => {
      stopListening();
      stopSpeaking();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const patch = (changes) => setState((s) => ({ ...s, ...changes }));
  const goNext = () => patch({ step: nextStep(state.step) });
  const goBack = () => patch({ step: previousStep(state.step) });

  const changeLanguage = (code) => {
    if (code === state.language) return;
    stopListening();
    patch({ language: code });
  };

  const nights = useMemo(() => {
    if (!state.checkIn || !state.checkOut) return 0;
    return Math.round((new Date(`${state.checkOut}T00:00:00Z`) - new Date(`${state.checkIn}T00:00:00Z`)) / 86_400_000);
  }, [state.checkIn, state.checkOut]);

  const stayProblem = validateStay(state, today);

  const runSearch = async () => {
    setSearchStatus('loading');
    setSearchError(null);
    try {
      const searchState = toSearchState(state);
      const params = toSearchParams(searchState);
      const destinationSlug = state.destination?.destination;
      if (destinationSlug) params.set('destination', destinationSlug);
      if (state.destination?.area) params.set('area', state.destination.area);
      const data = await discoveryApi.search(Object.fromEntries(params));
      setSearchResult(data);
      setSearchStatus('ready');
    } catch (err) {
      setSearchError(normalizeError(err).message);
      setSearchStatus('error');
    }
  };

  // A specific hotel picked straight from destination search goes directly to its own page with the
  // collected stay, skipping the generic results list entirely -- no need to "search" for one known hotel.
  const goToChosenHotel = () => {
    const d = state.destination;
    const citySlug = slugifyPlace(d.destination ?? '');
    const params = stayParams({ checkIn: state.checkIn, checkOut: state.checkOut, occupancy: state.occupancy });
    onClose();
    navigate(`/hotels/${citySlug}/${d.hotelSlug}?${params.toString()}`);
  };

  useEffect(() => {
    if (state.step === STEP.RESULTS && searchStatus === 'idle') {
      if (state.destination?.type === 'HOTEL' && state.destination.hotelSlug) {
        goToChosenHotel();
        return;
      }
      runSearch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.step]);

  // Mode C: a specific real property was picked from results. Load its real, date/occupancy-aware
  // availability (the exact same API HotelDetailsPage itself uses) -- never a guess at room/price.
  const loadAvailability = async (hotel) => {
    setAvailability({ status: 'loading', data: null, error: null });
    try {
      const data = await discoveryApi.availability(hotel.slug, {
        checkIn: state.checkIn,
        checkOut: state.checkOut,
        occ: formatOccupancy(state.occupancy),
      });
      setAvailability({ status: 'ready', data, error: null });
    } catch (err) {
      setAvailability({ status: 'error', data: null, error: normalizeError(err).message });
    }
  };

  const selectProperty = (hotel) => {
    addUserMessage(hotel.name);
    patch({ selectedHotel: hotel, selectedRoom: null, step: STEP.ROOM_SELECT });
    loadAvailability(hotel);
  };

  const selectRoom = (room, plan) => {
    addUserMessage(`${room.name} · ${plan.name}`);
    patch({ selectedRoom: { room, plan }, step: STEP.BOOKING_REVIEW });
  };

  // Creates a REAL hold through the existing, unmodified booking-hold service -- the same endpoint
  // SelectionBar itself calls. Revalidates availability/price server-side; nothing here is authoritative.
  // This is only ever wired to an explicit button tap below: parseVoiceCommand has no "confirm" command at
  // all, so a recognized voice phrase can never reach this function by itself.
  const confirmAndReserve = async () => {
    addUserMessage(t('confirmAndReserveLabel', lang));
    setHoldStatus({ status: 'loading', error: null });
    try {
      const { room, plan } = state.selectedRoom;
      const hold = await bookingApi.createHold({
        hotelId: state.selectedHotel.id,
        roomTypeId: room.id,
        ratePlanId: plan.ratePlanId,
        checkIn: state.checkIn,
        checkOut: state.checkOut,
        rooms: state.occupancy.length,
        occupancy: state.occupancy,
      });
      setHoldStatus({ status: 'ready', error: null });
      onClose();
      // Guest details, coupon application, final review and Razorpay payment continue on the existing,
      // unmodified booking pages -- preserving the Razorpay SDK's own required page flow rather than
      // rebuilding a second payment UI inside the chat panel.
      navigate(`/booking/guest-details?holdId=${hold.id}`);
    } catch (err) {
      setHoldStatus({ status: 'error', error: normalizeError(err).message });
    }
  };

  const items = searchResult?.items ?? [];
  const chatSearchState = useMemo(() => toSearchState(state), [state]);
  const compareHotels = items.filter((h) => state.compareIds.includes(h.id));

  const pickDestinationCandidate = (c) => {
    addUserMessage(c.label);
    const merged = mergeExtractedCriteria(state, { destination: { type: c.type, label: c.label, destination: c.destination, area: c.area ?? null } });
    const landingStep = firstIncompleteStep(merged, today);
    setState({ ...merged, step: landingStep });
    setAiMessage('');
    setAiState({ status: 'idle', error: null, note: null, candidates: [] });
  };

  // Resolves a free-text destination guess against the SAME real, published-places search the visible
  // DestinationField autocomplete already uses (discoveryApi.suggestDestinations) -- never a hardcoded
  // destination list, and never a specific hotel (mirrors the backend AI path's city/area-only scope).
  const resolveDestinationLocally = async (query) => {
    if (!query) return { resolved: null, candidates: [] };
    try {
      const results = await discoveryApi.suggestDestinations(query);
      const candidates = (results ?? []).filter((r) => r.type === 'CITY' || r.type === 'AREA').slice(0, 6);
      if (candidates.length === 1) {
        const c = candidates[0];
        return { resolved: { type: c.type, label: c.label, destination: c.destination, area: c.area ?? null }, candidates: [] };
      }
      return { resolved: null, candidates };
    } catch {
      return { resolved: null, candidates: [] };
    }
  };

  // The zero-network alternative to assistantApi.extract -- produces the exact same { ok, criteria,
  // missingInformation, destinationCandidates, clarificationQuestion } shape, so submitUtterance below
  // handles either source identically. Used whenever no AI provider is configured (the default here).
  const extractLocally = async (text) => {
    const { criteria: parsed, missingInformation } = parseUtterance(text, today);
    const missing = [...missingInformation];
    let destination = null;
    let destinationCandidates = [];
    if (parsed.destinationQuery) {
      const resolution = await resolveDestinationLocally(parsed.destinationQuery);
      destination = resolution.resolved;
      destinationCandidates = resolution.candidates;
      if (!destination && !missing.includes('destination')) missing.push('destination');
    }
    const criteria = {
      destination,
      checkIn: parsed.checkIn ?? null,
      checkOut: parsed.checkOut ?? null,
      occupancy: parsed.adults != null ? buildOccupancyFromCounts(parsed.adults, parsed.rooms) : null,
      propertyType: parsed.propertyType,
      stars: undefined,
      amenities: parsed.amenities,
      dinnerIncluded: parsed.dinnerIncluded,
      freeCancellation: parsed.freeCancellation,
      budget: parsed.budget ?? null,
    };
    return {
      ok: true,
      criteria,
      missingInformation: missing,
      destinationCandidates,
      clarificationQuestion: buildLocalClarification(missing, destinationCandidates, parsed.destinationQuery, lang),
    };
  };

  const applyVoiceCommand = (command) => {
    switch (command.command) {
      case 'SELECT_ORDINAL': {
        const hotel = items[command.index];
        if (hotel) selectProperty(hotel);
        else setAiState({ status: 'idle', error: null, note: t('ambiguousCommand', lang), candidates: [] });
        break;
      }
      case 'BACK':
        goBack();
        break;
      case 'CHANGE_BUDGET':
        patch({ step: STEP.BUDGET });
        break;
      case 'CHANGE_DATES':
        patch({ step: STEP.DATES });
        break;
      case 'CHANGE_GUESTS':
        patch({ step: STEP.GUESTS });
        break;
      case 'COMPARE':
        setShowCompare(true);
        break;
      default:
        break;
    }
  };

  const submitUtterance = async () => {
    const text = aiMessage.trim();
    if (!text) return;
    addUserMessage(text);
    setAiMessage('');
    setAiState({ status: 'loading', error: null, note: null, candidates: [] });

    // A small, explicit set of navigation commands ("change my budget", "go back", "show the second
    // hotel") is checked FIRST, at every step -- this is how a user corrects one detail (e.g. "change
    // check-in to tomorrow" routes to the real DATES step, which patches ONLY checkIn/checkOut) without
    // restarting the whole conversation. SELECT_ORDINAL only makes sense once real results are showing.
    const command = parseVoiceCommand(text);
    if (command && (command.command !== 'SELECT_ORDINAL' || state.step === STEP.RESULTS)) {
      applyVoiceCommand(command);
      setAiState({ status: 'idle', error: null, note: null, candidates: [] });
      return;
    }

    if (state.step === STEP.RESULTS) {
      // No confident navigation command on the results step -- never treated as a brand-new search.
      setAiState({ status: 'idle', error: null, note: t('ambiguousCommand', lang), candidates: [] });
      return;
    }

    try {
      const result = aiStatus.configured ? await assistantApi.extract(text) : await extractLocally(text);
      if (!result.ok) {
        setAiState({ status: 'idle', error: result.message, note: null, candidates: [] });
        return;
      }
      const merged = mergeExtractedCriteria(state, result.criteria);
      const landingStep = firstIncompleteStep(merged, today);
      setState({ ...merged, step: landingStep });
      setAiState({
        status: 'idle',
        error: null,
        note: result.clarificationQuestion,
        candidates: result.destinationCandidates?.length > 1 ? result.destinationCandidates : [],
      });
    } catch (err) {
      setAiState({ status: 'idle', error: normalizeError(err).message, note: null, candidates: [] });
    }
  };

  // Mic button: only ever fills the same editable text box a typed message would. The final transcript is
  // never auto-submitted -- the user reviews/edits it, then presses Send themselves, exactly like typing.
  const toggleListening = () => {
    if (listening) {
      stopListening();
      return;
    }
    setAiState((s) => ({ ...s, error: null }));
    recognizerRef.current = new SpeechRecognizer(speechLang, {
      onStart: () => setListening(true),
      onInterim: (text) => setAiMessage(text),
      onFinal: (text) => setAiMessage(text),
      onEnd: () => setListening(false),
      onError: (code) => {
        setListening(false);
        const key = SPEECH_ERROR_KEYS[code];
        if (key) setAiState((s) => ({ ...s, error: t(key, lang) }));
      },
    });
    recognizerRef.current.start();
  };

  // The concise prompt text for the current step -- this is ALL that is ever spoken aloud, never a full
  // hotel-card detail dump (resultsFound(n) is a one-line summary, not a reading of every result).
  const stepPromptText = useMemo(() => {
    switch (state.step) {
      case STEP.GREETING:
        return `${t('greeting', lang)}\n${t('welcomeLead', lang)}`;
      case STEP.DESTINATION:
        return t('askDestination', lang);
      case STEP.DATES:
        return t('askDates', lang);
      case STEP.GUESTS:
        return t('askGuests', lang);
      case STEP.PREFERENCES:
        return t('askPreferences', lang);
      case STEP.BUDGET:
        return t('askBudget', lang);
      case STEP.RESULTS:
        return searchStatus === 'ready' ? t('resultsFound', lang, searchResult?.items?.length ?? 0) : null;
      case STEP.ROOM_SELECT:
        return t('roomSelectHeader', lang, state.selectedHotel?.name ?? '', summarizeOccupancy(state.occupancy), nights);
      case STEP.BOOKING_REVIEW:
        return t('confirmBeforeHold', lang);
      default:
        return null;
    }
  }, [state.step, lang, searchStatus, searchResult, state.selectedHotel, state.occupancy, nights]);

  // Pushes the current step's prompt into the transcript exactly once per step-entry (keyed by step, or by
  // step+searchStatus for RESULTS so the "I found N stays" line appears once the real search resolves,
  // not before). Re-selecting the same step later (e.g. via Back) announces it again, as a real concierge
  // would -- this is NOT re-triggered by a language change alone, so past messages stay in the language
  // they were actually said in, like a real conversation transcript.
  const stepHistoryKey = state.step === STEP.RESULTS ? `RESULTS:${searchStatus}` : state.step;
  const lastHistoryKeyRef = useRef(null);
  useEffect(() => {
    if (!stepPromptText) return;
    if (lastHistoryKeyRef.current === stepHistoryKey) return;
    lastHistoryKeyRef.current = stepHistoryKey;
    addAssistantMessage(stepPromptText);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepHistoryKey, stepPromptText]);

  useEffect(() => {
    if (!speechEnabled || !open || !stepPromptText || !synthesisSupported) return;
    speak(stepPromptText, speechLang);
    setLastSpokenText(stepPromptText);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepPromptText, speechEnabled, open]);

  // Auto-scroll only when the user was already at (or near) the bottom -- never yanks someone back down
  // while they're reading an earlier message.
  const onTranscriptScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  };
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !stickToBottomRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [history, state.step, searchStatus, availability.status]);

  const toggleSpeech = () => {
    setSpeechEnabled((v) => {
      const next = !v;
      if (!next) stopSpeaking();
      return next;
    });
  };

  const replay = () => {
    if (lastSpokenText) speak(lastSpokenText, speechLang);
  };

  const restart = () => {
    clearDraft();
    stopListening();
    stopSpeaking();
    setState(initialAssistantState());
    setHistory([]);
    lastHistoryKeyRef.current = null;
    setSearchResult(null);
    setSearchStatus('idle');
    setAvailability({ status: 'idle', data: null, error: null });
    setHoldStatus({ status: 'idle', error: null });
    setShowCompare(false);
    setAiMessage('');
    setAiState({ status: 'idle', error: null, note: null, candidates: [] });
  };

  const showEntry = [STEP.GREETING, STEP.DESTINATION, STEP.DATES, STEP.GUESTS, STEP.PREFERENCES, STEP.BUDGET, STEP.RESULTS].includes(state.step);
  const progressSteps = [STEP.GREETING, STEP.DESTINATION, STEP.DATES, STEP.GUESTS, STEP.PREFERENCES, STEP.BUDGET, STEP.RESULTS, STEP.ROOM_SELECT, STEP.BOOKING_REVIEW];
  const progressValue = Math.max(1, progressSteps.indexOf(state.step) + 1);

  return (
    <div className="booking-assistant flex h-full min-h-0 min-w-0 flex-col">
      <AssistantHeader
        lang={lang}
        onChangeLanguage={changeLanguage}
        synthesisSupported={synthesisSupported}
        speechEnabled={speechEnabled}
        onToggleSpeech={toggleSpeech}
        canReplay={Boolean(lastSpokenText)}
        onReplay={replay}
        showRestart={state.step !== STEP.GREETING}
        onRestart={restart}
        onClose={onClose}
      />

      <div
        className="assistant-progress h-1 shrink-0 bg-[var(--surface-muted)]"
        role="progressbar"
        aria-label="Booking progress"
        aria-valuemin="1"
        aria-valuemax={progressSteps.length}
        aria-valuenow={progressValue}
      >
        <span
          className="block h-full rounded-r-full bg-brand-600 transition-[width] duration-300"
          style={{ width: `${(progressValue / progressSteps.length) * 100}%` }}
        />
      </div>

      <div ref={scrollRef} onScroll={onTranscriptScroll} className="assistant-transcript min-h-0 min-w-0 flex-1 space-y-2.5 overflow-x-hidden overflow-y-auto overscroll-contain break-words px-3 py-2.5">
        {history.map((m) => (m.role === 'assistant' ? <AssistantBubble key={m.id} text={m.text} /> : <UserBubble key={m.id} text={m.text} />))}
        {aiState.status === 'loading' && <TypingIndicator />}

        {state.step === STEP.GREETING && (
          <AssistantWelcome
            lang={lang}
            onFindHotels={() => {
              addUserMessage(t('quickFindHotelsTitle', lang));
              patch({ propertyType: 'HOTEL', step: STEP.DESTINATION });
            }}
            onExploreDestinations={() => {
              addUserMessage(t('quickExploreTitle', lang));
              patch({ propertyType: null, step: STEP.DESTINATION });
            }}
            onFindResorts={() => {
              addUserMessage(t('quickFindResortsTitle', lang));
              patch({ propertyType: 'RESORT', step: STEP.DESTINATION });
            }}
            onSearchByBudget={() => {
              addUserMessage(t('quickBudgetTitle', lang));
              patch({ propertyType: null, step: STEP.DESTINATION });
            }}
            onHelpWithBooking={() => {
              onClose();
              navigate('/my-trips');
            }}
            onUseExample={(example) => {
              setAiMessage(example);
              inputRef.current?.focus();
            }}
          />
        )}

        {state.step === STEP.DESTINATION && (
          <div className="space-y-2">
            <DestinationField id="assistant-destination" value={state.destination} onChange={(item) => patch({ destination: item })} />
            {!state.destination && <DestinationHints onPick={(item) => patch({ destination: item })} />}
            <StepFooter
              onBack={goBack}
              onNext={() => {
                addUserMessage(state.destination?.label ?? '');
                goNext();
              }}
              backLabel={t('backLabel', lang)}
              nextLabel={t('continueLabel', lang)}
              nextDisabled={!isStepComplete(STEP.DESTINATION, state)}
            />
          </div>
        )}

        {state.step === STEP.DATES && (
          <div className="space-y-2">
            <DateRangePicker
              idPrefix="assistant-dates"
              min={today}
              checkIn={state.checkIn}
              checkOut={state.checkOut}
              onChange={({ checkIn, checkOut }) => patch({ checkIn, checkOut })}
            />
            {stayProblem && state.checkIn && <p className="text-xs text-danger-600">{stayProblem}</p>}
            <StepFooter
              onBack={goBack}
              onNext={() => {
                addUserMessage(`${state.checkIn} → ${state.checkOut}`);
                goNext();
              }}
              backLabel={t('backLabel', lang)}
              nextLabel={t('continueLabel', lang)}
              nextDisabled={!isStepComplete(STEP.DATES, state, today)}
            />
          </div>
        )}

        {state.step === STEP.GUESTS && (
          <div className="space-y-2">
            <GuestsPopover idPrefix="assistant-guests" rooms={state.occupancy} onChange={(occupancy) => patch({ occupancy })} />
            <p className="text-xs text-[var(--text-muted)]">{summarizeOccupancy(state.occupancy)}</p>
            <StepFooter
              onBack={goBack}
              onNext={() => {
                addUserMessage(summarizeOccupancy(state.occupancy));
                goNext();
              }}
              backLabel={t('backLabel', lang)}
              nextLabel={t('continueLabel', lang)}
              nextDisabled={!isStepComplete(STEP.GUESTS, state)}
            />
          </div>
        )}

        {state.step === STEP.PREFERENCES && (
          <div className="space-y-2">
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">{t('starRatingLabel', lang)}</p>
              <p className="mb-2 text-xs text-[var(--text-muted)]">{t('starRatingNote', lang)}</p>
              <div className="flex flex-wrap gap-2">
                {STAR_RATING_OPTIONS.map((opt) => (
                  <QuickReply
                    key={opt.id}
                    selected={JSON.stringify(state.stars) === JSON.stringify(opt.stars)}
                    onClick={() => patch({ stars: opt.stars })}
                  >
                    {STAR_RATING_LABELS[lang][opt.id]}
                  </QuickReply>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">{t('amenitiesLabel', lang)}</p>
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {AMENITY_PREFERENCE_OPTIONS.map((opt) => (
                  <Checkbox
                    key={opt.code}
                    label={AMENITY_LABELS[lang][opt.code]}
                    checked={state.amenities.includes(opt.code)}
                    onChange={(e) =>
                      patch({
                        amenities: e.target.checked
                          ? [...state.amenities, opt.code]
                          : state.amenities.filter((c) => c !== opt.code),
                      })
                    }
                  />
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Checkbox
                label={t('dinnerIncludedLabel', lang)}
                checked={state.dinnerIncluded}
                onChange={(e) => patch({ dinnerIncluded: e.target.checked })}
              />
              <Checkbox
                label={t('freeCancellationLabel', lang)}
                checked={state.freeCancellation}
                onChange={(e) => patch({ freeCancellation: e.target.checked })}
              />
            </div>

            <StepFooter
              onBack={goBack}
              onNext={() => {
                addUserMessage(summarizePreferences(state, lang));
                goNext();
              }}
              backLabel={t('backLabel', lang)}
              nextLabel={t('continueLabel', lang)}
            />
          </div>
        )}

        {state.step === STEP.BUDGET && (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              {BUDGET_PRESETS.map((opt) => (
                <QuickReply
                  key={opt.id}
                  selected={state.minPrice === opt.minPrice && state.maxPrice === opt.maxPrice}
                  onClick={() => patch({ minPrice: opt.minPrice, maxPrice: opt.maxPrice })}
                >
                  {BUDGET_PRESET_LABELS[lang][opt.id]}
                </QuickReply>
              ))}
              <QuickReply selected={false} onClick={() => patch({ minPrice: undefined, maxPrice: undefined })}>
                {t('noBudgetLimit', lang)}
              </QuickReply>
            </div>

            <Card className="space-y-2 p-3">
              <p className="text-xs font-medium text-[var(--text-strong)]">{t('orEnterOwnMax', lang)}</p>
              <div className="flex flex-wrap items-center gap-2">
                <QuickReply selected={customBudget.mode === 'night'} onClick={() => setCustomBudget((c) => ({ ...c, mode: 'night' }))}>
                  {t('perNightLabel', lang)}
                </QuickReply>
                {nights > 0 && (
                  <QuickReply selected={customBudget.mode === 'total'} onClick={() => setCustomBudget((c) => ({ ...c, mode: 'total' }))}>
                    {t('totalForNights', lang, nights)}
                  </QuickReply>
                )}
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={customBudget.value}
                  onChange={(e) => setCustomBudget((c) => ({ ...c, value: e.target.value }))}
                  placeholder="e.g. 5000"
                  className="h-9 w-32 rounded-[var(--radius-control)] border border-[var(--border-subtle)] bg-[var(--surface-card)] px-3 text-sm"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={!customBudget.value}
                  onClick={() => {
                    const raw = Number(customBudget.value);
                    const perNight = customBudget.mode === 'total' ? totalBudgetToPerNightMax(raw, nights) : Math.max(1, Math.floor(raw));
                    if (perNight) patch({ minPrice: undefined, maxPrice: perNight });
                  }}
                >
                  {t('applyLabel', lang)}
                </Button>
              </div>
              {customBudget.mode === 'total' && nights > 0 && Number(customBudget.value) > 0 && (
                <p className="text-xs text-[var(--text-muted)]">
                  Equivalent to ₹{totalBudgetToPerNightMax(Number(customBudget.value), nights)?.toLocaleString('en-IN')} per night for your {nights}-night stay.
                </p>
              )}
            </Card>

            {(state.minPrice != null || state.maxPrice != null) && (
              <p className="text-xs text-[var(--text-muted)]">{summarizeBudget(state, lang)}</p>
            )}

            <StepFooter
              onBack={goBack}
              onNext={() => {
                addUserMessage(summarizeBudget(state, lang));
                goNext();
              }}
              backLabel={t('backLabel', lang)}
              nextLabel={t('searchRealStays', lang)}
            />
          </div>
        )}

        {state.step === STEP.RESULTS && (
          <div className="space-y-2">
            {searchStatus === 'loading' && (
              <div className="space-y-3">
                <HotelCardSkeleton />
                <HotelCardSkeleton />
              </div>
            )}

            {searchStatus === 'error' && (
              <EmptyState
                icon={SearchX}
                title={t('searchFailedTitle', lang)}
                description={searchError}
                action={
                  <Button size="sm" variant="secondary" onClick={runSearch}>
                    {t('tryAgain', lang)}
                  </Button>
                }
              />
            )}

            {searchStatus === 'ready' && items.length === 0 && (
              <EmptyState
                icon={SearchX}
                title={t('noMatchingTitle', lang)}
                description={t('noMatchingDesc', lang)}
                action={
                  <div className="flex flex-wrap justify-center gap-2">
                    <Button size="sm" variant="secondary" onClick={() => patch({ minPrice: undefined, maxPrice: undefined, step: STEP.BUDGET })}>
                      {t('changeBudget', lang)}
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => patch({ step: STEP.DATES })}>
                      {t('changeDates', lang)}
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => patch({ amenities: [], dinnerIncluded: false, freeCancellation: false, stars: undefined, step: STEP.PREFERENCES })}>
                      {t('relaxPreferences', lang)}
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => {
                        onClose();
                        const params = stayParams(state);
                        params.set('destination', slugifyPlace(state.destination?.destination ?? ''));
                        navigate(`/hotels?${params.toString()}`);
                      }}
                    >
                      {t('viewAllAvailable', lang)}
                    </Button>
                  </div>
                }
              />
            )}

            {searchStatus === 'ready' && items.length > 0 && (
              <div className="space-y-3">
                {state.compareIds.length >= 2 && (
                  <Button type="button" size="sm" variant="secondary" onClick={() => setShowCompare((v) => !v)}>
                    <Scale className="h-3.5 w-3.5" aria-hidden="true" /> {showCompare ? t('hideComparison', lang) : t('showComparison', lang, state.compareIds.length)}
                  </Button>
                )}
                {showCompare && <ComparisonTable hotels={compareHotels} />}

                {items.map((hotel) => (
                  <div key={hotel.id} className="space-y-2">
                    <HotelCard hotel={hotel} state={chatSearchState} />
                    <div className="flex items-center justify-between gap-2 px-1">
                      <Checkbox
                        label={t('compareUpTo', lang, MAX_COMPARE)}
                        checked={state.compareIds.includes(hotel.id)}
                        disabled={!state.compareIds.includes(hotel.id) && state.compareIds.length >= MAX_COMPARE}
                        onChange={() => patch({ compareIds: toggleCompare(state.compareIds, hotel.id) })}
                      />
                      <Button type="button" size="sm" onClick={() => selectProperty(hotel)}>
                        {t('selectThisStay', lang)}
                      </Button>
                    </div>
                  </div>
                ))}
                <p className="text-center text-xs text-[var(--text-muted)]">{t('showingResults', lang, items.length, searchResult?.total ?? items.length)}</p>
              </div>
            )}

            <StepFooter onBack={goBack} onNext={restart} backLabel={t('backLabel', lang)} nextLabel={t('startNewSearch', lang)} showBack />
          </div>
        )}

        {state.step === STEP.ROOM_SELECT && (
          <div className="space-y-2">
            {availability.status === 'loading' && (
              <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> {t('checkingAvailability', lang)}
              </div>
            )}
            {availability.status === 'error' && (
              <EmptyState
                icon={SearchX}
                title={t('couldntCheckAvailability', lang)}
                description={availability.error}
                action={
                  <Button size="sm" variant="secondary" onClick={() => loadAvailability(state.selectedHotel)}>
                    {t('tryAgain', lang)}
                  </Button>
                }
              />
            )}
            {availability.status === 'ready' && (
              <div className="space-y-3">
                {availability.data.roomTypes.filter((r) => r.available).length === 0 && (
                  <EmptyState icon={SearchX} title={t('noRoomsAvailable', lang)} description={t('tryDifferentDatesOrBack', lang)} />
                )}
                {availability.data.roomTypes.filter((r) => r.available).map((room) => (
                  <RoomCard key={room.id} room={room} nights={nights} rooms={state.occupancy.length} selection={null} onSelect={selectRoom} />
                ))}
                <UnavailableRooms rooms={availability.data.roomTypes.filter((r) => !r.available)} />
              </div>
            )}
            <StepFooter onBack={() => patch({ step: STEP.RESULTS })} onNext={() => patch({ step: STEP.RESULTS })} nextLabel={t('backToResults', lang)} showBack={false} />
          </div>
        )}

        {state.step === STEP.BOOKING_REVIEW && state.selectedRoom && (
          <div className="space-y-2">
            <Card className="space-y-2 p-4 text-sm">
              <Row label={t('rowProperty', lang)} value={state.selectedHotel?.name} />
              <Row label={t('rowRoom', lang)} value={state.selectedRoom.room.name} />
              <Row label={t('rowRatePlan', lang)} value={`${state.selectedRoom.plan.name} · ${state.selectedRoom.plan.mealPlan?.replaceAll('_', ' ')}`} />
              <Row label={t('rowCheckIn', lang)} value={state.checkIn} />
              <Row label={t('rowCheckOut', lang)} value={state.checkOut} />
              <Row label={t('rowNights', lang)} value={nights} />
              <Row label={t('rowRooms', lang)} value={state.occupancy.length} />
              <Row label={t('rowOccupancy', lang)} value={summarizeOccupancy(state.occupancy)} />
              <Row label={t('rowCancellation', lang)} value={state.selectedRoom.plan.cancellationPolicy?.description ?? 'See details at checkout'} />
              <div className="border-t border-[var(--border-subtle)] pt-2">
                <Row label={t('rowPricePerNight', lang)} value={formatMoney(state.selectedRoom.plan.pricePerNight)} />
                <Row label={t('rowTotal', lang)} value={<strong>{formatMoney(state.selectedRoom.plan.finalAmount)}</strong>} />
              </div>
              <p className="text-xs text-[var(--text-muted)]">{t('reviewFooterNote', lang)}</p>
            </Card>
            {holdStatus.error && <p className="text-xs text-danger-600">{holdStatus.error}</p>}
            <StepFooter
              onBack={() => patch({ step: STEP.ROOM_SELECT })}
              onNext={confirmAndReserve}
              backLabel={t('backLabel', lang)}
              nextLabel={holdStatus.status === 'loading' ? t('reserving', lang) : t('confirmAndReserveLabel', lang)}
              nextDisabled={holdStatus.status === 'loading'}
            />
          </div>
        )}
      </div>

      {showEntry && (
        <MessageComposer
          lang={lang}
          value={aiMessage}
          onChange={setAiMessage}
          onSubmit={submitUtterance}
          placeholder={t('entryPlaceholder', lang)}
          submitting={aiState.status === 'loading'}
          speechSupported={speechSupported}
          listening={listening}
          onToggleMic={toggleListening}
          error={aiState.error}
          note={aiState.note}
          candidates={aiState.candidates}
          onPickCandidate={pickDestinationCandidate}
          inputRef={inputRef}
        />
      )}
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-[var(--text-muted)]">{label}</span>
      <span className="text-right font-medium text-[var(--text-strong)]">{value}</span>
    </div>
  );
}

/**
 * Up to MAX_COMPARE real results, side by side. Every field comes straight from the same search response
 * already shown on the cards above -- nothing recomputed. All compared properties share the same search
 * (same dates/occupancy/destination), so their totals are directly comparable by construction.
 */
function ComparisonTable({ hotels }) {
  if (hotels.length < 2) return null;
  const rows = [
    { label: 'Property type', get: (h) => h.propertyType },
    { label: 'Star rating', get: (h) => (h.starRating ? `${h.starRating}★` : 'Not listed') },
    { label: 'Guest rating', get: (h) => (h.guestRating != null ? h.guestRating.toFixed(1) : h.rating ? h.rating.average.toFixed(1) : 'No reviews yet') },
    { label: 'Price per night', get: (h) => formatMoney(h.bestOffer.pricePerNightMinor) },
    { label: `Total (${hotels[0]?.bestOffer?.nights ?? ''} nights)`, get: (h) => formatMoney(h.bestOffer.finalTotalMinor) },
    { label: 'Free cancellation', get: (h) => (h.bestOffer.freeCancellation ? 'Yes' : 'No') },
    { label: 'Meal plan', get: (h) => h.bestOffer.mealPlan?.replaceAll('_', ' ') },
    { label: 'Amenities', get: (h) => h.amenities?.slice(0, 4).join(', ') || 'Not listed' },
  ];
  return (
    <Card className="overflow-x-auto p-3">
      <p className="mb-2 text-xs text-[var(--text-muted)]">Same dates, guests and rooms for every property below -- directly comparable.</p>
      <table className="w-full min-w-[26rem] text-left text-xs">
        <thead>
          <tr>
            <th className="py-1 pr-2 font-medium text-[var(--text-muted)]"> </th>
            {hotels.map((h) => (
              <th key={h.id} className="py-1 pr-2 font-semibold text-[var(--text-strong)]">{h.name}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="border-t border-[var(--border-subtle)]">
              <td className="py-1.5 pr-2 text-[var(--text-muted)]">{row.label}</td>
              {hotels.map((h) => (
                <td key={h.id} className="py-1.5 pr-2 text-[var(--text-body)]">{row.get(h) ?? '—'}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

/** Real popular destinations, shown only when the free-text field is still empty. */
function DestinationHints({ onPick }) {
  const [places, setPlaces] = useState(null);
  useEffect(() => {
    let cancelled = false;
    discoveryApi.popularDestinations({ limit: 6 }).then((items) => !cancelled && setPlaces(items)).catch(() => !cancelled && setPlaces([]));
    return () => {
      cancelled = true;
    };
  }, []);
  if (!places?.length) return null;
  return (
    <div className="mt-2">
      <p className="mb-1.5 text-xs text-[var(--text-muted)]">Popular right now:</p>
      <div className="flex flex-wrap gap-2">
        {places.map((place) => (
          <QuickReply key={place.destination} selected={false} onClick={() => onPick({ type: 'CITY', label: place.label, destination: place.destination })}>
            {place.label}
          </QuickReply>
        ))}
      </div>
    </div>
  );
}
