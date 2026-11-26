# Cloudflare Pages deployment

SochoZara Studio is a static Vite application. Video previews and MP4 rendering run in the visitor's browser. The site does not need a Worker, D1 database, R2 bucket or server-side rendering service.

## Connect the repository

Use Cloudflare Pages' native Git integration. It creates a preview for the feature branch and updates the pull request with deployment information, while keeping `main` as the production branch.

1. Open the Cloudflare dashboard and go to **Workers & Pages**.
2. Choose **Create application → Pages → Connect to Git**.
3. Select GitHub and choose the account that owns `narayananagapuri25/VideoMaker`.
4. Install the **Cloudflare Workers & Pages** GitHub App and grant access to this repository. Cloudflare may also ask you to authorise the GitHub app as your user; installation and authorisation are separate steps.
5. Select `narayananagapuri25/VideoMaker` and configure the settings below.
6. Enable preview deployments for the feature branch `feat/sochozara-studio-mvp`.

**Important:** Cloudflare documents that a Pages project created with Git integration cannot later be switched to Direct Upload. Keep Git integration for this project so branch previews and pull-request deployment status remain available.

## Pages project settings

| Setting | Value |
| --- | --- |
| Project name | `sochozara-studio` (or another available name) |
| Framework preset | Vite |
| Production branch | `main` |
| Preview branch | `feat/sochozara-studio-mvp` |
| Root directory | `/` (repository root) |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Node.js version | `22` |

Set `NODE_VERSION=22` if Cloudflare asks for a Node.js version environment variable. No Cloudflare API token or GitHub Actions deployment secret is needed with native Git integration.

## Preview verification

After the first preview deployment completes, open the preview URL shown in the Cloudflare dashboard or pull request. Verify:

- The page loads on desktop and Android Chrome.
- The PWA app shell and channel launch kit load.
- A project can be edited, saved locally, exported and imported.
- A new topic from the 30-topic library loads a fresh starter storyboard.
- Narration upload and microphone recording work after granting browser permission.
- Playback scene changes and narration are acceptably synchronised.
- A short MP4 can be exported and played back, including on the target Android device.
- A backup containing a remote media URL is rejected, and a normal embedded-media backup imports successfully.

CI validates unit tests, dependency advisories and a production build. CI does not test real device microphone permissions, media codec availability, full MP4 encoding, or Cloudflare deployment.

## Production release sequence

1. Review the feature-branch preview and complete desktop/Android checks.
2. Confirm the pull request checks are green and move the PR out of draft only after review.
3. Merge the reviewed pull request into `main`.
4. Cloudflare Pages builds and publishes the production deployment from `main`.
5. Test the final `*.pages.dev` URL and PWA installation.

Do not change the production branch to the feature branch. No preview or production deployment has been created yet.

## Privacy and media notes

- The optional Gemini API key is entered by the creator in the browser and is not part of the Pages build or repository.
- Gemini TTS uses a stateless Interactions request (`store: false`); provider free-tier data-use and retention terms still apply.
- User-created project media and MP4 exports remain in browser storage and are not uploaded to Cloudflare by the editor.
- Imported project backups must contain embedded supported media data; external image/audio URLs and oversized files are rejected.
- The app's browser-side MP4 rendering depends on compatible WebCodecs video and audio encoders. Start with a short export in current desktop Chrome/Edge, then test Android Chrome.

## References

- [Cloudflare Pages Git integration](https://developers.cloudflare.com/pages/configuration/git-integration/)
- [Cloudflare GitHub integration and repository authorisation](https://developers.cloudflare.com/pages/configuration/git-integration/github-integration/)
- [Cloudflare build configuration](https://developers.cloudflare.com/pages/configuration/build-configuration/)
