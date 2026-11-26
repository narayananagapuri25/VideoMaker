import { useMemo, useState } from "react";
import {
  channelBrand,
  creatorChecklist,
  promptTemplates,
  starterTopics,
  topicCategories,
} from "../data/creator-kit";

interface CreatorKitProps {
  onUseTopic: (topic: string) => void;
}

export default function CreatorKit({ onUseTopic }: CreatorKitProps) {
  const [category, setCategory] = useState<string>("All topics");
  const [search, setSearch] = useState("");
  const [copyMessage, setCopyMessage] = useState("");

  const visibleTopics = useMemo(() => {
    const term = search.trim().toLowerCase();
    return starterTopics.filter((topic) =>
      (category === "All topics" || topic.category === category) &&
      (!term || (topic.title + " " + topic.angle).toLowerCase().includes(term)),
    );
  }, [category, search]);

  async function copyText(label: string, value: string) {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard access is unavailable.");
      await navigator.clipboard.writeText(value);
      setCopyMessage(label + " copied.");
    } catch {
      setCopyMessage("Clipboard access was blocked. Expand the prompt and copy its text manually.");
    }
  }

  return (
    <section className="creator-kit-page">
      <div className="creator-hero">
        <div className="eyebrow">SOCHOZARA · CHANNEL LAUNCH KIT</div>
        <h1>One clear identity. Thirty ideas. A repeatable workflow.</h1>
        <p>Use this launch kit to keep the channel consistent, choose your next video and move straight into the editor.</p>
        <div className="creator-hero-meta">
          <span>HINGLISH FIRST</span><span>AI-ASSISTED NARRATION</span><span>MOTION DOCUMENTARY</span>
        </div>
      </div>

      <div className="creator-kit-section">
        <div className="creator-section-heading"><div><span className="step-number">01</span><div><h2>Channel identity</h2><p>The foundation to keep every upload recognisable.</p></div></div></div>
        <div className="brand-kit-grid">
          <article className="brand-kit-card brand-primary">
            <span className="field-label">CHANNEL NAME</span>
            <h2>{channelBrand.name}</h2>
            <p className="brand-tagline">{channelBrand.tagline}</p>
            <p>{channelBrand.promise}</p>
            <button className="button button-secondary" onClick={() => void copyText("Tagline", channelBrand.name + " — " + channelBrand.tagline)}>Copy name & tagline</button>
          </article>
          <article className="brand-kit-card">
            <span className="field-label">CHANNEL DESCRIPTION</span>
            <p>{channelBrand.description}</p>
            <button className="button button-secondary" onClick={() => void copyText("Channel description", channelBrand.description)}>Copy description</button>
          </article>
          <article className="brand-kit-card">
            <span className="field-label">SHORT BIO</span>
            <p>{channelBrand.shortDescription}</p>
            <button className="button button-secondary" onClick={() => void copyText("Short bio", channelBrand.shortDescription)}>Copy short bio</button>
          </article>
          <article className="brand-kit-card">
            <span className="field-label">VOICE & PERSONALITY</span>
            <p>{channelBrand.voice}</p>
          </article>
          <article className="brand-kit-card">
            <span className="field-label">LOGO DIRECTION</span>
            <p>{channelBrand.logoDirection}</p>
            <button className="button button-secondary" onClick={() => void copyText("Logo direction", channelBrand.logoDirection)}>Copy direction</button>
          </article>
          <article className="brand-kit-card">
            <span className="field-label">BANNER DIRECTION</span>
            <p>{channelBrand.bannerDirection}</p>
            <button className="button button-secondary" onClick={() => void copyText("Banner direction", channelBrand.bannerDirection)}>Copy direction</button>
          </article>
        </div>
        <div className="brand-kit-footer"><span className="field-label">VISUAL SYSTEM</span><p>{channelBrand.visual}</p><span className="field-label">CONTENT PROMISE</span><p>{channelBrand.audience}</p></div>
      </div>

      <div className="creator-kit-section">
        <div className="creator-section-heading"><div><span className="step-number">02</span><div><h2>30 starter video topics</h2><p>Pick an idea to load it into the video studio.</p></div></div><span className="topic-count">{starterTopics.length} IDEAS</span></div>
        <div className="topic-toolbar">
          <input aria-label="Search topic ideas" placeholder="Search the topic library…" value={search} onChange={(event) => setSearch(event.target.value)} />
          <select aria-label="Filter topics by category" value={category} onChange={(event) => setCategory(event.target.value)}>
            {topicCategories.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </div>
        <div className="topic-grid">
          {visibleTopics.map((topic) => (
            <article className="topic-card" key={topic.id}>
              <div className="topic-card-top"><span>{String(topic.id).padStart(2, "0")}</span><small>{topic.category}</small></div>
              <h3>{topic.title}</h3>
              <p>{topic.angle}</p>
              <button className="topic-use-button" onClick={() => onUseTopic(topic.title)}>Use this topic <span>→</span></button>
            </article>
          ))}
          {visibleTopics.length === 0 && <div className="topic-empty">No topics match this search. Try another keyword or category.</div>}
        </div>
      </div>

      <div className="creator-kit-section">
        <div className="creator-section-heading"><div><span className="step-number">03</span><div><h2>Reusable AI prompts</h2><p>Copy a prompt, replace the bracketed fields and use it with your preferred AI tool.</p></div></div></div>
        <div className="prompt-grid">
          {promptTemplates.map((template, index) => (
            <article className="prompt-card" key={template.title}>
              <div className="topic-card-top"><span>PROMPT 0{index + 1}</span><small>REUSABLE</small></div>
              <h3>{template.title}</h3>
              <p>{template.purpose}</p>
              <details><summary>Preview full prompt</summary><pre>{template.prompt}</pre></details>
              <button className="button button-secondary" onClick={() => void copyText(template.title, template.prompt)}>Copy prompt</button>
            </article>
          ))}
        </div>
      </div>

      <div className="creator-kit-section workflow-section">
        <div className="creator-section-heading"><div><span className="step-number">04</span><div><h2>Publishing rhythm & quality check</h2><p>Start sustainably; quality and consistency matter more than volume.</p></div></div></div>
        <p>{channelBrand.publishingRhythm}</p>
        <div className="creator-checklist">
          {creatorChecklist.map((item, index) => <div key={item}><span>{String(index + 1).padStart(2, "0")}</span><p>{item}</p></div>)}
        </div>
      </div>
      {copyMessage && <p className="creator-copy-status" role="status">{copyMessage}</p>}
      <div className="creator-kit-disclaimer">Topic ideas and AI prompts are creative starting points, not verified research. Check facts, rights and platform policies before publishing. Avoid fabricated imagery presented as documentary evidence.</div>
    </section>
  );
}
