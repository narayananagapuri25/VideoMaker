import { useState } from "react";
import type { AspectRatio, Scene } from "../types";
import { buildGoogleFlowVideoPrompt, GOOGLE_FLOW_URL } from "../lib/flow-prompts";

interface GoogleFlowPanelProps {
  scene: Scene;
  aspectRatio: AspectRatio;
  onNotice: (message: string) => void;
}

export default function GoogleFlowPanel({ scene, aspectRatio, onNotice }: GoogleFlowPanelProps) {
  const [showPrompt, setShowPrompt] = useState(false);
  const prompt = buildGoogleFlowVideoPrompt(scene, aspectRatio);

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(prompt);
      onNotice("Google Flow prompt copied for “" + scene.title + "”. Open Flow, paste it into the prompt box and generate the clip.");
    } catch {
      setShowPrompt(true);
      onNotice("Clipboard access is unavailable. Expand the prompt below and copy it manually.");
    }
  }

  return (
    <section className="google-flow-panel">
      <div className="google-flow-topline">
        <div>
          <span className="flow-eyebrow">RECOMMENDED · GOOGLE AI PRO</span>
          <strong>Generate this scene in Google Flow</strong>
          <small>Real AI-generated moving footage · no separate Veo API key</small>
        </div>
        <span className="flow-mark">FLOW</span>
      </div>
      <div className="google-flow-actions">
        <button className="button button-primary" onClick={() => void copyPrompt()}>▣ Copy video prompt</button>
        <a className="button button-secondary" href={GOOGLE_FLOW_URL} target="_blank" rel="noreferrer">Open Google Flow ↗</a>
        <button className="text-button" onClick={() => setShowPrompt((value) => !value)}>{showPrompt ? "Hide prompt" : "Preview prompt"}</button>
      </div>
      {showPrompt && <pre className="google-flow-prompt">{prompt}</pre>}
      <small className="google-flow-instructions">In Flow, create one clip for this scene, download it as MP4, then import it below. The editor adds your narration, subtitles and channel branding. Flow's generation uses your Google account credits.</small>
    </section>
  );
}
