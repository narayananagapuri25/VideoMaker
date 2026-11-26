# SochoZara Studio

A zero-cost-first, browser-based creator studio for original YouTube Shorts, Instagram Reels and longer documentary videos.

The browser-first studio is designed for a creator workflow: enter a topic, build an English story and storyboard, add your own scene artwork and narration, preview the motion treatment, then render an MP4 locally in the browser.

## Studio capabilities

- Responsive React + TypeScript video studio, installable as an Android-friendly PWA with a small offline app shell.
- English-first project settings, with Hinglish, Hindi and Telugu also available.
- Offline starter scripts and scene plans.
- Channel launch kit with SochoZara positioning, channel descriptions, logo and banner direction, a publishing rhythm and a practical quality checklist.
- Searchable library of 30 Hinglish-ready video topics that can be loaded directly into the editor.
- Reusable AI prompt templates for Shorts, long-form explainers, fact-check planning and motion storyboards.
- Gemini AI director: turns a question into a complete story, scene-by-scene narration and structured visual plans (charts, candlesticks, dashboards, comparisons, timelines, diagrams and infographics) through the Interactions API.
- One-click video workflow: generate the AI story, generate English narration with Gemini TTS, direct every scene and render the complete MP4 locally.
- Scene-by-scene editing for titles, narration, captions, prompts, durations and visual direction.
- Built-in, on-device motion-video generation: create a complete MP4 from the storyboard without importing video clips or using an external video-generation service.
- Topic-aware animated graphics, slow camera moves, slow camera pan/zoom, atmospheric effects, scene titles, captions and timeline progress are rendered locally into the MP4.
- Search Pixabay stock footage from each scene, preview the clip and attach it to the storyboard. Import local MP4/WebM clips as an alternative.
- A live canvas playback timeline that animates the selected scene's artwork or topic-based motion graphics, and plays optional imported footage, with play/pause, scrubbing, scene segments and narration sync.
- Generate a scene-specific art prompt and open Adobe Firefly or Pexels; import a generated or licensed image for each scene.
- Record the asset source and confirm intended commercial-use rights before MP4 export.
- Generate and save narration in-house with Gemini 3.8 Flash TTS, with selectable built-in voices and an English (India) documentary delivery preset. Generated WAV audio is embedded in the final MP4.
- Upload narration audio or record a voice track from the microphone.
- Device speech synthesis for listening to a draft; this preview is not captured in the exported video.
- Browser-side H.264 MP4 rendering using WebCodecs and Mediabunny. Every scene is animated in-house; imported video footage is optional. Narration audio is included when supplied.
- Optional stock/local footage is composited with SochoZara titles, captions and contributor attribution.
- Local project saving with IndexedDB.
- Export progress and MP4 download.
- Portable JSON project backup/import, including imported scene artwork, video clips and narration audio. Import validates embedded media, enforces size limits and rejects remote media URLs.
- CI workflow for unit tests and production builds.

## AI director and free in-house video generation

Enter a question such as **How does the stock market work?** and choose **Generate entire video with AI**. With a Gemini API key, the studio creates a new English story, scene-specific narration and a structured visual plan for every scene, then generates the narration and assembles the MP4 locally. The AI director selects among layouts such as animated candlestick charts, line charts, financial dashboards, process flows, comparisons, timelines, diagrams and infographics. The renderer uses the same scene plan for the live preview and exported video. No scene-by-scene prompt copying or clip importing is required.

The in-house renderer creates 24 fps H.264 MP4 output using Canvas and WebCodecs. Topic-aware artwork, camera movement, scene entry fades, moving accents, titles and captions are rendered on the device. Stock-market charts use illustrative shapes and are explicitly marked as not-live data; the app does not make up current share prices or returns. A specialised offline stock-market explainer is available without a Gemini key, but AI-written scripts and generated English narration require a Google AI Studio API key and are subject to that project's live model access and quota.

This is an AI-directed motion-graphics studio, not a photorealistic diffusion-model video service: it does not synthesize live-action footage like a hosted Veo or self-hosted Wan/LTX video model. It works without paid video API credits, a Flow account, an external rendering queue or a dedicated GPU server. Users can optionally add licensed photos or footage to scenes when realistic imagery is needed.

## Important current limitations

- AI image generation is not performed through a paid API by the editor. The editor builds a full scene prompt, opens Firefly for manual one-scene-at-a-time generation, and imports the resulting image. Firefly Free offers limited daily generations; Google Gemini image-generation API models currently have no free API tier.
- Gemini TTS uses a user-provided API key and only works while the selected model is available to that key's free tier. Billing/quota availability can change; do not submit private information. TTS requests use the Interactions API with `store: false` (stateless request mode); free-tier content may still be used by Google to improve its products. Quotas and access may change. Use a key with billing disabled and do not submit sensitive information. Device speech is only a preview.
- The Gemini API key is held in memory only. Story generation uses Gemini 4 Hydrogen through the Interactions API; narration uses Gemini 3.8 Flash TTS through the Interactions API with stateless requests. The app cannot inspect the Google account's billing settings. Check the current key/project tier and quota before use. Do not submit sensitive information.
- In-house MP4 generation depends on the browser exposing compatible WebCodecs H.264 and AAC encoders. Rendering runs at playback speed to keep footage and narration in sync; keep the tab open during generation. The built-in generator creates motion graphics and animated artwork, not photorealistic AI video.
- The renderer uses a 720p canvas output to reduce device memory pressure. Long projects and several local clips are best handled on a desktop or recent high-performance device. Local imported clips are subject to the current 24 MB per-clip and 64 MB aggregate project-media caps.
- Pixabay search and video streaming are served through Cloudflare Pages Functions. The Pixabay key is stored as an encrypted Cloudflare Pages secret and is never sent to the browser.
- Generated scripts are drafts, not verified research. Check factual claims and add credible sources before publishing.

## Cost and privacy principles

- The in-house motion-video generator, preview and local MP4 rendering do not require subscriptions or paid video-generation APIs.
- No paid provider is silently invoked.
- User images, audio and project data stay in the browser's IndexedDB.
- Gemini story and TTS requests send the topic, prompt or narration text to Google. Do not submit private or sensitive information.
- Imported or generated media must be checked for commercial-use rights by the creator.
- The in-house motion renderer has no generation-credit quota; optional Gemini narration/story requests and Pixabay search remain subject to their providers' current access, terms and quotas.

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
