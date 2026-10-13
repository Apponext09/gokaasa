# Gokaasa Mobile

A React Native (Expo) client for the existing, live Gokaasa backend at **https://gokaasa.apponext.in/api**
(the same production API and PostgreSQL database the website at https://gokaasa.apponext.in already uses).
This app owns no business logic, no database, and no backend of its own.

## Design system

Colors/typography/spacing/radii live in `src/theme/colors.js` and `src/theme/spacing.js`, deliberately
mirroring the website's own navy/gold tokens (`frontend/src/index.css`) rather than introducing a new
palette -- the two apps are meant to read as one brand. Shared, reusable building blocks: `AppButton`,
`AppInput`, `HotelCard`, `DestinationInput` (+ `useDestinationSuggestions` hook), `GuestsModal`,
`DateField`, `Stepper`, `SectionHeader`, `StatusBadge`, `StarRating`, `ScreenContainer`,
`LoadingView`/`ErrorView`/`EmptyState`. Every screen's cards use the same `shadow.card`/`radius.card`
pair from `theme/spacing.js`.

## Search: a real, confirmed bug and its fix

"Hotel search isn't working" was diagnosed by actually calling the live backend with the exact requests
the app builds -- `GET /hotels/search`, `GET /destinations/search` -- and both returned correct real data
every time. **The backend was never the problem.** The real bug: the Home screen's search bar navigated
to an empty Search screen with no destination, and there was no explicit "Search Hotels" action anywhere
-- a search only fired reactively, silently, the instant an autocomplete suggestion was tapped, using
whatever default dates happened to be set. There was also no client-side validation before calling the
API. Fixed by giving both Home and Search a real two-stage flow: fill in destination/dates/guests, tap an
explicit **Search Hotels** button (blocked with an inline message if the destination or dates aren't
valid yet), then see results with an **Edit** action to revise the same search. Stale autocomplete and
search requests are now cancelled via `AbortController` when superseded, instead of racing silently.

## Running it

```bash
cd mobile
npx expo start
```

`.env` already points at production (`EXPO_PUBLIC_API_URL=https://gokaasa.apponext.in/api`) -- no backend
needs to be started locally. Press `a` to open on a connected Android device/emulator, or scan the QR code
in Expo Go on a physical phone (any network; this talks to the public internet, not a LAN machine).

**Local development against `C:\Gokaasa\backend` instead:** edit `.env` (see the commented-out options in
`.env.example`: `10.0.2.2` for an emulator, your machine's LAN IP for a physical phone) and restart
`expo start` -- Expo only reads `EXPO_PUBLIC_*` variables at bundler start, not on hot reload.

If `EXPO_PUBLIC_API_URL` is ever missing or malformed, `src/api/client.js` logs a warning and falls back to
the production URL rather than silently resolving to a dev-only address (see `resolveBaseUrl()`).

## Testing

```bash
cd mobile
npm test
```

Runs 54 tests across 5 suites (`jest` + `jest-expo` + `@testing-library/react-native`), all passing as of
the last run. These are unit/contract tests against **mocked** API modules -- they prove the client-side
code (state machines, error handling, response-field mapping, rendering) is internally correct for a given
server response. They are **not** evidence the real backend behaves this way; that was verified separately
and live, by actually calling the production API (registering and logging into a disposable test account,
and inspecting real `GET /hotels`, `/hotels/handpicked`, `/hotels/:slug`, `/destinations/search` responses)
-- see the git history / session notes for exactly what was checked and when.

- `tests/unit/client.test.js` -- `resolveBaseUrl()` (API config validation/fallback) and `normalizeError()`
  (error mapping + the idempotency regression test for a real, confirmed double-normalization bug).
- `tests/unit/format.test.js` -- date/money/occupancy formatting utilities used by booking/room screens.
- `tests/unit/AuthContext.test.js` -- session restore (via `refreshAccessToken`, never `authApi.me`),
  login/register success and failure (including the regression test proving a failed login's real server
  message, e.g. "Invalid email or password", survives to the caller instead of a generic fallback), logout.
- `tests/unit/HotelDetailsScreen.test.js` -- the exact missing-key regression (asserts zero `console.error`
  calls and the real `summary` text rendering, using the live-verified response shape as the mock), plus
  amenities rendering and a real error state.
- `tests/unit/apiWrappers.test.js` -- every `hotelsApi`/`bookingsApi`/`paymentsApi`/`wishlistApi` method
  calls the right endpoint and unwraps the right response field.

Toolchain notes for this Expo SDK 57 / React 19.2 combination (useful if `npm test` ever breaks after an
SDK bump): `@testing-library/react-native` 14+ needs the `test-renderer` package (not the deprecated
`react-test-renderer`, which conflicts with React 19.2 here), `jest-expo` needs `@react-native/jest-preset`
pinned to the exact installed `react-native` version, and `renderHook`/`render` from
`@testing-library/react-native` are `async` in this version -- always `await` them.

## Known limitations

1. **Session persistence across an app restart is best-effort, not guaranteed.** The backend issues a
   short-lived (15 min) bearer access token in the JSON response, plus a long-lived refresh token in an
   **httpOnly cookie** (`gk_refresh`, `Secure`, `SameSite=Strict`, scoped to `/api/auth`). That cookie can
   never be read by JavaScript on any platform, by design, and React Native's own documentation describes
   cookie-based auth as unstable across app restarts. This app does the standard thing (`axios` with
   `withCredentials: true`, mirroring the website) and degrades safely: if a silent `/auth/refresh` fails
   on launch, the user is simply asked to sign in again -- never a crash, never stuck in a broken
   half-authenticated state. Now that the app talks to the real HTTPS production domain, the cookie's
   `Secure` flag is actually satisfied end-to-end (it was mismatched against a plain-HTTP local backend
   before) -- a genuine improvement over local dev, though **this still was not verified on a real Android
   device/emulator session** (this environment has neither). On app *launch*, session restoration calls
   `POST /auth/refresh` directly (exactly like the website's own `AuthContext.jsx`), never `/auth/me` --
   see `src/api/client.js`'s comment on `isAuthCall` for why `/auth/me`'s own 401s are never
   auto-refreshed and would otherwise wrongly sign a valid session out. If guaranteed long-lived mobile
   sessions are wanted regardless of cookie behavior, the clean fix is a small, additive backend change
   (e.g. a mobile-specific login response that also returns the refresh token in the JSON body) -- out of
   scope here since backend changes are explicitly excluded.
2. **No profile-edit endpoint exists on the backend** (only `GET /api/auth/me`). `EditProfileScreen` shows
   the real account fields read-only with an explicit note, rather than faking a save that does nothing.
3. **Single room per search.** The guided guest/room picker supports one room (adults + per-child ages);
   the website's multi-room picker was not ported to keep this first version shippable. `occupancy` is
   still a real array in the exact shape the backend expects, so adding more rooms later is additive.
4. **Password reset is email-only, not deep-linked.** `ForgotPasswordScreen` requests the reset email via
   the real `/auth/forgot-password` endpoint; the link in that email opens the website's reset page (no
   `ResetPasswordScreen`/deep-link handling was built, since the spec's screen list didn't ask for one).
5. **Razorpay**: see "Razorpay integration" below -- real-gateway payments go through a WebView, not the
   native `react-native-razorpay` SDK. Whether production is actually configured with real Razorpay keys
   or is still running the backend's simulated gateway was not checked here (doing so would require
   hitting `/api/payments/create-order`, which needs a real hold/booking -- explicitly out of scope for
   connectivity verification). The app correctly branches on the server's own `simulated` flag either way.
6. **`GET /api/hotels` (the plain hotel listing) returns a raw `coverImageId`, not a resolved image URL --
   confirmed by calling it live against production.** `HomeScreen` therefore does not use it; only
   `/api/hotels/handpicked` and `/api/hotels/search` (which do resolve a real `image.url`) are shown.
   `hotelsApi.featuredHotels()` still exists (mirrors the website's own unused convenience method) but is
   documented in `src/api/hotelsApi.js` as unsuitable for `HotelCard` as-is.

## Booking Assistant (chat)

A full-screen chat concierge, reachable from a floating launcher (`src/components/assistant/
AssistantLauncher.js`) on every customer-facing screen except the chat itself, Auth, and any screen with a
real payment or time-boxed hold in progress (`RoomSelection`, `Booking`, `Payment`, `BookingConfirmation` --
see `shouldShowAssistantLauncher`). It is a React Native port of the website's own chat concierge
(`frontend/src/features/support/BookingAssistant.jsx`), reusing the exact same step state machine and
zero-network bilingual (English/Hindi) parser -- `src/features/assistant/assistantState.js` and
`bilingualParser.js` are direct ports of the website's modules of the same name, and `src/api/
assistantApi.js` calls the identical `/assistant/status` + `/assistant/extract` endpoints the website
calls, for the optional AI-extraction mode.

It is implemented as a modal-presentation screen in `RootNavigator` (`AssistantScreen.js`), not a hand-
rolled overlay: pushing it leaves whatever screen was underneath fully mounted, with its own state, scroll
position, and in-flight requests completely untouched, and closing it (the header's close button, the
hardware back button, or an iOS swipe-down) simply pops back to exactly that screen -- there is no custom
"preserve and restore state" logic to get wrong. Selecting a real hotel from the chat's results hands off
to the existing, unmodified HotelDetails -> Room Selection -> Booking -> Payment stack via a normal
navigation; the chat never creates a hold, collects payment details, or computes a price itself.

**Verified live against production** (`https://gokaasa.apponext.in/api`): destination search, hotel search,
and popular destinations all return real data through the exact requests the assistant builds. `/assistant/
status` and `/assistant/extract` currently 404 on production (that backend feature is not deployed there
yet) -- handled the same way a network failure is handled everywhere else in this app: `assistantApi.
status()`'s `.catch()` falls back to `configured: false`, so the assistant transparently uses its local,
zero-network parser instead, which is also the website's own default behavior in every environment checked
in this project. Nothing about the chat depends on the AI endpoint being present.

**Voice input (speech-to-text) was not implemented.** The website's chatbot uses the browser's native
`SpeechRecognition` API, which has no equivalent built into Expo Go; the closest options
(`@react-native-voice/voice`, `expo-speech-recognition`) both need native linking and therefore a custom
development build, not just `npx expo install`. Per this app's own constraint against adding dependencies
that need a dev build, typed input is the one way to talk to the assistant on mobile -- there is no
mic button pretending to work. **Voice output (text-to-speech) is implemented**, via the official
`expo-speech` module (Expo-Go compatible, no native linking, no permissions needed): a speaker toggle in
the chat header reads each step's prompt aloud in the selected language, mirroring half of the website's
voice feature.

## Razorpay integration

`react-native-razorpay` (the native SDK) needs native linking -- it is **not** bundled in Expo Go, so using
it would require a custom development build (`npx expo run:android` or `eas build --profile development`)
before it could even be tested. To keep this app runnable in plain Expo Go, real-gateway payments instead
open Razorpay's own hosted `checkout.js` inside a `react-native-webview` page (`react-native-webview` *is*
Expo-Go compatible, no native linking needed) -- the same script tag and options the website's browser
checkout uses, just hosted in a WebView instead of a browser tab. The WebView posts the
`{razorpay_payment_id, razorpay_order_id, razorpay_signature}` result back to React Native, which then
calls the existing `/api/payments/verify` endpoint -- the exact same server-side signature check the
website relies on. Nothing about pricing or payment success is ever trusted from the WebView alone.

**In this environment specifically**, `backend/.env` has no `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET` set, so
`/api/payments/config` reports `simulated: true` and the app shows the same "simulate success/failure"
buttons the website shows in that mode (`/api/payments/dev/checkout`) -- still verified through the real
`/api/payments/verify` signature check, just without a real money movement. The WebView path is implemented
and should work once real test keys are configured, but it has not been exercised against a live Razorpay
test order in this environment.

## What was NOT implemented

- Multi-room guest selection (see above).
- A dedicated reset-password screen (deep-linking a mailed token into the app).
- Push notifications (the backend has no push/device-token endpoint to register against).
- Hotel manager/admin screens -- this app is customer-only, matching the spec.
- Voice input (speech-to-text) in the Booking Assistant -- see "Booking Assistant (chat)" above. Voice
  output (text-to-speech) is implemented.
- Room selection/booking confirmation inside the chat itself -- the assistant hands off to the existing
  HotelDetails -> Room Selection -> Booking -> Payment screens instead of reimplementing that flow a
  second time (see "Booking Assistant (chat)" above).
- Device/emulator testing of the Booking Assistant's keyboard behavior, safe-area insets on a real notch,
  and the five mobile/tablet viewport sizes beyond what `jest`'s render-based smoke tests (`tests/unit/
  AssistantScreen.test.js`) and `expo-doctor`/`expo export` can check -- this environment has no Android
  emulator or physical device. All on-screen text, buttons, and layout code were written and exercised via
  automated tests, but never visually inspected running on a device.
