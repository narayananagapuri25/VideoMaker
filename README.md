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
- Optional Gemini 4 Hydrogen story/storyboard generation through the Interactions API using a user-provided API key; requests are stateless (`store: false`) and structured as validated JSON.
- Scene-by-scene editing for titles, narration, captions, prompts, durations and real video footage.
- Search Pixabay stock footage from each scene, preview the clip and attach it to the storyboard. Import local MP4/WebM clips as an alternative.
- A live canvas playback timeline that plays the selected scene's actual video footage, with play/pause, scrubbing, scene segments and narration sync.
- Generate a scene-specific art prompt and open Adobe Firefly or Pexels; import a generated or licensed image for each scene.
- Record the asset source and confirm intended commercial-use rights before MP4 export.
- Generate AI narration using Gemini 3.8 Flash TTS (limited free tier) and select from built-in voices.
- Upload narration audio or record a voice track from the microphone.
- Free TTSMaker handoff: copy the current script, open its no-signup web voice tool, select a voice and speed, preview and download MP3, then upload the file back into the local project. TTSMaker has no public API, so this flow is intentionally user-driven and never automates the external service.
- Device speech synthesis for listening to a draft; this preview is not captured in the exported video.
- Browser-side H.264 MP4 rendering using WebCodecs and Mediabunny. Each scene must have a real video clip and the project must have narration audio; the renderer refuses silent graphic-only exports.
- Scene footage is composited with SochoZara titles, captions and optional Pixabay contributor attribution.
- Local project saving with IndexedDB.
- Export progress and MP4 download.
- Portable JSON project backup/import, including imported scene artwork and narration audio. Import accepts embedded raster images/audio only, checks media size limits and rejects remote media URLs.
- CI workflow for unit tests and production builds.

## Important current limitations

- AI image generation is not performed through a paid API by the editor. The editor builds a full scene prompt, opens Firefly for manual one-scene-at-a-time generation, and imports the resulting image. Firefly Free offers limited daily generations; Google Gemini image-generation API models currently have no free API tier.
- Optional Gemini TTS uses a user-provided API key and only works while the selected model is available to that key's free tier. Billing/quota availability can change; do not submit private information. TTS requests use the Interactions API with `store: false` (stateless request mode); free-tier content may still be used by Google to improve its products. Quotas and access may change. Use a key with billing disabled and do not submit sensitive information. Device speech is only a preview.
- The Gemini API key is held in memory only. Story generation uses Gemini 4 Hydrogen through the Interactions API; narration uses Gemini 3.8 Flash TTS. The app cannot inspect the Google account's billing settings. Check the current key/project tier and quota before use. Do not submit sensitive information.
- MP4 export depends on the browser exposing compatible WebCodecs H.264 and AAC encoders. Video export runs at playback speed to keep source footage and narration in sync; keep the tab open during export.
- The renderer uses a 720p canvas output to reduce device memory pressure. Long projects and several local clips are best handled on a desktop or recent high-performance device.
- Pixabay search and video streaming are served through Cloudflare Pages Functions. The Pixabay key is stored as an encrypted Cloudflare Pages secret and is never sent to the browser.
- Generated scripts are drafts, not verified research. Check factual claims and add credible sources before publishing.

## Cost and privacy principles

- The editor, preview and local MP4 rendering do not require subscriptions or paid rendering APIs.
- No paid provider is silently invoked.
- User images, audio and project data stay in the browser's IndexedDB.
- The optional Gemini API request sends the topic and prompt to Google. Do not submit private or sensitive information.
- Imported or generated media must be checked for commercial-use rights by the creator.
- The app does not promise unlimited free AI generation.

## Enable Pixabay stock footage

1. Create or sign in to a Pixabay account and request a Developer API key at [Pixabay API](https://pixabay.com/api/docs/).
2. In Cloudflare Dashboard, open **Workers & Pages → VideoMaker Pages project → Settings → Variables and Secrets**.
3. Add an encrypted secret named `PIXABAY_API_KEY` with the key value. Add it to both Production and Preview environments if you use both.
4. Redeploy the latest `main` branch. The scene editor will then search Pixabay through `/api/stock/videos` without exposing the key in the browser.
5. If you do not configure the secret, the editor still supports importing local MP4 or WebM scene clips.

Pixabay's API documentation requires attribution/source links alongside API search results and asks developers to cache queries for 24 hours. The editor displays contributor/source links in search results and adds a small contributor credit to the rendered scene. Review the [Pixabay Content License](https://pixabay.com/service/license-summary/), especially for recognisable people, trademarks and property.

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
- Canvas composition for video frames, titles, captions and motion graphics.
- Mediabunny for MP4 muxing and browser-native WebCodecs encoders.
- Optional direct Gemini API call from the browser; the Gemini API key is held in memory only.
- Cloudflare Pages Functions proxy for Pixabay API key protection and MP4 streaming.

## Licensing

The application source is MIT licensed. Mediabunny is a separately licensed MPL-2.0 dependency. See [ATTRIBUTIONS.md](./ATTRIBUTIONS.md).

## Status

Production source branch: `main`.

CI runs dependency-advisory checks, unit tests, a TypeScript/Vite production build and an HTTP smoke test of the built production preview. Cloudflare deployment identity and real Android microphone/MP4 codec behaviour still require release testing outside GitHub Actions.
