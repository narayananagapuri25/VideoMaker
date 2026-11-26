# SochoZara Studio

A zero-cost-first, browser-based creator studio for original YouTube Shorts, Instagram Reels and longer documentary videos.

The browser-first studio is designed for a creator workflow: enter a topic, build a Hinglish story and storyboard, add your own scene artwork and narration, preview the motion treatment, then render an MP4 locally in the browser.

## Studio capabilities

- Responsive React + TypeScript video studio, installable as an Android-friendly PWA with a small offline app shell.
- Hinglish, Hindi, English and Telugu project settings.
- Offline starter scripts and scene plans.
- Channel launch kit with SochoZara positioning, channel descriptions, logo and banner direction, a publishing rhythm and a practical quality checklist.
- Searchable library of 30 Hinglish-ready video topics that can be loaded directly into the editor.
- Reusable AI prompt templates for Shorts, long-form explainers, fact-check planning and motion storyboards.
- Optional Gemini 3.8 Flash story/storyboard generation using a user-provided API key.
- Scene-by-scene editing for titles, narration, captions, prompts and durations.
- A live playback timeline with play/pause, scrubbing, scene segments and narration sync.
- Generate a scene-specific art prompt and open Adobe Firefly or Pexels; import a generated or licensed image for each scene.
- Record the asset source and confirm intended commercial-use rights before MP4 export.
- Generate AI narration using Gemini 3.8 Flash TTS (limited free tier) and select from built-in voices.
- Upload narration audio or record a voice track from the microphone.
- Free TTSMaker handoff: copy the current script, open its no-signup web voice tool, select a voice and speed, preview and download MP3, then upload the file back into the local project. TTSMaker has no public API, so this flow is intentionally user-driven and never automates the external service.
- Device speech synthesis for listening to a draft; this preview is not captured in the exported video.
- Animated SochoZara preview with motion graphics and captions.
- Browser-side H.264 MP4 rendering using WebCodecs and Mediabunny.
- Local project saving with IndexedDB.
- Export progress and MP4 download.
- Portable JSON project backup/import, including imported scene artwork and narration audio. Import accepts embedded raster images/audio only, checks media size limits and rejects remote media URLs.
- CI workflow for unit tests and production builds.

## Important current limitations

- AI image generation is not performed through a paid API by the editor. The editor builds a full scene prompt, opens Firefly for manual one-scene-at-a-time generation, and imports the resulting image. Firefly Free offers limited daily generations; Google Gemini image-generation API models currently have no free API tier.
- Optional Gemini TTS uses a user-provided API key and only works while the selected model is available to that key's free tier. Billing/quota availability can change; do not submit private information. TTS requests use the Interactions API with `store: false` (stateless request mode); free-tier content may still be used by Google to improve its products. Quotas and access may change. Use a key with billing disabled and do not submit sensitive information. Device speech is only a preview.
- The Gemini API key is held in memory only. The app selects the Gemini 3.8 Flash model, but it cannot inspect the Google account's billing settings. Use a key with billing disabled and check current free-tier limits before each use. Free-tier prompt data may be used by Google to improve its products.
- MP4 export depends on the browser exposing compatible WebCodecs H.264 and AAC encoders. The app does not upload media to a server.
- The renderer uses a 720p canvas output to reduce device memory pressure. Longer exports are best performed on a desktop or recent high-performance device.
- The live timeline preview is a browser Canvas playback view; the MP4 renderer creates the final encoded file.
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

Production source branch: `main`.

CI runs dependency-advisory checks, unit tests, a TypeScript/Vite production build and an HTTP smoke test of the built production preview. Cloudflare deployment identity and real Android microphone/MP4 codec behaviour still require release testing outside GitHub Actions.
