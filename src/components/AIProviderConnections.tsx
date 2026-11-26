import { useState } from "react";
import {
  clearSecondaryAIKey,
  getSecondaryAIProviderHeaders,
  hasSecondaryAIKey,
  saveCloudflareAIConnection,
  saveSecondaryAIKey,
  type SecondaryAIProvider,
} from "../lib/ai-provider-session";

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
    help: "Fast inference. Used after Gemini when Gemini is unavailable.",
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    inputLabel: "OPENROUTER API KEY",
    placeholder: "Paste your OpenRouter API key",
    signupUrl: "https://openrouter.ai/keys",
    help: "Routes to an available free model. Free-model daily limits apply.",
  },
];

export default function AIProviderConnections({ onConnectionChange }: Props) {
  const [inputs, setInputs] = useState<Record<string, string>>({ groq: "", openrouter: "", cloudflareToken: "", cloudflareAccount: "" });
  const [saved, setSaved] = useState<Record<string, boolean>>({
    groq: hasSecondaryAIKey("groq"),
    openrouter: hasSecondaryAIKey("openrouter"),
    cloudflare: hasSecondaryAIKey("cloudflare"),
  });
  const [tests, setTests] = useState<Record<string, TestState | undefined>>({});
  const [testing, setTesting] = useState<string | null>(null);

  function saveProvider(provider: Exclude<SecondaryAIProvider, "cloudflare">) {
    try {
      saveSecondaryAIKey(provider, inputs[provider] || "");
      setInputs((current) => ({ ...current, [provider]: "" }));
      setSaved((current) => ({ ...current, [provider]: true }));
      setTests((current) => ({ ...current, [provider]: undefined }));
      onConnectionChange?.();
    } catch (error) {
      setTests((current) => ({ ...current, [provider]: { status: "error", message: error instanceof Error ? error.message : "Could not save this API key." } }));
    }
  }

  function saveCloudflare() {
    try {
      saveCloudflareAIConnection(inputs.cloudflareAccount || "", inputs.cloudflareToken || "");
      setInputs((current) => ({ ...current, cloudflareToken: "", cloudflareAccount: "" }));
      setSaved((current) => ({ ...current, cloudflare: true }));
      setTests((current) => ({ ...current, cloudflare: undefined }));
      onConnectionChange?.();
    } catch (error) {
      setTests((current) => ({ ...current, cloudflare: { status: "error", message: error instanceof Error ? error.message : "Could not save Cloudflare credentials." } }));
    }
  }

  function removeProvider(provider: SecondaryAIProvider) {
    clearSecondaryAIKey(provider);
    setSaved((current) => ({ ...current, [provider]: false }));
    setTests((current) => ({ ...current, [provider]: undefined }));
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
      setSaved((current) => ({ ...current, [provider]: true }));
      onConnectionChange?.();
    } catch (error) {
      setTests((current) => ({ ...current, [provider]: { status: "error", message: error instanceof Error ? error.message : "Provider connection test failed." } }));
    } finally {
      setTesting(null);
    }
  }

  return (
    <section className="ai-providers-section" aria-labelledby="alternate-ai-heading">
      <div className="ai-providers-heading">
        <div><span className="field-label">MORE FREE-TIER MODELS</span><strong id="alternate-ai-heading">Connect alternate AI providers</strong></div>
        <span className="ai-provider-count">{Object.values(saved).filter(Boolean).length + (saved.cloudflare ? 0 : 0)} CONNECTED</span>
      </div>
      <p className="ai-provider-intro">Save your own API keys for this browser tab. Story generation tries Gemini first, then uses these providers automatically when an earlier provider is unavailable.</p>
      <div className="ai-provider-grid">
        {providers.map((provider) => (
          <article className="ai-provider-card" key={provider.id}>
            <div className="ai-provider-card-heading"><strong>{provider.name}</strong><span className={saved[provider.id] ? "provider-dot connected" : "provider-dot"} />{saved[provider.id] && <em>KEY SAVED</em>}</div>
            <label className="field-label" htmlFor={provider.id + "-api-key"}>{provider.inputLabel}</label>
            <input
              id={provider.id + "-api-key"}
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={inputs[provider.id]}
              onChange={(event) => setInputs((current) => ({ ...current, [provider.id]: event.target.value }))}
              placeholder={saved[provider.id] ? "Key saved for this tab · paste to replace" : provider.placeholder}
            />
            <div className="ai-provider-actions">
              <button className="button button-primary" disabled={!inputs[provider.id]?.trim()} onClick={() => saveProvider(provider.id)}>Save for this tab</button>
              <button className="button button-secondary" disabled={testing !== null || !saved[provider.id]} onClick={() => void testProvider(provider.id)}>{testing === provider.id ? "Testing…" : "Test connection"}</button>
              {saved[provider.id] && <button className="text-button" onClick={() => removeProvider(provider.id)}>Remove</button>}
            </div>
            <p className="ai-provider-help">{provider.help} <a href={provider.signupUrl} target="_blank" rel="noreferrer">Get API key ↗</a></p>
            {tests[provider.id] && (
              <div className={"gemini-test-result " + tests[provider.id]?.status} role={tests[provider.id]?.status === "error" ? "alert" : "status"}>
                <span className="gemini-test-icon">{tests[provider.id]?.status === "success" ? "✓" : tests[provider.id]?.status === "error" ? "!" : "…"}</span>
                <span>{tests[provider.id]?.message}</span>
              </div>
            )}
          </article>
        ))}
        <article className="ai-provider-card">
          <div className="ai-provider-card-heading"><strong>Cloudflare Workers AI</strong><span className={saved.cloudflare ? "provider-dot connected" : "provider-dot"} />{saved.cloudflare && <em>KEY SAVED</em>}</div>
          <label className="field-label" htmlFor="cloudflare-account-id">CLOUDFLARE ACCOUNT ID</label>
          <input id="cloudflare-account-id" autoComplete="off" spellCheck={false} value={inputs.cloudflareAccount} onChange={(event) => setInputs((current) => ({ ...current, cloudflareAccount: event.target.value }))} placeholder={saved.cloudflare ? "Account ID saved · paste to replace" : "32-character account ID"} />
          <label className="field-label" htmlFor="cloudflare-ai-token">WORKERS AI API TOKEN</label>
          <input id="cloudflare-ai-token" type="password" autoComplete="off" spellCheck={false} value={inputs.cloudflareToken} onChange={(event) => setInputs((current) => ({ ...current, cloudflareToken: event.target.value }))} placeholder={saved.cloudflare ? "Token saved for this tab · paste to replace" : "Workers AI API token"} />
          <div className="ai-provider-actions">
            <button className="button button-primary" disabled={!inputs.cloudflareAccount?.trim() || !inputs.cloudflareToken?.trim()} onClick={saveCloudflare}>Save for this tab</button>
            <button className="button button-secondary" disabled={testing !== null || !saved.cloudflare} onClick={() => void testProvider("cloudflare")}>{testing === "cloudflare" ? "Testing…" : "Test connection"}</button>
            {saved.cloudflare && <button className="text-button" onClick={() => removeProvider("cloudflare")}>Remove</button>}
          </div>
          <p className="ai-provider-help">Use a token with Workers AI read and execution permissions. <a href="https://developers.cloudflare.com/workers-ai/get-started/rest-api/" target="_blank" rel="noreferrer">Setup guide ↗</a></p>
          {tests.cloudflare && (
            <div className={"gemini-test-result " + tests.cloudflare.status} role={tests.cloudflare.status === "error" ? "alert" : "status"}>
              <span className="gemini-test-icon">{tests.cloudflare.status === "success" ? "✓" : tests.cloudflare.status === "error" ? "!" : "…"}</span>
              <span>{tests.cloudflare.message}</span>
            </div>
          )}
        </article>
      </div>
      <p className="ai-provider-security">Credentials stay in this tab's session storage, are excluded from project backups and are sent only to this app's HTTPS API. Free limits are provider-controlled; fallback respects each provider's rate-limit response and does not bypass account limits.</p>
    </section>
  );
}
