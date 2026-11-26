# Cloudflare Pages deployment

SochoZara Studio is a Vite application deployed on Cloudflare Pages. Editing, preview and MP4 rendering run in the visitor's browser. Gemini story generation and narration run through Cloudflare Pages Functions, which use an encrypted server-side secret. No D1 database, R2 bucket or separate Worker service is required.

## Production address

- Production URL: `https://videomaker-1mz.pages.dev/`
- GitHub repository: `narayananagapuri25/VideoMaker`
- Release branch: `main`

The production secret must be configured on the exact Pages project serving the production hostname above. After every secret change, deploy a new production build from `main`, then verify `/api/ai/status` returns `configured: true`. A different Pages project connected to the same repository has an independent Functions environment and secret configuration.

The Pages project is expected to deploy from `main`. Confirm the production branch and build configuration in **Cloudflare Dashboard → Workers & Pages → the Pages project serving this production URL → Settings → Builds**; this repository cannot read account-level Cloudflare settings.

## One-time Gemini API setup

The Studio no longer asks creators to paste a Gemini key into the browser. Configure it once as an encrypted Cloudflare Pages secret:

1. Create or select a Gemini API key in [Google AI Studio](https://aistudio.google.com/apikey).
2. Open **Cloudflare Dashboard → Workers & Pages → the Pages project serving `https://videomaker-1mz.pages.dev` → Settings → Variables and Secrets**.
3. In the **Production** environment, choose **Add** and select **Secret** (not a plain-text variable).
4. Set the name to `GEMINI_API_KEY` and paste the key into the secret value field.
5. Save the secret, then trigger a new production deployment of `main`.
6. Open the Studio and press **Test secure Gemini connection**. The status should show **SERVER KEY CONFIGURED** and the test should report a successful connection.

For preview deployments, add the same secret separately to the **Preview** environment when you need to test a preview URL. Production secrets and preview secrets are configured independently.

**Never commit the key to GitHub, put it in `.env` files, paste it into chat, or enter it into the Studio page.** The browser calls same-origin `/api/ai/*` routes; only the Pages Function reads `env.GEMINI_API_KEY`. The key is not returned in API responses or included in the client bundle.

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
