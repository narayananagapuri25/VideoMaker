# Cloudflare Pages deployment

SochoZara Studio is a Vite application deployed on Cloudflare Pages. Editing, preview and video rendering run in the visitor's browser. Gemini story generation and narration run through same-origin Cloudflare Pages Functions. The Functions accept either a per-tab API key entered in the Studio or the optional encrypted `GEMINI_API_KEY` server secret. No D1 database, R2 bucket or separate Worker service is required.

## Production address

- Production URL: `https://videomaker-1mz.pages.dev/`
- GitHub repository: `narayananagapuri25/VideoMaker`
- Release branch: `main`

The production secret must be configured on the exact Pages project serving the production hostname above. After every secret change, deploy a new production build from `main`, then verify `/api/ai/status` returns `configured: true`. A different Pages project connected to the same repository has an independent Functions environment and secret configuration.

The Pages project is expected to deploy from `main`. Confirm the production branch and build configuration in **Cloudflare Dashboard → Workers & Pages → the Pages project serving this production URL → Settings → Builds**; this repository cannot read account-level Cloudflare settings.

## Cloudflare Workers AI (daily free allocation)

Cloudflare Workers AI can generate the storyboard with `@cf/google/gemma-4-26b-a4b-it` and scene-specific artwork with `@cf/black-forest-labs/flux-1-schnell`. The Workers Free plan includes 10,000 Neurons per day, resetting at 00:00 UTC. Requests beyond that allocation fail on Workers Free. Workers Paid accounts can incur charges above the daily allowance, so select this option only when the Cloudflare account is on the Workers Free plan and paid overage is not enabled.

### Add the required Pages binding

1. Open **Cloudflare Dashboard → Workers & Pages → the Pages project serving `https://videomaker-1mz.pages.dev` → Settings**.
2. Choose the **Production** environment (and Preview separately only if you test preview deployments).
3. Open **Bindings → Add → Workers AI**.
4. Set **Variable name** to exactly `AI` and save.
5. Redeploy the Pages project so the binding is available to its Functions.
6. Open SochoZara Studio, select **Cloudflare Workers AI**, and confirm the Workers Free-only checkbox.

The binding is accessed server-side as `env.AI`. No Cloudflare API token or account ID is entered into the Studio. If the binding is missing, the app returns a clear setup error instead of switching to another provider.

### Automatic voice-over and subtitle placement

- English scripts use Cloudflare-hosted Deepgram Aura-1 (`@cf/deepgram/aura-1`) through the same `AI` binding.
- Aura-1 costs 1,363.64 Neurons per 1,000 input characters in the Workers AI pricing table. Its usage shares the same 10,000-Neuron daily Free allocation with Gemma and FLUX.
- The integrated Aura-1 route is intentionally limited to English. The deprecated MeloTTS model is not used. For Hindi, Telugu and Hinglish, the app does not silently switch providers; it renders subtitles and soundtrack without synthetic speech.
- Subtitles use the spoken narration, wrap into two-line timed cues, appear centered horizontally and stay within a lower-third safe area with a high-contrast backing.

### Export quality and motion

- MP4 export is 1080p at 30 FPS (9:16 vertical is 1080 × 1920; 16:9 landscape is 1920 × 1080).
- AI still images use different camera moves (push-in, pull-back, horizontal/vertical drift and restrained rotation) rather than the same fixed zoom on every scene.
- Consecutive scenes cross-fade over the final 0.65 seconds of the outgoing scene; the live preview uses the same transition path as export.
- Browser-side rendering and encoding remain local to the device. Longer high-resolution exports use more phone memory; shorter projects are safer on lower-memory phones.
### Free real moving footage (no key, no payment)
### Free real moving footage (no key, no payment)

- The app can search the NASA Image and Video Library through its public API. This API route requires no API key, paid plan, provider credit or card.
- During generation, up to three scenes that match NASA archive topics can receive real MP4 footage. Clips are muted, streamed through a same-origin Pages Function, and credited as `FOOTAGE: NASA` in the rendered scene.
- NASA footage is optional. If the archive has no relevant clip, the scene keeps its FLUX artwork and local camera animation. If a selected NASA clip fails to load, export falls back to the generated artwork rather than failing the whole video.
- The route screens out results that explicitly flag third-party copyright and descriptions that identify astronauts/people. NASA's own media guidelines still apply: NASA content is generally available for educational/informational use, but third-party content and identifiable-person rights may require separate permission. Do not use NASA material to imply endorsement or in promotional content.
- The NASA archive provides real camera footage, mission recordings and science visualisations; it is not generated footage. The app does not call Hailuo, Runway, Kling, Pika, Replicate, Magic Hour or any other paid text-to-video API.

### What this provider generates

- Gemma creates the script and storyboard.
- FLUX.1 schnell generates one topic-specific still image per scene, sequentially, while the selected provider remains Cloudflare.
- Matching NASA archive clips can supply real moving footage for up to three relevant scenes at no API charge; otherwise the browser animates FLUX stills with local camera motion.
- The final MP4 combines any selected NASA footage, generated still artwork, subtitles, transitions and local narration. This is not an AI text-to-video model. The NASA API is separate from Workers AI and does not consume Neurons.

Cloudflare Pages requires the Workers AI binding to be configured in the dashboard for Pages Functions. See the official [Pages bindings guide](https://developers.cloudflare.com/pages/functions/bindings/) and [Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/).
## Gemini API setup

### Use a key in the Studio for this browser tab

1. Open SochoZara Studio and expand **Gemini AI connection** in the Start with an idea panel.
2. Create or copy an API key from [Google AI Studio](https://aistudio.google.com/apikey).
3. Paste the key into **Google AI Studio API key** and select **Save key for this tab**.
4. Select **Test Gemini connection**. Once the test succeeds, use **Generate story & scenes** or **Generate entire video with AI**.

The key is stored in this browser tab's `sessionStorage`; it survives refreshes in that tab and is removed when the tab session ends. It is not included in project backups, IndexedDB, GitHub or the app's source bundle. For Gemini calls, the browser sends it in a custom HTTPS request header to the same-origin Pages Function, which forwards it to Google. This is convenient but is not a password vault: JavaScript running on this site can access `sessionStorage`. Use this only in a trusted browser on a device you control. Never paste the key into chat or a video topic.

### Optional encrypted Cloudflare secret

For a central server-managed key instead of a per-tab key, configure `GEMINI_API_KEY` once as an encrypted Cloudflare Pages secret:

1. Create or select a Gemini API key in [Google AI Studio](https://aistudio.google.com/apikey).
2. Open **Cloudflare Dashboard → Workers & Pages → the Pages project serving `https://videomaker-1mz.pages.dev` → Settings → Variables and Secrets**.
3. In the **Production** environment, choose **Add** and select **Secret** (not a plain-text variable).
4. Set the name to `GEMINI_API_KEY` and paste the key into the secret value field.
5. Save the secret, then trigger a new production deployment of `main`.
6. Open the Studio and press **Test secure Gemini connection**. The status should show **SERVER KEY CONFIGURED** and the test should report a successful connection.

For preview deployments, add the same secret separately to the **Preview** environment when you need to test a preview URL. Production secrets and preview secrets are configured independently.

Never commit the key to GitHub, put it in `.env` files, or paste it into chat. A tab-session key is sent only in an HTTPS request header to the same-origin `/api/ai/*` route and is not echoed in responses. A server-managed key remains in `env.GEMINI_API_KEY` and is not included in the client bundle. When both are present, the explicitly saved tab key is used for that tab's requests.

The AI routes are public website endpoints. Add a Cloudflare rate-limiting rule for `/api/ai/*` (for example, a modest per-IP limit such as 10 requests per minute, adjusted for normal use). This helps protect the Gemini quota from automated abuse. If the Studio is intended only for private use, consider protecting the site with Cloudflare Access as well.

A successful status check confirms that the encrypted secret exists. **Test secure Gemini connection** additionally checks that the key can reach the configured text model. Story generation and Gemini TTS still depend on model availability, project quota and Google account/API terms.

## Build configuration

| Setting | Value |
| --- | --- |
| Framework preset | Vite |
| Production branch | `main` |
| Root directory | `/` |
| Build command | `npm ci --no-audit --no-fund && npm run build` |
| Build output directory | `dist` |
| Node.js version | `22` |

Cloudflare Pages Git integration can deploy automatically on commits to the configured production branch and provides preview URLs for non-production branches. See the official [Git integration guide](https://developers.cloudflare.com/pages/configuration/git-integration/) and [GitHub integration guide](https://developers.cloudflare.com/pages/configuration/git-integration/github-integration/).

## Release and verification checklist

1. Review the pull request and require its GitHub CI check to pass.
2. Merge the approved pull request into `main`.
3. Confirm Cloudflare Pages has built and deployed the exact merge commit.
4. Open the production URL on desktop Chrome/Edge and Android Chrome.
5. Verify the app loads, an existing IndexedDB project restores, edits persist after refresh, backup export/import works, and the offline shell loads after one successful online visit.
6. Test microphone permission on HTTPS, narration upload, and an actual short MP4 export with audio.
7. Play the resulting MP4 in a separate player and verify sound, duration, aspect ratio and scene transitions.

A green GitHub CI run validates unit tests, dependency advisories, the production build and an HTTP smoke test of the built app shell, bundled assets, PWA metadata and static Pages headers. It does **not** validate microphone permissions, device codec support, MP4 encoding on real devices, or Cloudflare deployment completion.

## Runtime and privacy notes

- Project scripts, imported images, recordings and MP4 rendering remain in the browser. The application does not upload these assets to its own server.
- IndexedDB is browser/device-local. Use **Backup** regularly; clearing site data or changing devices can remove local projects.
- Gemini story and narration are proxied through Cloudflare Pages Functions. The `GEMINI_API_KEY` is an encrypted Pages secret and is never sent to the browser.
- Google's free-tier data-use and retention terms can differ from paid-tier terms. Never send private or sensitive information.
- TTSMaker is an external manual workflow. Text is sent to that service only when the creator pastes it into its website.
- Imported artwork is treated as unverified on this device and requires a fresh commercial-use rights confirmation before export.
- Browser-side MP4 export requires compatible WebCodecs video and audio encoders. Test a short project before attempting a long export.
