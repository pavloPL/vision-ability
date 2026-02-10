# Vision Ability - Accessibility Voice Assistant App
## Technical Analysis, Development Plan & Architecture

---

## 1. Executive Summary

**Vision Ability** is a voice-first mobile application for iOS and Android, designed to help visually impaired people in London with:

1. **Voice-guided navigation** — speak a destination, get step-by-step journey instructions via voice (walking, bus, tube, etc.)
2. **NHS Portal access** — read GP messages, request prescriptions, all via voice interaction

---

## 2. Technology Stack Recommendation

### 2.1 Cross-Platform Framework

| Option | Language | Pros | Cons |
|--------|----------|------|------|
| **React Native + Expo** | JavaScript/TypeScript | Your JS expertise, huge ecosystem, great accessibility APIs, OTA updates | Performance slightly below native for heavy animations |
| Flutter | Dart | Great UI, good performance | New language to learn, smaller accessibility community |
| NativeScript | JavaScript | Direct native API access | Smaller community, fewer libraries |
| Capacitor/Ionic | JavaScript | Web-based, easy | Poor native feel, limited accessibility |

### **Recommendation: React Native with Expo (SDK 52+)**

**Why:**
- **JavaScript/TypeScript** — matches your expertise perfectly
- **Expo** — managed workflow means no Xcode/Android Studio config headaches, easy OTA updates, EAS Build for app store submissions
- **Accessibility** — React Native has first-class support for `accessibilityRole`, `accessibilityLabel`, `accessibilityHint`, `accessibilityLiveRegion`, and integrates natively with VoiceOver (iOS) and TalkBack (Android)
- **Mature ecosystem** — excellent libraries for speech, geolocation, haptics

---

### 2.2 Voice & AI Architecture

This is the critical differentiator. There are **two architectural approaches:**

#### Approach A: Traditional Pipeline (Recommended for MVP)
```
User speaks → Speech-to-Text → Intent Recognition → Action → Text-to-Speech → User hears
```

| Component | Technology | Cost |
|-----------|-----------|------|
| Speech-to-Text | `expo-speech-recognition` (on-device, free) or OpenAI Whisper API ($0.006/min) | Free–Low |
| Intent Recognition | OpenAI GPT-4o-mini API | Low |
| Text-to-Speech | `expo-speech` (on-device, free) or OpenAI TTS ($0.015/1K chars) | Free–Low |

#### Approach B: Conversational AI (Best UX, Phase 2)
```
User speaks → OpenAI Realtime Voice API → Streaming voice response
```

| Component | Technology | Cost |
|-----------|-----------|------|
| Full conversation | OpenAI Realtime API (GPT-4o) | ~$0.06/min input + $0.24/min output |

#### **Recommendation: Start with Approach A, migrate to B**

**Approach A** gives you:
- Lower cost per interaction
- On-device STT/TTS works offline for basic commands
- Full control over the conversation flow
- Easier to test and debug

**Approach B** adds later:
- More natural conversation
- Better at handling ambiguous requests
- Streaming voice feels like talking to a person

#### Alternative to AI for Voice: Platform Native APIs

| Solution | Pros | Cons |
|----------|------|------|
| **`expo-speech-recognition`** | Free, on-device, offline, no API key | Limited intent understanding, requires rigid command patterns |
| **`expo-speech`** (TTS) | Free, on-device, offline | Robotic voice quality |
| **Dialogflow (Google)** | Good intent recognition, free tier | Extra vendor, complex setup |
| **Amazon Lex** | Good NLU, cheap | AWS lock-in |
| **OpenAI Whisper + GPT** | Best understanding, handles natural speech | Requires internet, costs per request |

**Verdict:** Use **on-device STT/TTS** (`expo-speech-recognition` + `expo-speech`) for the voice layer (free, offline-capable), and **OpenAI GPT-4o-mini** only for intent understanding and generating navigation instructions. This keeps costs minimal while providing excellent natural language understanding.

---

### 2.3 Navigation Feature — APIs & Architecture

#### Primary API: TfL Journey Planner (Free)

The **Transport for London Unified API** is perfect for this use case:
- **Endpoint:** `GET https://api.tfl.gov.uk/Journey/JourneyResults/{from}/to/{to}`
- **Free** with registration (app_id + app_key)
- **Covers:** Walking, Bus, Tube, DLR, Overground, Elizabeth Line, River Bus, Cycling
- **Returns:** Step-by-step instructions, times, line changes, accessibility info
- **Accessibility data:** Includes step-free access info for stations

#### Geolocation
- **`expo-location`** — GPS for current position (starting location default)
- Reverse geocoding to confirm user's current area

#### Architecture Flow
```
1. User taps big "Navigate" button (or says "Navigate")
2. App listens for destination via expo-speech-recognition
3. Destination text → GPT-4o-mini to extract structured address
4. expo-location gets current GPS coordinates
5. TfL API call with from/to coordinates
6. GPT-4o-mini converts JSON response into natural spoken instructions
7. expo-speech reads instructions step by step
8. User can say "next step", "repeat", "what line am I on?"
```

#### Supplementary APIs
| API | Purpose |
|-----|---------|
| Google Places Autocomplete | Address disambiguation ("I want to go to that hospital near King's Cross") |
| Mapbox | Optional: visual map for partially sighted users |

---

### 2.4 NHS Portal Feature — APIs & Architecture

#### ⚠️ Critical Reality Check: NHS API Access

Integrating directly with NHS APIs is **complex and heavily regulated**:

| Requirement | Detail |
|-------------|--------|
| **NHS Login Integration** | OAuth2/OIDC — must apply via NHS onboarding portal |
| **Clinical Safety Assessment** | DCB0129 standard — required for any app accessing clinical data |
| **Data Security Assessment** | DSPT (Data Security and Protection Toolkit) |
| **Onboarding Timeline** | 3–6 months for approval |
| **IG Assessment** | Information Governance review |
| **developer.nhs.uk** | **Being decommissioned 2 March 2026!** — migrating to new platform |

#### Relevant NHS APIs
| API | Purpose | Access Level |
|-----|---------|-------------|
| **NHS Login** | Patient authentication (OAuth2/OIDC) | Must apply, ~46M users |
| **GP Connect (Patient Facing)** | Access GP records, appointments | Requires DSPT + clinical safety |
| **Electronic Prescription Service** | Request repeat prescriptions | Requires EPS integration |
| **NHS App API** | Send/receive messages | Application-restricted, requires onboarding |
| **Personal Demographics Service** | Patient identity | Restricted |

#### Practical Approach: Phased NHS Integration

**Phase 1 (MVP) — Enhanced WebView:**
```
- Embed NHS App website (https://www.nhsapp.service.nhs.uk/) in a WebView
- Overlay voice controls: read page content aloud, voice navigation between sections
- User authenticates via NHS Login within the WebView
- Use accessibility tree / DOM scraping to extract text content
- GPT summarises page content into spoken instructions
```

**Phase 2 — Direct API Integration:**
```
- Apply for NHS Login integration (start this on Day 1!)
- Implement OAuth2/OIDC flow natively
- GP Connect API for messages and records
- EPS API for prescriptions
- Full voice-driven native UI
```

This phased approach lets you **ship an MVP quickly** while the lengthy NHS onboarding process runs in parallel.

---

### 2.5 Full Tech Stack Summary

| Layer | Technology |
|-------|-----------|
| **Framework** | React Native + Expo (SDK 52+) |
| **Language** | TypeScript |
| **Navigation** | React Navigation v7 (with accessibility config) |
| **State Management** | Zustand (lightweight, simple) |
| **Speech-to-Text** | `expo-speech-recognition` (on-device) |
| **Text-to-Speech** | `expo-speech` (on-device) |
| **AI/NLU** | OpenAI GPT-4o-mini API (intent parsing, response generation) |
| **Transport Data** | TfL Unified API (Journey Planner) |
| **Location** | `expo-location` |
| **NHS Access (MVP)** | React Native WebView + voice overlay |
| **NHS Access (v2)** | NHS Login + GP Connect + EPS APIs |
| **Backend** | Node.js + Express (API proxy, keeps API keys server-side) |
| **Hosting** | Vercel or Railway (backend) |
| **Analytics** | Expo Analytics / PostHog (privacy-first) |
| **Error Tracking** | Sentry (Expo plugin) |
| **CI/CD** | EAS Build + EAS Submit |
| **Testing** | Jest + React Native Testing Library + Detox (E2E) |

---

## 3. Development Plan — 1 Senior Developer + AI Assistance

### Total Estimated Duration: **12–14 weeks** (MVP to App Store)

> **AI Assistance Impact:** Reduces development time by ~35-40%. Without AI, this would be ~20 weeks for one senior developer.

---

### Phase 0: Foundation & Setup (Week 1)

| Task | Days | Details |
|------|------|---------|
| Project setup (Expo, TypeScript, ESLint, Prettier) | 0.5 | AI generates boilerplate |
| CI/CD pipeline (EAS Build) | 0.5 | |
| Design system & accessibility foundations | 1 | High-contrast themes, large touch targets, semantic markup |
| Navigation structure (React Navigation) | 0.5 | Tab-based, minimal depth |
| Backend API proxy setup (Node.js) | 0.5 | Keeps API keys secure |
| **Start NHS onboarding application** | 0.5 | Do this NOW — it takes months |
| TfL API registration | 0.5 | Quick, same day approval |

**Deliverable:** Running app skeleton with navigation, CI/CD, backend proxy

---

### Phase 1: Voice Engine (Weeks 2–3)

| Task | Days | Details |
|------|------|---------|
| Integrate `expo-speech-recognition` (STT) | 1 | On-device speech recognition |
| Integrate `expo-speech` (TTS) | 0.5 | Text-to-speech with adjustable rate/pitch |
| Build VoiceContext provider | 1 | Global voice state management |
| OpenAI GPT integration for intent parsing | 1 | "Take me to Kings Cross" → `{destination: "King's Cross Station"}` |
| Voice command system (start/stop/cancel) | 1.5 | Wake word or tap-to-speak |
| Conversation flow manager | 2 | Multi-turn: "Where to?" → "King's Cross" → "Walk or tube?" → "Tube" |
| Voice feedback & haptics | 1 | Confirmation vibrations, audio cues |
| Accessibility audit #1 | 1 | VoiceOver + TalkBack testing |

**Deliverable:** Working voice engine — user can speak, app understands and responds

---

### Phase 2: Navigation Feature (Weeks 4–6)

| Task | Days | Details |
|------|------|---------|
| `expo-location` integration | 0.5 | Current position + permissions |
| TfL Journey Planner API integration | 2 | Query journeys, parse responses |
| Journey results → natural language conversion | 2 | GPT converts JSON steps to spoken English |
| Step-by-step voice guidance UI | 2 | "Step 1 of 5: Walk north on Baker Street for 200 metres" |
| Transport mode selection (voice) | 1 | "Bus, tube, or walking?" |
| Real-time journey updates | 1 | Re-query if user deviates |
| Favourite destinations | 1 | "Take me home", "Go to work" |
| Journey history | 0.5 | Recent destinations |
| High-contrast journey display | 1.5 | For partially sighted users — large text, bold colours |
| Testing & edge cases | 1.5 | Wrong addresses, no route found, API errors |
| Accessibility audit #2 | 1 | |

**Deliverable:** Complete voice-guided London navigation

---

### Phase 3: NHS Portal — MVP WebView (Weeks 7–9)

| Task | Days | Details |
|------|------|---------|
| React Native WebView integration | 1 | NHS App website embedded |
| Voice overlay system for WebView | 3 | Read page content, voice navigation |
| Page content extraction & summarisation | 2 | DOM → text → GPT summary → speech |
| Voice commands for NHS actions | 2 | "Read my messages", "Request prescription" |
| NHS Login flow handling in WebView | 1.5 | OAuth within WebView, session management |
| Error handling & offline messaging | 1 | Graceful degradation |
| Prescription request flow | 2 | Voice-guided multi-step form filling |
| Testing with real NHS accounts | 1.5 | |
| Accessibility audit #3 | 1 | |

**Deliverable:** Voice-controlled NHS portal access via enhanced WebView

---

### Phase 4: Polish & UX (Weeks 10–11)

| Task | Days | Details |
|------|------|---------|
| Onboarding flow (voice tutorial) | 2 | First-launch voice guide |
| Settings (speech rate, voice, contrast) | 1.5 | User preferences |
| Error handling & recovery | 1.5 | Network errors, GPS unavailable, API failures |
| Offline mode basics | 1 | Cached favourites, error messages |
| Performance optimisation | 1 | App launch time, voice response latency |
| Battery optimisation | 0.5 | GPS polling, background audio |
| Comprehensive voice command help | 0.5 | "What can I say?" |
| Sound design | 0.5 | Navigation chimes, confirmation sounds |
| UI/UX polish | 1.5 | |

**Deliverable:** Polished, production-ready app

---

### Phase 5: Testing & Launch (Weeks 12–14)

| Task | Days | Details |
|------|------|---------|
| End-to-end testing (Detox) | 2 | Automated test suite |
| User testing with visually impaired users | 3 | RNIB or local accessibility groups |
| Bug fixes from user testing | 3 | |
| App Store assets (screenshots, description) | 1 | Accessible app listing |
| App Store submission (iOS) | 0.5 | Via EAS Submit |
| Google Play submission (Android) | 0.5 | Via EAS Submit |
| App review response & fixes | 2 | Apple typically takes 1-3 days |
| Documentation | 1 | API docs, voice command reference |
| Analytics dashboard setup | 0.5 | Usage tracking |

**Deliverable:** App live on both stores

---

### Phase 6: Post-Launch / NHS Direct API (Weeks 15+)

| Task | Timeline | Details |
|------|----------|---------|
| NHS Login native integration | 2–3 weeks | Once onboarding is approved |
| GP Connect API (messages) | 2 weeks | Replace WebView for messages |
| EPS API (prescriptions) | 2 weeks | Replace WebView for prescriptions |
| OpenAI Realtime Voice API | 1-2 weeks | Natural conversational upgrade |
| Multi-city expansion | 2 weeks | Other UK cities with transport APIs |

---

## 4. Risk Register

| Risk | Impact | Mitigation |
|------|--------|------------|
| NHS API onboarding takes 6+ months | Can't access NHS data natively | WebView MVP approach works independently |
| NHS developer platform decommissioned (March 2026) | API endpoints change | Monitor NHS England communications, use abstraction layer |
| TfL API rate limits | Journey queries throttled | Cache common routes, implement retry logic |
| App Store rejection (accessibility compliance) | Launch delay | Follow WCAG 2.1 AA from day 1, test with real users early |
| OpenAI API costs at scale | High running costs | On-device STT/TTS for most operations, GPT only for NLU |
| Poor speech recognition in noisy environments | Bad UX | Support text input fallback, noise cancellation hints |

---

## 5. Cost Estimates (Monthly, Post-Launch)

| Service | Estimated Cost | Notes |
|---------|---------------|-------|
| OpenAI API (GPT-4o-mini) | £50-150/mo | ~10K users, ~5 queries/user/day |
| Backend hosting (Vercel/Railway) | £0-20/mo | Hobby tier sufficient initially |
| TfL API | Free | No cost |
| Apple Developer Program | £79/year | Required for App Store |
| Google Play Developer | £20 (one-time) | Required for Play Store |
| EAS Build (Expo) | £0-15/mo | Free tier likely sufficient |
| Sentry (error tracking) | £0/mo | Free tier |
| **Total** | **~£100-200/mo** | At modest scale |

---

## 6. Key Decisions Needed

1. **App name** — "Vision Ability" confirmed
2. **Minimum iOS version** — iOS 16+ recommended (for latest Speech APIs)
3. **Minimum Android version** — Android 10+ (API 29, for Speech APIs)
4. **OpenAI vs on-device only** — Hybrid recommended (on-device STT/TTS + OpenAI NLU)
5. **NHS WebView vs wait for API** — WebView MVP recommended
6. **Backend language** — Node.js (matches JS expertise) vs serverless (Vercel Edge Functions)

---

## 7. File Structure (Proposed)

```
vision-ability/
├── app/                          # Expo Router screens
│   ├── (tabs)/
│   │   ├── _layout.tsx           # Tab navigator (2 tabs)
│   │   ├── navigate.tsx          # Navigation screen
│   │   └── nhs.tsx               # NHS Portal screen
│   ├── _layout.tsx               # Root layout
│   ├── onboarding.tsx            # First-launch tutorial
│   └── settings.tsx              # App settings
├── components/
│   ├── ui/                       # Reusable UI components
│   │   ├── BigButton.tsx         # Large, accessible button
│   │   ├── VoiceIndicator.tsx    # Listening/speaking animation
│   │   └── HighContrastText.tsx  # Accessible text component
│   ├── navigation/
│   │   ├── JourneySteps.tsx      # Step-by-step journey display
│   │   └── TransportModePicker.tsx
│   └── nhs/
│       ├── NHSWebView.tsx        # Enhanced WebView
│       └── VoiceOverlay.tsx      # Voice controls over WebView
├── services/
│   ├── voice/
│   │   ├── SpeechRecognition.ts  # STT wrapper
│   │   ├── TextToSpeech.ts       # TTS wrapper
│   │   └── VoiceCommandParser.ts # Intent recognition
│   ├── api/
│   │   ├── tfl.ts                # TfL Journey Planner
│   │   ├── openai.ts             # GPT integration
│   │   └── nhs.ts                # NHS API (future)
│   └── location/
│       └── LocationService.ts    # GPS wrapper
├── stores/
│   ├── voiceStore.ts             # Voice state (Zustand)
│   ├── journeyStore.ts           # Journey state
│   └── settingsStore.ts          # User preferences
├── hooks/
│   ├── useVoice.ts               # Voice interaction hook
│   ├── useJourney.ts             # Journey planning hook
│   └── useAccessibility.ts       # Accessibility utilities
├── constants/
│   ├── theme.ts                  # Colours, spacing, fonts
│   └── voiceCommands.ts          # Command definitions
├── backend/                      # API proxy server
│   ├── server.ts
│   └── routes/
│       ├── journey.ts
│       └── openai.ts
├── app.json                      # Expo config
├── tsconfig.json
└── package.json
```
