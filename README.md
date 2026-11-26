# SochoZara Studio

A zero-cost-first, browser-based creator studio for original YouTube Shorts, Instagram Reels and longer documentary videos.

The first milestone is designed for a single creator: enter a topic, build a Hinglish story and storyboard, add your own scene artwork and narration, preview the motion treatment, then render an MP4 locally in the browser.

## Current MVP capabilities

- Responsive React + TypeScript video studio.
- Hinglish, Hindi, English and Telugu project settings.
- Offline starter scripts and scene plans.
- Optional Gemini 3.8 Flash story/storyboard generation using a user-provided API key.
- Scene-by-scene editing for titles, narration, captions, prompts and durations.
- Upload a local image for each scene.
- Generate AI narration using Gemini 3.8 Flash TTS (limited free tier) and select from built-in voices.
- Upload narration audio or record a voice track from the microphone.
- Device speech synthesis for listening to a draft; this preview is not captured in the exported video.
- Animated SochoZara preview with motion graphics and captions.
- Browser-side H.264 MP4 rendering using WebCodecs and Mediabunny.
- Local project saving with IndexedDB.
- Export progress and MP4 download.
- Portable JSON project backup/import, including imported scene artwork and narration audio.
- CI workflow for unit tests and production builds.

## Important current limitations

- AI image/video generation is not called automatically. Create visuals in a separately licensed tool and import them into scenes.
- AI narration uses the optional Gemini 3.8 Flash TTS endpoint and a user-provided API key. Google's current pricing page lists free-tier text and audio generation for this model, but quotas/access may change; free-tier content may be used to improve Google products. Use a key with billing disabled. Free tier is limited, may use submitted content to improve Google products, and is not guaranteed to remain available. Keep billing disabled for a zero-cost workflow. Device speech is only a preview.
- The Gemini API key is held in memory only. The app selects the Gemini 3.8 Flash model, but it cannot inspect the Google account's billing settings. Use a key with billing disabled and check current free-tier limits before each use. Free-tier prompt data may be used by Google to improve its products.
- MP4 export depends on the browser exposing compatible WebCodecs H.264 and AAC encoders. The app does not upload media to a server.
- The first renderer uses a 720p canvas output to reduce device memory pressure. Longer exports are best performed on a desktop or recent high-performance device.
- Generated scripts are drafts, not verified research. Check factual claims and add credible sources before publishing.

## Cost and privacy principles

- The editor, preview and local MP4 rendering do not require subscriptions or paid rendering APIs.
- No paid provider is silently invoked.
- User images, audio and project data stay in the browser's IndexedDB.
- The optional Gemini API request sends the topic and prompt to Google. Do not submit private or sensitive information.
- Imported or generated media must be checked for commercial-use rights by the creator.
- The app does not promise unlimited free AI generation.

## Development

\`\`\`bash
npm install
npm run dev
npm run test
npm run build
\`\`\`

## Architecture

- React 19 + TypeScript + Vite.
- IndexedDB for local project persistence.
- Canvas rendering for motion graphics.
- Mediabunny for MP4 muxing and browser-native WebCodecs encoders.
- Optional direct Gemini API call from the browser; no API key is bundled or committed.

## Licensing

The application source is MIT licensed. Mediabunny is a separately licensed MPL-2.0 dependency. See [ATTRIBUTIONS.md](./ATTRIBUTIONS.md).

## Status

MVP development branch: \`feat/sochozara-studio-mvp\`.
