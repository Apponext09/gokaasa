import { useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Speech from 'expo-speech';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '../components/ScreenContainer.js';
import { DateField } from '../components/DateField.js';
import { DestinationInput } from '../components/DestinationInput.js';
import { GuestsModal } from '../components/GuestsModal.js';
import { HotelCard, HotelCardSkeleton } from '../components/HotelCard.js';
import { EmptyState } from '../components/EmptyState.js';
import { AssistantHeader } from '../components/assistant/AssistantHeader.js';
import { AssistantWelcome } from '../components/assistant/AssistantWelcome.js';
import { AssistantBubble, UserBubble, TypingIndicator } from '../components/assistant/MessageBubble.js';
import { MessageComposer } from '../components/assistant/MessageComposer.js';
import { hotelsApi } from '../api/hotelsApi.js';
import { assistantApi } from '../api/assistantApi.js';
import {
  AMENITY_PREFERENCE_OPTIONS,
  BUDGET_PRESETS,
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
  toSearchParams,
} from '../features/assistant/assistantState.js';
import { LANGUAGES, t, AMENITY_LABELS, STAR_RATING_LABELS, BUDGET_PRESET_LABELS } from '../features/assistant/bilingualContent.js';
import { parseUtterance, parseVoiceCommand } from '../features/assistant/bilingualParser.js';
import { todayIso, addDaysIso, occupancyLabel } from '../utils/format.js';
import { colors } from '../theme/colors.js';
import { radius, shadow, spacing, typography } from '../theme/spacing.js';

const DEFAULT_ROOM = { adults: 2, childAges: [] };

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

function buildOccupancyFromCounts(adults, rooms) {
  const totalAdults = Math.max(1, Math.floor(adults));
  const roomCount = Math.max(1, Math.min(Math.floor(rooms ?? 1) || 1, totalAdults));
  const base = Math.floor(totalAdults / roomCount);
  const remainder = totalAdults % roomCount;
  return Array.from({ length: roomCount }, (_, i) => ({ adults: base + (i < remainder ? 1 : 0), childAges: [] }));
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

function QuickReply({ selected, onPress, children }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, selected && styles.chipActive]} accessibilityRole="button" accessibilityState={{ selected }}>
      <Text style={[styles.chipText, selected && styles.chipTextActive]}>{children}</Text>
    </Pressable>
  );
}

function StepFooter({ onBack, onNext, backLabel, nextLabel, nextDisabled, showBack = true }) {
  return (
    <View style={styles.footerRow}>
      {showBack ? (
        <Pressable onPress={onBack} style={styles.backButton}>
          <Ionicons name="arrow-back" size={14} color={colors.textBody} />
          <Text style={styles.backButtonText}>{backLabel}</Text>
        </Pressable>
      ) : (
        <View />
      )}
      <Pressable onPress={onNext} disabled={nextDisabled} style={[styles.nextButton, nextDisabled && styles.nextButtonDisabled]}>
        <Text style={styles.nextButtonText}>{nextLabel}</Text>
      </Pressable>
    </View>
  );
}

/**
 * The mobile Booking Assistant -- a native React Native port of the website's chat concierge
 * (frontend/src/features/support/BookingAssistant.jsx), reusing the SAME ported step state machine
 * (assistantState.js) and local bilingual parser (bilingualParser.js), and the SAME real APIs
 * (hotelsApi, assistantApi) the rest of this app already uses. Presented as a full-screen modal route
 * (see RootNavigator.js) so closing it (back gesture, hardware back, or the header's close button) simply
 * pops back to whatever screen was already underneath -- its state, scroll position, and any in-flight
 * search are completely untouched, because that screen was never unmounted.
 *
 * Selecting a real hotel from RESULTS hands off to the existing, unmodified HotelDetails -> Room
 * Selection -> Booking -> Payment stack via a normal navigation -- this screen never creates a hold,
 * collects payment details, or computes a price itself.
 */
export default function AssistantScreen({ navigation }) {
  const [state, setState] = useState(initialAssistantState);
  const [draftReady, setDraftReady] = useState(false);
  const lang = state.language;
  const speechLang = LANGUAGES.find((l) => l.code === lang)?.speechLang ?? 'en-IN';

  const [history, setHistory] = useState([]);
  const [composerText, setComposerText] = useState('');
  const [aiState, setAiState] = useState({ status: 'idle', error: null, note: null, candidates: [] });
  const [speechEnabled, setSpeechEnabled] = useState(false);

  const [destinationText, setDestinationText] = useState('');
  const [destinations, setDestinations] = useState([]);
  const [searchStatus, setSearchStatus] = useState('idle');
  const [searchResult, setSearchResult] = useState({ items: [], total: 0 });
  const [guestsOpen, setGuestsOpen] = useState(false);
  const [customBudget, setCustomBudget] = useState('');

  const scrollRef = useRef(null);
  const historyIdRef = useRef(0);
  const lastStepKeyRef = useRef(null);
  const prevStepRef = useRef(STEP.GREETING);
  // Guards every independent background fetch below (popular destinations, AI-configured status, and the
  // real hotel search) against calling setState after the screen has already been popped -- e.g. the user
  // taps a result or closes the chat while a request is still in flight.
  const mountedRef = useRef(true);
  useEffect(
    () => () => {
      mountedRef.current = false;
    },
    [],
  );

  const addMessage = (role, text) => {
    if (!text) return;
    historyIdRef.current += 1;
    setHistory((h) => [...h, { id: historyIdRef.current, role, text }]);
  };
  const addAssistant = (text) => addMessage('assistant', text);
  const addUser = (text) => addMessage('user', text);

  // Restore the last draft search (destination/dates/guests/preferences/budget -- never anything
  // sensitive, see assistantState.js) once on mount. AsyncStorage is async, so the screen renders the
  // greeting first and swaps in the saved draft a moment later if one exists.
  useEffect(() => {
    let cancelled = false;
    loadDraft().then((draft) => {
      if (!cancelled && draft) {
        setState((s) => ({ ...s, ...draft }));
        if (draft.destination?.label) setDestinationText(draft.destination.label);
      }
      if (!cancelled) setDraftReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (draftReady) saveDraft(state);
  }, [state, draftReady]);

  useEffect(() => {
    hotelsApi
      .popularDestinations({ limit: 6 })
      .then((items) => mountedRef.current && setDestinations(items))
      .catch(() => mountedRef.current && setDestinations([]));
  }, []);

  useEffect(
    () => () => {
      Speech.stop();
    },
    [],
  );

  const patch = (changes) => setState((s) => ({ ...s, ...changes }));
  const goNext = () => patch({ step: nextStep(state.step) });
  const goBackStep = () => patch({ step: previousStep(state.step) });

  const changeLanguage = (code) => {
    if (code !== state.language) patch({ language: code });
  };

  // initialAssistantState() leaves checkIn/checkOut null (shared, framework-agnostic logic ported from
  // the website, which uses its own in-row calendar widget). On mobile, selecting a date means opening
  // the platform's native date-picker modal per field, more friction than a web calendar -- so, the
  // FIRST time the user actually reaches the DATES step with nothing chosen yet, it's pre-filled to
  // tomorrow/the day after (the same default HomeScreen/SearchScreen already use), which they can still
  // change via DateField. This intentionally does NOT happen at initial state construction: doing it
  // there was tried and reverted (see git history) because it made isStepComplete(DATES) -- and therefore
  // firstIncompleteStep, used by free-text extraction and destination-candidate picks -- treat dates as
  // already answered before the user had ever seen them, skipping straight from DESTINATION to RESULTS.
  useEffect(() => {
    if (state.step === STEP.DATES && !state.checkIn && !state.checkOut) {
      patch({ checkIn: addDaysIso(todayIso(), 1), checkOut: addDaysIso(todayIso(), 2) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.step]);

  const searchAbortRef = useRef(null);

  const runSearch = async () => {
    searchAbortRef.current?.abort();
    const controller = new AbortController();
    searchAbortRef.current = controller;
    setSearchStatus('loading');
    try {
      const data = await hotelsApi.search(toSearchParams(state), { signal: controller.signal });
      if (!mountedRef.current) return;
      setSearchResult({ items: data.items ?? [], total: data.total ?? 0 });
      setSearchStatus('ready');
    } catch (err) {
      if (err?.code === 'CANCELED' || !mountedRef.current) return; // superseded by a newer search, or the screen closed
      setSearchResult({ items: [], total: 0, error: err.message });
      setSearchStatus('error');
    }
  };

  useEffect(() => {
    if (state.step === STEP.RESULTS && searchStatus === 'idle') runSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.step]);

  useEffect(() => () => searchAbortRef.current?.abort(), []);

  // Leaving RESULTS to refine a criterion (the back arrow, or a "change my budget/dates/guests" voice
  // command, both of which can jump straight out of RESULTS without going through goBackStep) must make
  // the NEXT visit to RESULTS run a fresh search -- otherwise re-entering RESULTS after changing the
  // budget/dates/guests/preferences silently keeps showing the stale results gated on `searchStatus ===
  // 'idle'` above, since nothing else ever reset it back to 'idle'.
  useEffect(() => {
    if (prevStepRef.current === STEP.RESULTS && state.step !== STEP.RESULTS) {
      setSearchStatus('idle');
    }
    prevStepRef.current = state.step;
  }, [state.step]);

  const openHotel = (hotel) => {
    navigation.goBack();
    navigation.navigate('HotelDetails', { idOrSlug: hotel.slug, checkIn: state.checkIn, checkOut: state.checkOut, occupancy: state.occupancy });
  };

  const pickDestinationCandidate = (c) => {
    addUser(c.label);
    const merged = mergeExtractedCriteria(state, { destination: { type: c.type, label: c.label, destination: c.destination, area: c.area ?? null } });
    setState({ ...merged, step: firstIncompleteStep(merged, todayIso()) });
    setDestinationText(c.label);
    setAiState({ status: 'idle', error: null, note: null, candidates: [] });
  };

  const resolveDestinationLocally = async (query) => {
    if (!query) return { resolved: null, candidates: [] };
    try {
      const results = await hotelsApi.suggestDestinations(query);
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

  const extractLocally = async (text) => {
    const { criteria: parsed, missingInformation } = parseUtterance(text, todayIso());
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
        const hotel = searchResult.items[command.index];
        if (hotel) openHotel(hotel);
        else setAiState({ status: 'idle', error: null, note: t('ambiguousCommand', lang), candidates: [] });
        break;
      }
      case 'BACK':
        goBackStep();
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
      default:
        break;
    }
  };

  const [aiConfigured, setAiConfigured] = useState(false);
  useEffect(() => {
    assistantApi
      .status()
      .then((s) => mountedRef.current && setAiConfigured(Boolean(s.configured)))
      .catch(() => mountedRef.current && setAiConfigured(false));
  }, []);

  const submitUtterance = async () => {
    const text = composerText.trim();
    if (!text) return;
    addUser(text);
    setComposerText('');
    setAiState({ status: 'loading', error: null, note: null, candidates: [] });

    const command = parseVoiceCommand(text);
    if (command && (command.command !== 'SELECT_ORDINAL' || state.step === STEP.RESULTS)) {
      applyVoiceCommand(command);
      setAiState({ status: 'idle', error: null, note: null, candidates: [] });
      return;
    }

    if (state.step === STEP.RESULTS) {
      setAiState({ status: 'idle', error: null, note: t('ambiguousCommand', lang), candidates: [] });
      return;
    }

    try {
      const result = aiConfigured ? await assistantApi.extract(text) : await extractLocally(text);
      if (!result.ok) {
        setAiState({ status: 'idle', error: result.message, note: null, candidates: [] });
        return;
      }
      const merged = mergeExtractedCriteria(state, result.criteria);
      setState({ ...merged, step: firstIncompleteStep(merged, todayIso()) });
      setAiState({
        status: 'idle',
        error: null,
        note: result.clarificationQuestion,
        candidates: result.destinationCandidates?.length > 1 ? result.destinationCandidates : [],
      });
    } catch (err) {
      setAiState({ status: 'idle', error: err.message, note: null, candidates: [] });
    }
  };

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
        return searchStatus === 'ready' ? t('resultsFound', lang, searchResult.items.length) : null;
      default:
        return null;
    }
  }, [state.step, lang, searchStatus, searchResult.items.length]);

  const stepKey = state.step === STEP.RESULTS ? `RESULTS:${searchStatus}` : state.step;
  useEffect(() => {
    if (!draftReady || !stepPromptText) return;
    if (lastStepKeyRef.current === stepKey) return;
    lastStepKeyRef.current = stepKey;
    addAssistant(stepPromptText);
    if (speechEnabled) Speech.speak(stepPromptText, { language: speechLang });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepKey, stepPromptText, draftReady]);

  const toggleSpeech = () => {
    setSpeechEnabled((v) => {
      if (v) Speech.stop();
      return !v;
    });
  };

  const restart = async () => {
    await clearDraft();
    Speech.stop();
    // Cancels a still-in-flight search (e.g. restart tapped while RESULTS is loading) -- otherwise that
    // old request could resolve after the reset below and silently repopulate it with stale results.
    searchAbortRef.current?.abort();
    setState(initialAssistantState());
    setDestinationText('');
    setHistory([]);
    lastStepKeyRef.current = null;
    setSearchResult({ items: [], total: 0 });
    setSearchStatus('idle');
    setAiState({ status: 'idle', error: null, note: null, candidates: [] });
    setComposerText('');
  };

  const showComposer = state.step !== STEP.RESULTS || searchStatus !== 'loading';

  return (
    <ScreenContainer edges={['bottom']} style={styles.screen}>
      <AssistantHeader
        lang={lang}
        onChangeLanguage={changeLanguage}
        speechSupported
        speechEnabled={speechEnabled}
        onToggleSpeech={toggleSpeech}
        showRestart={state.step !== STEP.GREETING}
        onRestart={restart}
        onClose={() => navigation.goBack()}
      />

      <KeyboardAvoidingView style={styles.flex1} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
        <ScrollView
          ref={scrollRef}
          style={styles.flex1}
          contentContainerStyle={styles.transcript}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        >
          {history.map((m) => (m.role === 'assistant' ? <AssistantBubble key={m.id} text={m.text} /> : <UserBubble key={m.id} text={m.text} />))}
          {aiState.status === 'loading' && <TypingIndicator />}

          {state.step === STEP.GREETING && (
            <AssistantWelcome
              lang={lang}
              onFindHotels={() => {
                addUser(t('quickFindHotelsTitle', lang));
                patch({ propertyType: 'HOTEL', step: STEP.DESTINATION });
              }}
              onExploreDestinations={() => {
                addUser(t('quickExploreTitle', lang));
                patch({ propertyType: null, step: STEP.DESTINATION });
              }}
              onFindResorts={() => {
                addUser(t('quickFindResortsTitle', lang));
                patch({ propertyType: 'RESORT', step: STEP.DESTINATION });
              }}
              onSearchByBudget={() => {
                addUser(t('quickBudgetTitle', lang));
                patch({ propertyType: null, step: STEP.DESTINATION });
              }}
              onHelpWithBooking={() => {
                navigation.goBack();
                navigation.navigate('Main', { screen: 'MyTrips' });
              }}
              onUseExample={setComposerText}
            />
          )}

          {state.step === STEP.DESTINATION && (
            <View style={styles.stepBlock}>
              <DestinationInput
                text={destinationText}
                onChangeText={setDestinationText}
                selected={state.destination}
                onSelect={(value) => {
                  patch({ destination: value });
                  // A functional updater, not `value?.label ?? destinationText`: DestinationInput calls
                  // this (with null, to clear the prior selection) in the SAME synchronous handler as its
                  // own onChangeText(newText) call, right after a keystroke. Reading the `destinationText`
                  // closure variable here would capture the PRE-keystroke value and silently overwrite
                  // what was just typed the moment any destination had ever been selected -- a real,
                  // reproducible bug (every keystroke immediately reverted) found while validating this
                  // screen, and verified to be the same pre-existing pattern in HomeScreen.js/
                  // SearchScreen.js's identical onSelect handlers.
                  setDestinationText((prev) => value?.label ?? prev);
                }}
                onPickHotel={(item) => {
                  navigation.goBack();
                  navigation.navigate('HotelDetails', { idOrSlug: item.hotelSlug, checkIn: state.checkIn, checkOut: state.checkOut, occupancy: state.occupancy });
                }}
              />
              {!state.destination && destinations.length > 0 && (
                <View style={styles.chipRow}>
                  {destinations.map((d) => (
                    <QuickReply
                      key={d.destination}
                      onPress={() => {
                        patch({ destination: { type: 'CITY', label: d.label, destination: d.destination } });
                        setDestinationText(d.label);
                      }}
                    >
                      {d.label}
                    </QuickReply>
                  ))}
                </View>
              )}
              <StepFooter
                onBack={goBackStep}
                onNext={() => {
                  addUser(state.destination?.label ?? '');
                  goNext();
                }}
                backLabel={t('backLabel', lang)}
                nextLabel={t('continueLabel', lang)}
                nextDisabled={!isStepComplete(STEP.DESTINATION, state)}
              />
            </View>
          )}

          {state.step === STEP.DATES && (
            <View style={styles.stepBlock}>
              <View style={styles.row}>
                <DateField label="Check-in" value={state.checkIn} onChange={(v) => patch({ checkIn: v })} minimumDate={todayIso()} />
                <DateField label="Check-out" value={state.checkOut} onChange={(v) => patch({ checkOut: v })} minimumDate={addDaysIso(state.checkIn ?? todayIso(), 1)} />
              </View>
              <StepFooter
                onBack={goBackStep}
                onNext={() => {
                  addUser(`${state.checkIn} → ${state.checkOut}`);
                  goNext();
                }}
                backLabel={t('backLabel', lang)}
                nextLabel={t('continueLabel', lang)}
                nextDisabled={!isStepComplete(STEP.DATES, state, todayIso())}
              />
            </View>
          )}

          {state.step === STEP.GUESTS && (
            <View style={styles.stepBlock}>
              <Pressable style={styles.guestsRow} onPress={() => setGuestsOpen(true)}>
                <Ionicons name="people-outline" size={16} color={colors.brand600} />
                <Text style={styles.guestsText}>{occupancyLabel(state.occupancy)}</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.textMuted} style={styles.flexAuto} />
              </Pressable>
              <StepFooter
                onBack={goBackStep}
                onNext={() => {
                  addUser(occupancyLabel(state.occupancy));
                  goNext();
                }}
                backLabel={t('backLabel', lang)}
                nextLabel={t('continueLabel', lang)}
                nextDisabled={!isStepComplete(STEP.GUESTS, state)}
              />
            </View>
          )}

          {state.step === STEP.PREFERENCES && (
            <View style={styles.stepBlock}>
              <Text style={styles.sectionLabel}>{t('starRatingLabel', lang)}</Text>
              <View style={styles.chipRow}>
                {STAR_RATING_OPTIONS.map((opt) => (
                  <QuickReply key={opt.id} selected={JSON.stringify(state.stars) === JSON.stringify(opt.stars)} onPress={() => patch({ stars: opt.stars })}>
                    {STAR_RATING_LABELS[lang][opt.id]}
                  </QuickReply>
                ))}
              </View>

              <Text style={styles.sectionLabel}>{t('amenitiesLabel', lang)}</Text>
              <View style={styles.chipRow}>
                {AMENITY_PREFERENCE_OPTIONS.map((opt) => {
                  const active = state.amenities.includes(opt.code);
                  return (
                    <QuickReply
                      key={opt.code}
                      selected={active}
                      onPress={() => patch({ amenities: active ? state.amenities.filter((c) => c !== opt.code) : [...state.amenities, opt.code] })}
                    >
                      {AMENITY_LABELS[lang][opt.code]}
                    </QuickReply>
                  );
                })}
              </View>

              <View style={styles.chipRow}>
                <QuickReply selected={state.dinnerIncluded} onPress={() => patch({ dinnerIncluded: !state.dinnerIncluded })}>
                  {t('dinnerIncludedLabel', lang)}
                </QuickReply>
                <QuickReply selected={state.freeCancellation} onPress={() => patch({ freeCancellation: !state.freeCancellation })}>
                  {t('freeCancellationLabel', lang)}
                </QuickReply>
              </View>

              <StepFooter
                onBack={goBackStep}
                onNext={() => {
                  addUser(summarizePreferences(state, lang));
                  goNext();
                }}
                backLabel={t('backLabel', lang)}
                nextLabel={t('continueLabel', lang)}
              />
            </View>
          )}

          {state.step === STEP.BUDGET && (
            <View style={styles.stepBlock}>
              <View style={styles.chipRow}>
                {BUDGET_PRESETS.map((opt) => (
                  <QuickReply
                    key={opt.id}
                    selected={state.minPrice === opt.minPrice && state.maxPrice === opt.maxPrice}
                    onPress={() => patch({ minPrice: opt.minPrice, maxPrice: opt.maxPrice })}
                  >
                    {BUDGET_PRESET_LABELS[lang][opt.id]}
                  </QuickReply>
                ))}
                <QuickReply selected={false} onPress={() => patch({ minPrice: undefined, maxPrice: undefined })}>
                  {t('noBudgetLimit', lang)}
                </QuickReply>
              </View>
              <View style={styles.row}>
                <TextInput
                  value={customBudget}
                  onChangeText={(v) => setCustomBudget(v.replace(/[^0-9]/g, ''))}
                  keyboardType="numeric"
                  placeholder={t('orEnterOwnMax', lang)}
                  placeholderTextColor={colors.textMuted}
                  style={styles.budgetInput}
                />
                <Pressable
                  style={[styles.applyButton, !customBudget && styles.applyButtonDisabled]}
                  disabled={!customBudget}
                  onPress={() => {
                    const perNight = Math.max(1, Math.floor(Number(customBudget)));
                    if (perNight) patch({ minPrice: undefined, maxPrice: perNight });
                    setCustomBudget('');
                  }}
                >
                  <Text style={styles.applyButtonText}>{t('applyLabel', lang)}</Text>
                </Pressable>
              </View>
              {(state.minPrice != null || state.maxPrice != null) && <Text style={styles.caption}>{summarizeBudget(state, lang)}</Text>}
              <StepFooter
                onBack={goBackStep}
                onNext={() => {
                  addUser(summarizeBudget(state, lang));
                  goNext();
                }}
                backLabel={t('backLabel', lang)}
                nextLabel={t('searchRealStays', lang)}
              />
            </View>
          )}

          {state.step === STEP.RESULTS && (
            <View style={styles.stepBlock}>
              {searchStatus === 'loading' && (
                <>
                  <HotelCardSkeleton />
                  <HotelCardSkeleton />
                </>
              )}
              {searchStatus === 'error' && (
                <EmptyState icon="cloud-offline-outline" title={t('searchFailedTitle', lang)} message={searchResult.error} />
              )}
              {searchStatus === 'ready' && searchResult.items.length === 0 && (
                <EmptyState icon="bed-outline" title={t('noMatchingTitle', lang)} message={t('noMatchingDesc', lang)} />
              )}
              {searchStatus === 'ready' &&
                searchResult.items.map((hotel) => <HotelCard key={hotel.id} hotel={hotel} onPress={() => openHotel(hotel)} />)}
              <StepFooter onBack={goBackStep} onNext={restart} backLabel={t('backLabel', lang)} nextLabel={t('startNewSearch', lang)} />
            </View>
          )}
        </ScrollView>

        {showComposer && (
          <MessageComposer
            value={composerText}
            onChange={setComposerText}
            onSubmit={submitUtterance}
            placeholder={t('entryPlaceholder', lang)}
            submitting={aiState.status === 'loading'}
            error={aiState.error}
            note={aiState.note}
            candidates={aiState.candidates}
            onPickCandidate={pickDestinationCandidate}
          />
        )}
      </KeyboardAvoidingView>

      <GuestsModal visible={guestsOpen} room={state.occupancy[0] ?? DEFAULT_ROOM} onChange={(room) => patch({ occupancy: [room] })} onClose={() => setGuestsOpen(false)} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.surfaceCard },
  flex1: { flex: 1 },
  transcript: { padding: spacing.lg, paddingBottom: spacing.xxl },
  stepBlock: { gap: spacing.md },
  row: { flexDirection: 'row', gap: spacing.sm },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderSubtle, backgroundColor: colors.surfaceCard, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  chipActive: { backgroundColor: colors.brand600, borderColor: colors.brand600 },
  chipText: { ...typography.caption, color: colors.textBody, fontWeight: '600' },
  chipTextActive: { color: colors.white },
  sectionLabel: { ...typography.tiny, color: colors.textMuted, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  caption: { ...typography.caption, color: colors.textMuted },
  guestsRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm, height: 48, borderRadius: radius.control,
    borderWidth: 1, borderColor: colors.borderSubtle, paddingHorizontal: spacing.md, backgroundColor: colors.surfaceCard,
  },
  guestsText: { ...typography.body, color: colors.textStrong },
  flexAuto: { marginLeft: 'auto' },
  footerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 2 },
  backButton: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: spacing.sm, paddingHorizontal: spacing.sm },
  backButtonText: { ...typography.caption, color: colors.textBody, fontWeight: '600' },
  nextButton: { backgroundColor: colors.brand600, borderRadius: radius.control, paddingHorizontal: spacing.xl, paddingVertical: spacing.sm, ...shadow.subtle },
  nextButtonDisabled: { backgroundColor: colors.surfaceMuted },
  nextButtonText: { ...typography.bodyStrong, color: colors.white },
  budgetInput: {
    flex: 1, height: 44, borderRadius: radius.control, borderWidth: 1, borderColor: colors.borderSubtle,
    backgroundColor: colors.surfaceCard, paddingHorizontal: spacing.md, ...typography.body, color: colors.textStrong,
  },
  applyButton: { height: 44, borderRadius: radius.control, backgroundColor: colors.brand600, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg },
  applyButtonDisabled: { backgroundColor: colors.surfaceMuted },
  applyButtonText: { ...typography.bodyStrong, color: colors.white },
});
