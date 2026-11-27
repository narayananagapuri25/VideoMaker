import { useEffect, useState } from "react";
import {
  clearSecondaryAIKey,
  confirmCloudflareFreeUseOnly,
  confirmGroqFreeUseOnly,
  getSecondaryAIHeaders,
  getSecondaryAIProviderHeaders,
  hasCloudflareFreeUseOnlyConfirmation,
  hasGroqApiKey,
  hasGroqFreeUseOnlyConfirmation,
  hasSecondaryAIKey,
  saveSecondaryAIKey,
  type SecondaryAIProvider,
} from "../lib/ai-provider-session";
import { getGeminiSessionHeaders } from "../lib/gemini-session";
import {
  AI_PROVIDER_HEALTH_EVENT,
  getAIProviderHealth,
  getAIProviderHealthHeader,
  saveAIProviderHealth,
  type AIProviderHealthEntry,
  type AIProviderHealthMap,
} from "../lib/ai-provider-health";

interface Props {
  onConnectionChange?: () => void;
}

type TestState = { status: "testing" | "success" | "error"; message: string };

const providers: Array<{
  id: Exclude<SecondaryAIProvider, "cloudflare">;
  name: string;
  inputLabel: string;
  placeholder: string;
  signupUrl: string;
  help: string;
}> = [
  {
    id: "groq",
    name: "Groq",
    inputLabel: "GROQ API KEY",
    placeholder: "Paste your Groq API key",
    signupUrl: "https://console.groq.com/keys",
    help: "Fast free-developer inference. Its live request/token limits are learned from inference response headers.",
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    inputLabel: "OPENROUTER API KEY",
    placeholder: "Paste your OpenRouter API key",
    signupUrl: "https://openrouter.ai/keys",
    help: "Automatically routes to a $0 free model. Daily free-request quota is checked without running a generation.",
  },
];

const providerNames = {
  gemini: "Gemini",
  groq: "Groq",
  openrouter: "OpenRouter",
  cloudflare: "Cloudflare Workers AI",
} as const;

function healthLabel(entry?: AIProviderHealthEntry): string {
  if (!entry) return "QUOTA UNKNOWN";
  if (entry.state === "available") return "AVAILABLE";
  if (entry.state === "exhausted") return "LIMIT REACHED";
  if (entry.state === "degraded") return "TEMPORARILY UNAVAILABLE";
  if (entry.state === "blocked") return "CHECK CREDENTIALS";
  return "QUOTA UNKNOWN";
}

function healthSummary(entry?: AIProviderHealthEntry): string {
  if (!entry) return "No recent quota signal yet.";
  if (entry.remainingRequests !== undefined) {
    return entry.remainingRequests + " of " + (entry.limitRequests ?? "unknown") + " free requests remaining";
  }
  if (entry.remainingTokens !== undefined) {
    return entry.remainingTokens.toLocaleString() + " of " + (entry.limitTokens ?? "unknown").toLocaleString() + " tokens remaining (latest response)";
  }
  return entry.note;
}

export default function AIProviderConnections({ onConnectionChange }: Props) {
  const [inputs, setInputs] = useState<Record<string, string>>({ groq: "", openrouter: "" });
  const [groqSaved, setGroqSaved] = useState(() => hasGroqApiKey());
  const [openrouterSaved, setOpenrouterSaved] = useState(() => hasSecondaryAIKey("openrouter"));
  const [groqFreeOnly, setGroqFreeOnly] = useState(() => hasGroqFreeUseOnlyConfirmation());
  const [cloudflareFreeOnly, setCloudflareFreeOnly] = useState(() => hasCloudflareFreeUseOnlyConfirmation());
  const [tests, setTests] = useState<Record<string, TestState | undefined>>({});
  const [testing, setTesting] = useState<string | null>(null);
  const [health, setHealth] = useState<AIProviderHealthMap>(() => getAIProviderHealth());
  const [refreshingQuota, setRefreshingQuota] = useState(false);
  const [quotaMessage, setQuotaMessage] = useState("Quota refresh checks provider metadata only; it never generates content.");

  useEffect(() => {
    const refresh = () => setHealth(getAIProviderHealth());
    window.addEventListener(AI_PROVIDER_HEALTH_EVENT, refresh);
    return () => window.removeEventListener(AI_PROVIDER_HEALTH_EVENT, refresh);
  }, []);

  useEffect(() => {
    void refreshQuota();
    // Credentials are intentionally tab-scoped; initial refresh runs once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refreshQuota() {
    setRefreshingQuota(true);
    setQuotaMessage("Checking free-plan availability without generating content…");
    try {
      const response = await fetch("/api/ai/quota", {
        method: "GET",
        headers: { Accept: "application/json", ...getGeminiSessionHeaders(), ...getSecondaryAIHeaders(), ...getAIProviderHealthHeader() },
        cache: "no-store",
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        const message = typeof payload === "object" && payload !== null && "error" in payload && typeof payload.error === "string"
          ? payload.error
          : "Quota refresh failed (HTTP " + response.status + ").";
        throw new Error(message);
      }
      if (typeof payload === "object" && payload !== null && "providerHealth" in payload && typeof payload.providerHealth === "object" && payload.providerHealth !== null) {
        saveAIProviderHealth(payload.providerHealth as AIProviderHealthMap);
      }
      setHealth(getAIProviderHealth());
      setQuotaMessage(typeof payload === "object" && payload !== null && "message" in payload && typeof payload.message === "string"
        ? payload.message
        : "Free availability refreshed.");
    } catch (error) {
      setQuotaMessage(error instanceof Error ? error.message : "Could not refresh provider availability.");
    } finally {
      setRefreshingQuota(false);
    }
  }

  function saveProvider(provider: Exclude<SecondaryAIProvider, "cloudflare">) {
    try {
      saveSecondaryAIKey(provider, inputs[provider] || "");
      setInputs((current) => ({ ...current, [provider]: "" }));
      if (provider === "groq") {
        setGroqSaved(true);
        setGroqFreeOnly(false);
      } else {
        setOpenrouterSaved(true);
      }
      setTests((current) => ({ ...current, [provider]: undefined }));
      setHealth(getAIProviderHealth());
      onConnectionChange?.();
    } catch (error) {
      setTests((current) => ({ ...current, [provider]: { status: "error", message: error instanceof Error ? error.message : "Could not save this API key." } }));
    }
  }

  function handleGroqFreeUseChange(checked: boolean) {
    try {
      confirmGroqFreeUseOnly(checked);
      setGroqFreeOnly(checked);
      setTests((current) => ({ ...current, groq: undefined }));
      setHealth(getAIProviderHealth());
      onConnectionChange?.();
    } catch (error) {
      setTests((current) => ({ ...current, groq: { status: "error", message: error instanceof Error ? error.message : "Could not save Groq free-plan confirmation." } }));
    }
  }

  function handleCloudflareFreeUseChange(checked: boolean) {
    try {
      confirmCloudflareFreeUseOnly(checked);
      setCloudflareFreeOnly(checked);
      setTests((current) => ({ ...current, cloudflare: undefined }));
      setHealth(getAIProviderHealth());
      onConnectionChange?.();
    } catch (error) {
      setTests((current) => ({
        ...current,
        cloudflare: { status: "error", message: error instanceof Error ? error.message : "Could not save the free-allocation confirmation." },
      }));
    }
  }

  function removeProvider(provider: SecondaryAIProvider) {
    clearSecondaryAIKey(provider);
    if (provider === "groq") {
      setGroqSaved(false);
      setGroqFreeOnly(false);
    } else if (provider === "openrouter") {
      setOpenrouterSaved(false);
    } else {
      setCloudflareFreeOnly(false);
    }
    setTests((current) => ({ ...current, [provider]: undefined }));
    setHealth(getAIProviderHealth());
    onConnectionChange?.();
  }

  async function testProvider(provider: SecondaryAIProvider) {
    setTesting(provider);
    setTests((current) => ({ ...current, [provider]: { status: "testing", message: "Checking the provider connection and API access…" } }));
    try {
      const response = await fetch("/api/ai/connection", {
        method: "POST",
        headers: { Accept: "application/json", ...getSecondaryAIProviderHeaders(provider) },
        cache: "no-store",
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        const detail = typeof payload === "object" && payload !== null && "error" in payload && typeof payload.error === "string"
          ? payload.error
          : "The provider connection test failed (HTTP " + response.status + ").";
        throw new Error(detail);
      }
      const message = typeof payload === "object" && payload !== null && "message" in payload && typeof payload.message === "string"
        ? payload.message
        : "Provider connection successful.";
      setTests((current) => ({ ...current, [provider]: { status: "success", message } }));
      if (provider === "groq") setGroqSaved(true);
      if (provider === "openrouter") setOpenrouterSaved(true);
      onConnectionChange?.();
      if (provider === "openrouter") void refreshQuota();
    } catch (error) {
      setTests((current) => ({ ...current, [provider]: { status: "error", message: error instanceof Error ? error.message : "Provider connection test failed." } }));
    } finally {
      setTesting(null);
    }
  }

  const connectedCount = Number(hasSecondaryAIKey("groq")) + Number(hasSecondaryAIKey("openrouter")) + Number(cloudflareFreeOnly);

  return (
    <section className="ai-providers-section" aria-labelledby="alternate-ai-heading">
      <div className="ai-providers-heading">
        <div><span className="field-label">FREE-ONLY SMART ROUTER</span><strong id="alternate-ai-heading">Connect alternate AI providers</strong></div>
        <span className="ai-provider-count">{connectedCount} READY</span>
      </div>
      <p className="ai-provider-intro">Add only the free API keys you have. SochoZara checks OpenRouter's live free-request balance, remembers rate-limit signals from other providers, and automatically selects an eligible free route. Paid model IDs and paid fallback routes are disabled.</p>

      <div className="ai-quota-dashboard" aria-live="polite">
        <div className="ai-quota-dashboard-heading">
          <strong>FREE AI AVAILABILITY</strong>
          <button type="button" className="text-button" disabled={refreshingQuota} onClick={() => void refreshQuota()}>{refreshingQuota ? "Checking…" : "↻ Refresh free availability"}</button>
        </div>
        <div className="ai-quota-grid">
          {(["gemini", "groq", "openrouter", "cloudflare"] as const).map((id) => {
            const entry = health[id];
            return (
              <div className="ai-quota-item" key={id}>
                <div><strong>{providerNames[id]}</strong><span className={"ai-quota-state " + (entry?.state || "unknown")}>{healthLabel(entry)}</span></div>
                <p>{healthSummary(entry)}</p>
                {entry?.retryAt && entry.retryAt > Date.now() && <small>Retry after {new Date(entry.retryAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</small>}
              </div>
            );
          })}
        </div>
        <small className="ai-quota-footnote">{quotaMessage} Gemini's API does not expose exact remaining free quota; Groq quota is visible only after a generation response; Workers AI daily Neuron usage is account-wide and must be checked in its dashboard.</small>
      </div>

      <div className="ai-provider-grid">
        {providers.map((provider) => {
          const isGroq = provider.id === "groq";
          const keySaved = isGroq ? groqSaved : openrouterSaved;
          const isEligible = isGroq ? keySaved && groqFreeOnly : keySaved;
          return (
            <article className="ai-provider-card" key={provider.id}>
              <div className="ai-provider-card-heading"><strong>{provider.name}</strong><span className={isEligible ? "provider-dot connected" : "provider-dot"} />{keySaved && <em>KEY SAVED</em>}</div>
              <label className="field-label" htmlFor={provider.id + "-api-key"}>{provider.inputLabel}</label>
              <input
                id={provider.id + "-api-key"}
                type="password"
                autoComplete="off"
                spellCheck={false}
                value={inputs[provider.id]}
                onChange={(event) => setInputs((current) => ({ ...current, [provider.id]: event.target.value }))}
                placeholder={keySaved ? "Key saved for this tab · paste to replace" : provider.placeholder}
              />
              {isGroq && (
                <label className="rights-confirm ai-cloudflare-free-confirm">
                  <input type="checkbox" checked={groqFreeOnly} disabled={!groqSaved} onChange={(event) => handleGroqFreeUseChange(event.target.checked)} />
                  <span>I confirm this API key belongs to my Groq Free Developer plan and no paid API billing is enabled. Never use paid usage for this app.</span>
                </label>
              )}
              <div className="ai-provider-actions">
                <button className="button button-primary" disabled={!inputs[provider.id]?.trim()} onClick={() => saveProvider(provider.id)}>Save for this tab</button>
                <button className="button button-secondary" disabled={testing !== null || !isEligible} onClick={() => void testProvider(provider.id)}>{testing === provider.id ? "Testing…" : "Test connection"}</button>
                {keySaved && <button className="text-button" onClick={() => removeProvider(provider.id)}>Remove</button>}
              </div>
              <p className="ai-provider-help">{provider.help} <a href={provider.signupUrl} target="_blank" rel="noreferrer">Get API key ↗</a></p>
              {tests[provider.id] && (
                <div className={"gemini-test-result " + tests[provider.id]?.status} role={tests[provider.id]?.status === "error" ? "alert" : "status"}>
                  <span className="gemini-test-icon">{tests[provider.id]?.status === "success" ? "✓" : tests[provider.id]?.status === "error" ? "!" : "…"}</span>
                  <span>{tests[provider.id]?.message}</span>
                </div>
              )}
            </article>
          );
        })}
        <article className="ai-provider-card">
          <div className="ai-provider-card-heading"><strong>Cloudflare Workers AI</strong><span className={cloudflareFreeOnly ? "provider-dot connected" : "provider-dot"} /><em>{cloudflareFreeOnly ? "FREE PLAN CONFIRMED" : "SERVER BINDING"}</em></div>
          <p className="ai-provider-help">Your Cloudflare Pages project already has the Workers AI binding named <strong>AI</strong>. SochoZara calls it server-side; no account ID, API token or browser credential is needed.</p>
          <label className="rights-confirm ai-cloudflare-free-confirm">
            <input
              type="checkbox"
              checked={cloudflareFreeOnly}
              onChange={(event) => handleCloudflareFreeUseChange(event.target.checked)}
            />
            <span>I confirm this account is on the Cloudflare Workers Free plan. Use only the included 10,000-Neuron daily allocation; never use paid overage. If I have a Workers Paid plan, I will leave this disabled unless I separately authorise charges.</span>
          </label>
          <div className="ai-provider-actions">
            <button className="button button-secondary" disabled={testing !== null || !cloudflareFreeOnly} onClick={() => void testProvider("cloudflare")}>{testing === "cloudflare" ? "Testing…" : "Test Workers AI binding"}</button>
            {cloudflareFreeOnly && <button className="text-button" onClick={() => removeProvider("cloudflare")}>Disable</button>}
          </div>
          <p className="ai-provider-help">Daily usage is account-wide. Check Workers & Pages → AI → Usage in Cloudflare to monitor Neurons. The binding does not expose an exact remaining balance to the app. <a href="https://developers.cloudflare.com/workers-ai/platform/pricing/" target="_blank" rel="noreferrer">Current pricing & limits ↗</a></p>
          {tests.cloudflare && (
            <div className={"gemini-test-result " + tests.cloudflare.status} role={tests.cloudflare.status === "error" ? "alert" : "status"}>
              <span className="gemini-test-icon">{tests.cloudflare.status === "success" ? "✓" : tests.cloudflare.status === "error" ? "!" : "…"}</span>
              <span>{tests.cloudflare.message}</span>
            </div>
          )}
        </article>
      </div>
      <p className="ai-provider-security">Credentials and quota health stay only in this browser tab's session storage. Keys are sent only to this app's same-origin HTTPS API and are excluded from project backups. Provider rate limits may be shared with other apps using the same account.</p>
    </section>
  );
}
