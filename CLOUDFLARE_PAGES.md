# Cloudflare Pages deployment

SochoZara Studio is a static Vite application. It renders video locally in the visitor's browser and does not require a Worker, D1 database, R2 bucket or server-side rendering service.

## Pages project settings

Create a Pages project from the GitHub repository `narayananagapuri25/VideoMaker`.

| Setting | Value |
| --- | --- |
| Framework preset | Vite |
| Production branch | `main` |
| Root directory | `/` (repository root) |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Node.js version | `22` |

Set `NODE_VERSION=22` if Cloudflare asks for a Node version environment variable.

## Preview deployment

When Git integration is connected, enable preview deployments for feature branches. Use `feat/sochozara-studio-mvp` for the first review preview. Keep `main` as the production branch; do not change it to the feature branch.

## Production release sequence

1. Review the pull request and its preview deployment.
2. Confirm the preview opens, saves a local project, generates or imports narration, and exports an MP4 in the target browser.
3. Merge the reviewed pull request into `main`.
4. Cloudflare Pages builds and publishes the production deployment.
5. Test the final `*.pages.dev` URL and PWA installation.

## Notes

- No Cloudflare API token or billable server resource is needed for Git-integrated static Pages hosting.
- The optional Gemini API key is entered by the creator in the browser and is not part of the Pages build or deployment environment.
- User-created project media and exports are stored in the browser and are not sent to Cloudflare.
- The app's browser-side rendering depends on WebCodecs encoder support; use a current desktop Chrome/Edge for the first full export verification.
