import { useState } from "react";
import {
  clearMagicHourApiKey,
  confirmMagicHourFreeCreditsOnly,
  getMagicHourHeaders,
  hasMagicHourApiKey,
  hasMagicHourFreeCreditsOnlyConfirmation,
  saveMagicHourApiKey,
} from "../lib/ai-provider-session";
import type { MagicHourConnection } from "../lib/video-ai";

export default function VideoProviderConnections() {
  const [apiKey, setApiKey] = useState("");
  const [saved, setSaved] = useState(() => hasMagicHourApiKey());
  const [freeCreditsConfirmed, setFreeCreditsConfirmed] = useState(() => hasMagicHourFreeCreditsOnlyConfirmation());
  const [account, setAccount] = useState<MagicHourConnection | null>(null);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error" | "">("");

  function handleSave() {
    try {
      saveMagicHourApiKey(apiKey);
      setApiKey("");
      setSaved(true);
      setAccount(null);
      setFreeCreditsConfirmed(false);
      confirmMagicHourFreeCreditsOnly(false);
      setMessage("Magic Hour API key saved for this browser tab. Test the connection and review the free-credit balance.");
      setMessageType("success");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save the Magic Hour API key.");
      setMessageType("error");
    }
  }

  function handleRemove() {
    clearMagicHourApiKey();
    setSaved(false);
    setAccount(null);
    setFreeCreditsConfirmed(false);
    setMessage("Magic Hour credentials removed from this browser tab.");
    setMessageType("success");
  }

  function handleFreeCreditsChange(checked: boolean) {
    try {
      confirmMagicHourFreeCreditsOnly(checked);
      setFreeCreditsConfirmed(checked);
      setMessage(checked ? "Free-credit-only confirmation saved for this tab." : "Cloud video generation is paused until free credits are confirmed.");
      setMessageType(checked ? "success" : "");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save this confirmation.");
      setMessageType("error");
    }
  }

  async function testConnection() {
    setTesting(true);
    setMessage("Checking Magic Hour account tier and available credits…");
    setMessageType("");
    try {
      const response = await fetch("/api/video/magic-hour/connection", {
        method: "POST",
        headers: { Accept: "application/json", ...getMagicHourHeaders() },
        cache: "no-store",
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        const error = typeof payload === "object" && payload !== null && "error" in payload && typeof payload.error === "string"
          ? payload.error
          : "Magic Hour connection test failed (HTTP " + response.status + ").";
        throw new Error(error);
      }
      if (typeof payload !== "object" || payload === null || !("credits" in payload) || typeof payload.credits !== "number") {
        throw new Error("Magic Hour returned an invalid account balance.");
      }
      const result = payload as MagicHourConnection;
      setAccount(result);
      setSaved(true);
      setMessage(result.message + " Available balance: " + result.credits.toLocaleString() + " credits.");
      setMessageType("success");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Magic Hour connection test failed.");
      setMessageType("error");
    } finally {
      setTesting(false);
    }
  }

  return (
    <section className="video-provider-section" aria-labelledby="video-provider-heading">
      <div className="video-provider-header">
        <div>
          <span className="field-label">AI VIDEO GENERATION · FREE-TIER ROUTING</span>
          <strong id="video-provider-heading">Connect a real AI video generator</strong>
        </div>
        <span className={saved && account?.freeTier ? "video-provider-status ready" : "video-provider-status"}>{saved && account?.freeTier ? "FREE TIER CHECKED" : saved ? "KEY SAVED" : "NOT CONNECTED"}</span>
      </div>
      <p className="video-provider-intro">Magic Hour exposes real text-to-video jobs through its API. VideoMaker asks Magic Hour to select its best Free-tier model (LTX-2.5 at 480p), then tries MiniMax H3 only after a definite model rejection or refunded failed job. Every clip is submitted, monitored and downloaded into your local project.</p>
      <div className="video-provider-card">
        <div className="video-provider-title">
          <strong>Magic Hour · LTX 2.5 / MiniMax H3</strong>
          <span className="video-provider-badge">FREE MODEL ACCESS</span>
        </div>
        <label className="field-label" htmlFor="magic-hour-api-key">MAGIC HOUR DEVELOPER API KEY</label>
        <input
          id="magic-hour-api-key"
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
          placeholder={saved ? "Key saved for this tab · paste to replace" : "Paste your Magic Hour API key"}
        />
        <div className="video-provider-actions">
          <button className="button button-primary" disabled={!apiKey.trim()} onClick={handleSave}>Save key for this tab</button>
          <button className="button button-secondary" disabled={!saved || testing} onClick={() => void testConnection()}>{testing ? <><span className="spinner" /> Checking…</> : "Test connection & balance"}</button>
          {saved && <button className="text-button" onClick={handleRemove}>Remove key</button>}
        </div>
        {account && (
          <div className="video-credit-summary">
            <div><span>ACCOUNT TIER</span><strong>{account.tier.toUpperCase()}</strong></div>
            <div><span>AVAILABLE CREDITS</span><strong>{account.credits.toLocaleString()}</strong></div>
            <div><span>ESTIMATED VIDEO TIME</span><strong>{account.affordableSecondsAt480p}s</strong></div>
          </div>
        )}
        {account && (
          <div className={account.freeTier ? "video-credit-note" : "video-credit-note warning"}>
            {account.freeTier
              ? "Free account detected. Automatic model selection chooses LTX-2.5 at 480p. MiniMax H3 is the fallback if the first model fails and the credits are refunded. A 5-second clip is estimated at 120 credits."
              : "This account is not currently on the Free tier. VideoMaker will not submit free-tier generation jobs for this account."}
          </div>
        )}
        <label className="video-free-confirm">
          <input
            type="checkbox"
            checked={freeCreditsConfirmed}
            disabled={!account?.freeTier || !saved}
            onChange={(event) => handleFreeCreditsChange(event.target.checked)}
          />
          <span>I confirm this account balance contains only free signup / reward credits, not purchased credits. I will use every free-plan clip for personal, non-commercial projects only; I understand a watermark may be included.</span>
        </label>
        {message && <div className={"gemini-test-result " + (messageType || (testing ? "testing" : "success"))} role={messageType === "error" ? "alert" : "status"}>{message}</div>}
        <p className="video-provider-help">
          Create a developer key at <a href="https://magichour.ai/developer?tab=api-keys" target="_blank" rel="noreferrer">Magic Hour Developer Hub ↗</a>. The Free account currently advertises 300 signup credits and up to seven 100-credit daily claims. Its API balance combines subscription credits and purchased credit packs, so VideoMaker asks you to confirm the balance is free before using it. Free-plan outputs are 480p; free outputs are for personal, non-commercial use only and may include a watermark.
        </p>
      </div>
      <p className="video-provider-security">The key is stored only in this browser tab's session storage, never in your video project or GitHub. It is sent only to the same-origin HTTPS Cloudflare Function. Each request checks credits before submitting; generation stops when the free balance is insufficient.</p>
      <div className="manual-video-providers">
        <div className="manual-video-heading">
          <strong>More free video generators · manual fallback</strong>
          <span>WEB APP CREDITS</span>
        </div>
        <p>These sites provide free daily or trial credits in their own web apps, but they do not expose a supported free API for VideoMaker to call. Open a site, generate and download an MP4, then import it in the scene footage panel. Each site controls its own limits and queue.</p>
        <div className="manual-video-links">
          <a href="https://labs.google/fx/tools/flow" target="_blank" rel="noreferrer">
            <strong>Google Flow · Veo</strong>
            <small>50 credits daily. Non-subscriber video access can pause at peak hours; available models and regional access vary.</small>
          </a>
          <a href="https://app.pixverse.ai/" target="_blank" rel="noreferrer">
            <strong>PixVerse</strong>
            <small>Free Basic allowance: 60 initial credits plus 30 daily credits. Daily credits expire at UTC midnight; Basic output is capped at 540p.</small>
          </a>
          <a href="https://firefly.adobe.com/" target="_blank" rel="noreferrer">
            <strong>Adobe Firefly Video</strong>
            <small>Limited free daily generations across video, image and audio. Adobe varies the available models and daily limits.</small>
          </a>
          <a href="https://app.runwayml.com/" target="_blank" rel="noreferrer">
            <strong>Runway</strong>
            <small>125 one-time credits. They do not renew; free model access changes over time and exports may carry a watermark.</small>
          </a>
          <a href="https://hailuoai.video/" target="_blank" rel="noreferrer">
            <strong>Hailuo AI · MiniMax</strong>
            <small>Free daily or promotional credits may be available on the website. The allowance varies; its API is pay-per-generation, not a free API tier.</small>
          </a>
          <a href="https://klingai.com/" target="_blank" rel="noreferrer">
            <strong>Kling AI</strong>
            <small>Check the live account credit panel for any free or promotional allowance. No fixed free amount is assumed by VideoMaker.</small>
          </a>
        </div>
        <p className="manual-video-excluded">Not counted as a free generation source: Pika Free currently includes 0 monthly credits; video creation requires a credit pack or paid plan.</p>
      </div>
    </section>
  );
}
