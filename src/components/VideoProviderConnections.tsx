import { useState } from "react";
import {
  clearAgnesApiKey,
  clearMagicHourApiKey,
  confirmAgnesFreeTrialOnly,
  confirmMagicHourFreeCreditsOnly,
  getAgnesConnectionHeaders,
  hasAgnesApiKey,
  hasAgnesFreeTrialOnlyConfirmation,
  getMagicHourHeaders,
  hasMagicHourApiKey,
  hasMagicHourFreeCreditsOnlyConfirmation,
  saveAgnesApiKey,
  saveMagicHourApiKey,
} from "../lib/ai-provider-session";
import type { MagicHourConnection } from "../lib/video-ai";
import type { AgnesConnection } from "../lib/video-agnes";

export default function VideoProviderConnections() {
  const [apiKey, setApiKey] = useState("");
  const [saved, setSaved] = useState(() => hasMagicHourApiKey());
  const [freeCreditsConfirmed, setFreeCreditsConfirmed] = useState(() => hasMagicHourFreeCreditsOnlyConfirmation());
  const [account, setAccount] = useState<MagicHourConnection | null>(null);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error" | "">("");
  const [agnesApiKey, setAgnesApiKey] = useState("");
  const [agnesSaved, setAgnesSaved] = useState(() => hasAgnesApiKey());
  const [agnesTrialConfirmed, setAgnesTrialConfirmed] = useState(() => hasAgnesFreeTrialOnlyConfirmation());
  const [agnesAccount, setAgnesAccount] = useState<AgnesConnection | null>(null);
  const [agnesTesting, setAgnesTesting] = useState(false);
  const [agnesMessage, setAgnesMessage] = useState("");
  const [agnesMessageType, setAgnesMessageType] = useState<"success" | "error" | "">("");

  function handleAgnesSave() {
    try {
      saveAgnesApiKey(agnesApiKey);
      setAgnesApiKey("");
      setAgnesSaved(true);
      setAgnesTrialConfirmed(false);
      setAgnesAccount(null);
      setAgnesMessage("Agnes API key saved for this browser tab. Test access, then confirm the current $0 Angel User Trial price.");
      setAgnesMessageType("success");
    } catch (error) {
      setAgnesMessage(error instanceof Error ? error.message : "Could not save the Agnes API key.");
      setAgnesMessageType("error");
    }
  }

  function handleAgnesRemove() {
    clearAgnesApiKey();
    setAgnesSaved(false);
    setAgnesTrialConfirmed(false);
    setAgnesAccount(null);
    setAgnesMessage("Agnes API key and free-trial consent removed from this tab.");
    setAgnesMessageType("success");
  }

  function handleAgnesConsentChange(checked: boolean) {
    try {
      confirmAgnesFreeTrialOnly(checked);
      setAgnesTrialConfirmed(checked);
      setAgnesMessage(checked
        ? "Agnes $0 trial-price confirmation saved for this browser tab."
        : "Agnes automatic video generation is paused until the $0 trial price is reconfirmed.");
      setAgnesMessageType(checked ? "success" : "");
    } catch (error) {
      setAgnesMessage(error instanceof Error ? error.message : "Could not save Agnes trial-price confirmation.");
      setAgnesMessageType("error");
    }
  }

  async function testAgnesConnection() {
    setAgnesTesting(true);
    setAgnesMessage("Checking Agnes API access and the free-trial model listing…");
    setAgnesMessageType("");
    try {
      const response = await fetch("/api/video/agnes/connection", {
        method: "POST",
        headers: { Accept: "application/json", ...getAgnesConnectionHeaders() },
        cache: "no-store",
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        const detail = typeof payload === "object" && payload !== null && "error" in payload && typeof payload.error === "string"
          ? payload.error
          : "Agnes connection test failed (HTTP " + response.status + ").";
        throw new Error(detail);
      }
      if (typeof payload !== "object" || payload === null || !("modelAvailable" in payload) || typeof payload.modelAvailable !== "boolean") {
        throw new Error("Agnes returned an invalid model-access response.");
      }
      const result = payload as AgnesConnection;
      setAgnesAccount(result);
      setAgnesSaved(true);
      setAgnesMessage(result.message);
      setAgnesMessageType("success");
    } catch (error) {
      setAgnesMessage(error instanceof Error ? error.message : "Agnes connection test failed.");
      setAgnesMessageType("error");
    } finally {
      setAgnesTesting(false);
    }
  }


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
      <p className="video-provider-intro">Magic Hour exposes real text-to-video jobs through its API. VideoMaker tries LTX-2.5 at 480p first, then MiniMax H3 only after a definite model rejection or a failed job that is refunded. Both models are documented for Free-plan use; the live credit balance is checked before each clip.</p>
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
              ? "Verified Free account. LTX-2.5 is tried first at 480p; MiniMax H3 is tried only after a definite model rejection or a failed job. Both are listed as Free-plan models and cost 24 credits/second, including audio. A five-second clip costs 120 credits."
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
          Create a developer key at <a href="https://magichour.ai/developer?tab=api-keys" target="_blank" rel="noreferrer">Magic Hour Developer Hub ↗</a>. Magic Hour currently advertises 300 signup credits and up to seven 100-credit daily claims for Basic accounts. Your live API balance is authoritative. The API balance can include purchased credit packs, and Magic Hour does not expose a separate free-credit balance, so generation requires your explicit confirmation that no purchased credits are present. Free-plan video is 480p, for personal, non-commercial use only; watermarks may apply.
        </p>
      </div>
      <div className="video-provider-card agnes-video-provider-card">
        <div className="video-provider-title">
          <strong>Agnes AI · Video 2.5 Flash</strong>
          <span className="video-provider-badge">720P · LIMITED-TIME $0 TRIAL</span>
        </div>
        <p className="video-provider-help">Agnes currently lists its 720p Flash video model at $0/second during the Angel User Trial promotion. It is intended for Default users; Agent Plan requests are billed at list price ($0.025/second). The offer can end without notice, so recheck Agnes Billing before each session. VideoMaker deliberately limits Agnes to one 720p clip per project; actual trial eligibility and available quota can vary by account and promotion.</p>
        <label className="field-label" htmlFor="agnes-api-key">AGNES AI API KEY</label>
        <input
          id="agnes-api-key"
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={agnesApiKey}
          onChange={(event) => setAgnesApiKey(event.target.value)}
          placeholder={agnesSaved ? "Key saved for this tab · paste to replace" : "Paste your Agnes AI API key"}
        />
        <div className="video-provider-actions">
          <button className="button button-primary" disabled={!agnesApiKey.trim()} onClick={handleAgnesSave}>Save key for this tab</button>
          <button className="button button-secondary" disabled={!agnesSaved || agnesTesting} onClick={() => void testAgnesConnection()}>{agnesTesting ? <><span className="spinner" /> Checking…</> : "Test API access"}</button>
          {agnesSaved && <button className="text-button" onClick={handleAgnesRemove}>Remove key</button>}
        </div>
        {agnesAccount && (
          <div className={agnesAccount.modelAvailable ? "video-credit-note" : "video-credit-note warning"}>
            {agnesAccount.modelAvailable
              ? "API access confirmed. Agnes Video 2.5 Flash is listed at 720P. The test cannot verify your billing plan or trial price."
              : "The free-trial model is not available for this API key."}
          </div>
        )}
        <label className="video-free-confirm">
          <input
            type="checkbox"
            checked={agnesTrialConfirmed}
            disabled={!agnesSaved || !agnesAccount?.modelAvailable}
            onChange={(event) => handleAgnesConsentChange(event.target.checked)}
          />
          <span>I have checked Agnes Billing and confirm this key is on the Default / Angel User Trial account (not an Agent Plan), and Agnes Video 2.5 Flash currently displays $0/second. I understand the promotion is temporary; if the trial price changes, API generation may be billed at $0.025/second, and I will recheck before using it.</span>
        </label>
        {agnesMessage && <div className={"gemini-test-result " + (agnesMessageType || (agnesTesting ? "testing" : "success"))} role={agnesMessageType === "error" ? "alert" : "status"}>{agnesMessage}</div>}
        <p className="video-provider-help">
          <a href="https://wiki.agnes-ai.com/en/docs/agnes-video-25-flash" target="_blank" rel="noreferrer">Agnes Video 2.5 Flash API docs ↗</a> · <a href="https://wiki.agnes-ai.com/en/docs/pricing" target="_blank" rel="noreferrer">Official model pricing ↗</a> · <a href="https://agnes-ai.com/" target="_blank" rel="noreferrer">Agnes AI dashboard ↗</a>
        </p>
        <p className="video-provider-security">The Agnes key is stored only in this browser tab's session storage, excluded from projects and backups, and sent only to same-origin HTTPS Cloudflare Functions. The server requires the free-trial attestation before creating or polling a video task.</p>
      </div>
      <p className="video-provider-security">Magic Hour and Agnes keys remain only in this browser tab's session storage, never in projects or GitHub. The router tries verified Magic Hour Free credits first, then at most one Agnes 720p trial clip per project, then local motion graphics when no free source can safely complete.</p>
      <div className="manual-video-providers">
        <div className="manual-video-heading">
          <strong>More free video generators · manual fallback</strong>
          <span>WEB APP CREDITS</span>
        </div>
        <p>These are manual web-app fallbacks, not automatic API integrations. Open the site, create a clip with its free allowance, download the MP4 and import it in the scene footage panel. VideoMaker will not sign in for you or spend credits on these sites.</p>
        <div className="manual-video-links">
          <a href="https://magichour.ai/products/ai-video-generator" target="_blank" rel="noreferrer">
            <strong>Magic Hour Web · no-signup fallback</strong>
            <small>Three shared video generations per day without signup, up to 3 seconds at 480p with a watermark. This is separate from your API account balance.</small>
          </a>
          <a href="https://labs.google/fx/tools/flow" target="_blank" rel="noreferrer">
            <strong>Google Flow · Veo</strong>
            <small>50 Flow credits per day for non-subscribers. Video generation can be unavailable at peak hours; model costs and regional access vary.</small>
          </a>
          <a href="https://app.pixverse.ai/" target="_blank" rel="noreferrer">
            <strong>PixVerse</strong>
            <small>Free Basic allowance: 60 initial credits plus 30 daily credits. Unused daily credits expire at UTC midnight. Free-plan API access is not offered; API access is currently enterprise-only.</small>
          </a>
          <a href="https://firefly.adobe.com/" target="_blank" rel="noreferrer">
            <strong>Adobe Firefly Video</strong>
            <small>Limited free daily generations for video, image and audio. Adobe does not promise a fixed free-video count for every account; check the current in-app allowance.</small>
          </a>
          <a href="https://app.runwayml.com/" target="_blank" rel="noreferrer">
            <strong>Runway</strong>
            <small>125 one-time credits that do not renew. Free-plan model access changes; check the current account and model limits before generating.</small>
          </a>
          <a href="https://hailuoai.video/" target="_blank" rel="noreferrer">
            <strong>Hailuo AI · MiniMax</strong>
            <small>Check the live website account for any free daily or promotional allowance. Do not use its API in the automatic free-only path; API generations are billed.</small>
          </a>
          <a href="https://klingai.com/" target="_blank" rel="noreferrer">
            <strong>Kling AI</strong>
            <small>Check the live website account for any free or promotional allowance. VideoMaker does not assume a free API quota or automate paid API calls.</small>
          </a>
        </div>
        <p className="manual-video-excluded">Not counted as an automatic source: Pika's current Free plan has 0 monthly generation credits; it requires a credit pack or paid plan to generate.</p>
      </div>
    </section>
  );
}
