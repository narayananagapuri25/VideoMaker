import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const port = Number(process.env.SMOKE_PORT || 4173);
const origin = "http://127.0.0.1:" + port;
const viteBin = fileURLToPath(new URL("../node_modules/vite/bin/vite.js", import.meta.url));
const preview = spawn(process.execPath, [
  viteBin,
  "preview",
  "--host", "127.0.0.1",
  "--port", String(port),
  "--strictPort",
], { stdio: "ignore" });

let launchError;
preview.once("error", (error) => { launchError = error; });

async function waitForPreview() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (launchError) throw launchError;
    if (preview.exitCode !== null) {
      throw new Error("Vite preview exited before it became ready (exit " + preview.exitCode + ").");
    }
    try {
      const response = await fetch(origin, { signal: AbortSignal.timeout(1_000) });
      if (response.ok) return response;
    } catch {
      // The preview server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("The production preview did not become ready within 15 seconds.");
}

async function getOk(path, expectedType) {
  const response = await fetch(new URL(path, origin), { signal: AbortSignal.timeout(5_000) });
  assert.equal(response.status, 200, path + " should return HTTP 200.");
  if (expectedType) {
    assert.match(response.headers.get("content-type") || "", expectedType, path + " should have the expected content type.");
  }
  return response;
}

try {
  const root = await waitForPreview();
  const html = await root.text();
  assert.match(html, /<title>SochoZara Studio/);
  assert.match(html, /id="root"/);

  const assetPaths = [...html.matchAll(/(?:src|href)="([^"]*\/assets\/[^"]+)"/g)].map((match) => match[1]);
  assert.ok(assetPaths.some((path) => /\.js(?:\?|$)/.test(path)), "Built HTML should reference a JavaScript bundle.");
  assert.ok(assetPaths.some((path) => /\.css(?:\?|$)/.test(path)), "Built HTML should reference a stylesheet.");
  for (const path of assetPaths) {
    const isCss = /\.css(?:\?|$)/.test(path);
    const response = await getOk(path, isCss ? /text\/css/ : /javascript/);
    if (!isCss) {
      const source = await response.text();
      assert.ok(source.includes("Make something worth watching."), "The application bundle should contain the Studio entry view.");
    }
  }

  const manifestResponse = await getOk("/manifest.webmanifest", /application\/manifest\+json|application\/json/);
  const manifest = await manifestResponse.json();
  assert.equal(manifest.name, "SochoZara Studio");
  assert.ok(Array.isArray(manifest.icons) && manifest.icons.length >= 2, "The PWA manifest should define launcher icons.");
  for (const icon of manifest.icons) await getOk(icon.src, /image\/svg\+xml/);

  const serviceWorker = await (await getOk("/sw.js", /javascript/)).text();
  assert.match(serviceWorker, /sochozara-studio-v\d+/);
  assert.match(serviceWorker, /skipWaiting/);
  assert.match(serviceWorker, /\/icon-512\.svg/);

  const headers = await readFile(new URL("../dist/_headers", import.meta.url), "utf8");
  assert.match(headers, /X-Content-Type-Options:\s*nosniff/);
  assert.match(headers, /frame-ancestors 'none'/);
  assert.match(headers, /object-src 'none'/);
  assert.match(headers, /Permissions-Policy:/);

  const redirects = await readFile(new URL("../dist/_redirects", import.meta.url), "utf8");
  assert.match(redirects, /\/\*\s+\/index\.html\s+200/);

  const swPath = fileURLToPath(new URL("../dist/sw.js", import.meta.url));
  const syntax = spawnSync(process.execPath, ["--check", swPath], { encoding: "utf8" });
  assert.equal(syntax.status, 0, "The production service worker must parse: " + (syntax.stderr || ""));

  process.stdout.write("Production preview smoke test passed: app shell, JS/CSS assets, PWA manifest/icons, service worker, redirects and security headers.\n");
} finally {
  preview.kill("SIGTERM");
}
