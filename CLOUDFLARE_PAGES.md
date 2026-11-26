# Cloudflare Pages deployment

SochoZara Studio is a static Vite application. Editing, preview and MP4 rendering run in the visitor's browser. The application does not require a Worker, D1 database, R2 bucket or server-side rendering.

## Production address

- Production URL: `https://videomaker-1mz.pages.dev/`
- GitHub repository: `narayananagapuri25/VideoMaker`
- Release branch: `main`

The Pages project is expected to deploy from `main`. Confirm the production branch and build configuration in **Cloudflare Dashboard → Workers & Pages → sochozara-studio → Settings → Builds**; this repository cannot read account-level Cloudflare settings.

## Build configuration

| Setting | Value |
| --- | --- |
| Framework preset | Vite |
| Production branch | `main` |
| Root directory | `/` |
| Build command | `npm install && npm run build` |
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

A green GitHub CI run validates unit tests, dependency advisories and a production build. It does **not** validate microphone permissions, media codec support, MP4 encoding on real devices, or Cloudflare deployment completion.

## Runtime and privacy notes

- Project scripts, imported images, recordings and MP4 rendering remain in the browser. The application does not upload these assets to its own server.
- IndexedDB is browser/device-local. Use **Backup** regularly; clearing site data or changing devices can remove local projects.
- The optional Gemini integration sends the topic or narration to Google's API using the API key entered in the page. The key is held in memory only and is not written to IndexedDB.
- Google's free-tier data-use and retention terms can differ from paid-tier terms. Never send private or sensitive information.
- TTSMaker is an external manual workflow. Text is sent to that service only when the creator pastes it into its website.
- Imported artwork is treated as unverified on this device and requires a fresh commercial-use rights confirmation before export.
- Browser-side MP4 export requires compatible WebCodecs video and audio encoders. Test a short project before attempting a long export.
