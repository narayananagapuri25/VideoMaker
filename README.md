# SochoZara Studio

A zero-cost-first, browser-based AI-assisted video creator for YouTube Shorts, Instagram Reels and longer documentaries.

## First release

- Topic-to-script workspace with editable Hinglish defaults.
- Scene storyboard with per-scene narration, on-screen text and visual prompts.
- Local image/audio uploads; no server upload required.
- Animated preview rendered in the browser.
- Subtitle generation from the script.
- Browser-side video export with no paid rendering API.
- Project persistence in browser storage.
- Clear notices for AI provider quotas and commercial-use licensing.

## Cost and privacy principles

- Core editor must work without API keys or subscriptions.
- Do not silently call paid APIs or trigger billable usage.
- User media stays in the browser unless an explicitly chosen external provider requires upload.
- AI-generated media and imported stock assets must have their licence checked by the creator.
- The application must not promise unlimited free AI generation.

## Development

```bash
npm install
npm run dev
npm run build
npm run test
```

## Architecture

React + TypeScript + Vite. The first version uses browser-native Canvas and MediaRecorder for a dependable local export path. Browser support and output format are detected at runtime; an MP4-capable export adapter can be added without changing the editing workflow.

## Status

Initial repository bootstrap. See the project issues/README updates for the staged roadmap.
