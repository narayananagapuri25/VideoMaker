import type { AspectRatio, GeneratedStory, Language, Scene, StudioProject } from "../types";

const id = () => globalThis.crypto?.randomUUID?.() ?? ("scene-" + Date.now() + "-" + Math.random().toString(16).slice(2));

function isEarthStopTopic(topic: string): boolean {
  return /earth|duniya|prithvi/i.test(topic) && /stop|stopp|halt|ruk|rotation|spin|ghoom/i.test(topic);
}

function splitIntoSentences(script: string): string[] {
  return script.replace(/\\r\\n?/g, "\\n")
    .split(/\\n+/)
    .flatMap((line) => line.split(/(?<=[.!?])\\s+/u))
    .map((part) => part.trim())
    .filter(Boolean);
}

export interface ParsedPastedNarration {
  script: string;
  editorialNote?: string;
}

export function parsePastedNarration(input: string): ParsedPastedNarration | null {
  const raw = input.replace(/\\r\\n?/g, "\\n").trim();
  if (!raw) return null;
  const notePattern = /(?:^|\\n)\\s*(?:scientific note|editorial note|fact(?:ual)?[- ]check note)\\s*:\\s*/i;
  const noteMatch = notePattern.exec(raw);
  let script = noteMatch ? raw.slice(0, noteMatch.index).trim() : raw;
  const editorialNote = noteMatch
    ? raw.slice(noteMatch.index + noteMatch[0].length).trim() || undefined
    : undefined;
  const fence = String.fromCharCode(96).repeat(3);
  script = script.replace(new RegExp("^\\\\s*" + fence + "(?:json)?\\\\s*", "i"), "")
    .replace(new RegExp("\\\\s*" + fence + "\\\\s*$"), "")
    .replace(/["”]\\s*$/u, "")
    .trim();
  const words = script.split(/\\s+/).filter(Boolean).length;
  const lines = script.split(/\\n+/).filter((line) => line.trim()).length;
  const sentences = splitIntoSentences(script).length;
  if (words < 24 && !(lines >= 2 && sentences >= 3) && sentences < 4) return null;
  return { script, editorialNote };
}

export function deriveTopicFromScript(script: string): string {
  if (isEarthStopTopic(script)) return "What if Earth suddenly stopped spinning?";
  if (/lightning|thunder|bijli|garaj/i.test(script)) return "Why lightning comes before thunder";
  const first = (splitIntoSentences(script)[0] || script)
    .replace(/^socho\\s*zara[,…\\s-]*/i, "")
    .replace(/^ab\\s+imagine\\s+karo[,…\\s-]*/i, "")
    .trim();
  return first.length > 68 ? first.slice(0, 65).trimEnd() + "…" : first || "Pasted narration";
}

function captionFromNarration(narration: string): string {
  const compact = narration.replace(/\\s+/g, " ").trim();
  if (compact.length <= 96) return compact;
  const boundary = compact.lastIndexOf(" ", 92);
  return compact.slice(0, boundary > 55 ? boundary : 92).trimEnd() + "…";
}

function earthVisualPrompt(narration: string, index: number): string {
  const text = narration.toLowerCase();
  if (/atmosphere|air|wind|inertia|hawa/.test(text)) return "Scientific thought-experiment visualization: blue Earth seen from low orbit while translucent atmospheric streamlines continue eastward over the planet, cinematic documentary graphic, no text or labels";
  if (/ocean|sea|water|samundar|wave|tsunami/.test(text)) return "Scientific thought-experiment visualization: blue oceans and curved Earth horizon with broad directional water-momentum lines, cinematic orbital documentary artwork, no text or labels";
  if (/equator|speed|rotation|spin|kilomet/.test(text)) return "Educational cinematic visualization of Earth rotating with a luminous equatorial ring and subtle eastward motion arrows, no numbers or words";
  if (/building|infrastructure|city|damage|destruction/.test(text)) return "Clearly hypothetical cinematic city skyline under extreme horizontal wind, dust and ocean spray, restrained documentary style, no text";
  return index === 0
    ? "Dramatic but realistic view of Earth from space, thin blue atmosphere glowing against deep space, restrained documentary lighting, no text"
    : "Cinematic Earth from space with subtle rotation trails and a deep navy star field, science documentary illustration, no text";
}

function earthStopStory(language: Language, targetDuration: number): GeneratedStory {
  const lines = language === "English"
    ? [
        "Imagine Earth’s rotation stopping in just five seconds. This is an extreme thought experiment, not a realistic forecast.",
        "At the equator, the ground is already moving east at roughly 1,670 kilometres per hour.",
        "If the solid Earth halted abruptly, inertia would initially keep the atmosphere, oceans and loose objects moving.",
        "Air and water could move violently relative to the ground, with the strongest rotational effects near the equator.",
        "The exact outcome is not one fixed prediction. It depends on what stops, how quickly, and how the planet responds.",
        "There is no known physical mechanism that could make this happen. Would anyone survive? Think about it."
      ]
    : [
        "Socho zara... agar Earth ki rotation sirf 5 seconds mein ruk jaaye, toh duniya ek extreme jhatke ka saamna karegi.",
        "Equator par zameen abhi lagbhag 1,670 kilometres per hour ki speed se east ki taraf move kar rahi hai.",
        "Agar solid Earth achanak ruk jaaye, inertia ki wajah se hawa, oceans aur loose objects apni pehle ki motion continue karenge.",
        "Isliye air aur water ground ke relative bahut tezi se move kar sakte hain. Equator ke paas rotational effect sabse strong hoga.",
        "Lekin exact damage ek fixed prediction nahi hai. Yeh depend karta hai ki kya rukta hai, kitni jaldi rukta hai aur planet ka response kya hota hai.",
        "Aisa instantly stop karne ka koi known physical mechanism nahi hai. Toh kya koi survive kar paayega? Socho zara!"
      ];
  const titles = ["The impossible stop", "The speed we already carry", "Air keeps its momentum", "Oceans keep moving", "The consequences", "Could anyone survive?"];
  return {
    title: "What If Earth Suddenly Stopped?",
    script: lines.join("\\n\\n"),
    editorialNote: "This thought experiment assumes the solid Earth stops while the atmosphere, oceans and loose objects initially retain their momentum. Exact effects depend on the stopping mechanism and timescale. The 1,670 km/h figure is the approximate eastward surface speed at the equator.",
    scenes: lines.map((narration, index) => ({
      title: titles[index],
      narration,
      caption: captionFromNarration(narration),
      visualPrompt: earthVisualPrompt(narration, index),
      duration: Math.max(1, targetDuration) / lines.length
    }))
  };
}

export function buildLocalStory(topic: string, language: Language, targetDuration: number): GeneratedStory {
  const cleanTopic = topic.trim() || "An amazing fact about our world";
  if (isEarthStopTopic(cleanTopic)) return earthStopStory(language, targetDuration);
  const sampleLightning = /lightning|thunder|bijli|garaj/i.test(cleanTopic);

  if (sampleLightning) {
    const lines = language === "English"
      ? [
          "Have you noticed that lightning appears before thunder reaches your ears?",
          "The reason is the enormous difference between the speed of light and the speed of sound.",
          "Light travels at about 300,000 kilometres per second.",
          "Sound travels through air at roughly 343 metres per second near room temperature.",
          "So the flash reaches you almost instantly, while the sound takes longer to arrive.",
          "If you hear thunder, go indoors immediately. Do not wait for the next flash."
        ]
      : [
          "Kabhi notice kiya, bijli pehle dikhti hai aur garaj baad mein sunai deti hai?",
          "Reason hai light aur sound ki speed ka huge difference.",
          "Light around 3 lakh kilometres per second travel karti hai.",
          "Lekin sound hawa mein roughly 343 metres per second travel karta hai.",
          "Isliye lightning ka flash almost instantly dikhta hai, aur thunder ki awaaz baad mein pahunchti hai.",
          "Thunder sunai de toh turant safe indoor shelter lo."
        ];
    const titles = ["The big question", "Two very different speeds", "Light is incredibly fast", "Sound takes its time", "Why the delay happens", "Safety first"];
    const prompts = [
      "Dramatic storm clouds, lightning flash on a deep navy sky, documentary photography, no text",
      "Clean science motion graphic comparing a cyan light beam and orange sound wave, dark navy background, no labels",
      "Glowing cyan light streak racing past a stylised planet, cinematic science visual, no text",
      "Visible concentric sound waves travelling through stormy air, amber and cyan, no text",
      "Lightning bolt followed by expanding sound-wave rings across a wide landscape, cinematic",
      "A safe indoor window view of distant rain and lightning, calm documentary ending"
    ];
    const duration = Math.max(4, targetDuration / lines.length);
    return {
      title: "Why Lightning Comes Before Thunder",
      script: lines.join("\n\n"),
      scenes: lines.map((line, index) => ({
        title: titles[index],
        narration: line,
        caption: line,
        visualPrompt: prompts[index],
        duration,
      })),
    };
  }

  const lines = language === "English"
    ? [
        "There is a surprising story behind this: " + cleanTopic + ".",
        "Let's look beyond the obvious and understand what makes it so interesting.",
        "The important detail is not just what happened, but why it matters.",
        "When we connect the evidence, a much bigger picture begins to appear.",
        "That is the detail worth remembering. What do you think?"
      ]
    : [
        "Socho zara… " + cleanTopic + " ke peeche ek interesting story hai.",
        "Sirf surface-level fact nahi, iska actual reason samajhte hain.",
        "Sabse important detail woh hai jo usually log miss kar dete hain.",
        "Jab hum clues ko connect karte hain, picture aur bhi interesting ho jaati hai.",
        "Ab batao, aapko ismein sabse surprising kya laga?"
      ];
  const headings = ["The hook", "Set the scene", "The key detail", "Connect the dots", "The takeaway"];
  const prompts = [
    "A bold cinematic opening visual about " + cleanTopic + ", premium documentary style, no words",
    "A detailed establishing visual for " + cleanTopic + ", strong focal point, dark navy and cyan",
    "A close-up documentary scene illustrating " + cleanTopic + ", cinematic light, no text",
    "An educational motion graphic connecting ideas related to " + cleanTopic,
    "A memorable final visual about " + cleanTopic + ", cinematic documentary closing frame"
  ];
  const duration = Math.max(4, targetDuration / lines.length);
  return {
    title: cleanTopic.length > 56 ? cleanTopic.slice(0, 53) + "..." : cleanTopic,
    script: lines.join("\n\n"),
    scenes: lines.map((line, index) => ({
      title: headings[index],
      narration: line,
      caption: line,
      visualPrompt: prompts[index],
      duration,
    })),
  };
}

export function makeProject(topic: string, language: Language, aspectRatio: AspectRatio, targetDuration: number): StudioProject {
  const story = buildLocalStory(topic, language, targetDuration);
  return {
    id: globalThis.crypto?.randomUUID?.() ?? String(Date.now()),
    title: story.title,
    topic,
    language,
    aspectRatio,
    targetDuration,
    script: story.script,
    scenes: story.scenes.map((scene) => ({ ...scene, id: id() })),
    storyboardSourceTopic: topic,
    storyboardSourceScript: story.script,
    editorialNote: story.editorialNote,
    updatedAt: Date.now(),
  };
}

export function scenesFromScript(script: string, duration: number, topicContext = script): Scene[] {
  const segments = splitIntoSentences(script);
  const safeParts = segments.length ? segments : ["Add your narration for this scene."];
  const desired = Math.max(1, Math.min(24, Math.round(Math.max(1, duration) / 7.5)));
  const groupCount = Math.min(safeParts.length, desired);
  const groups: string[][] = [];
  let cursor = 0;
  for (let index = 0; index < groupCount; index += 1) {
    const remaining = safeParts.length - cursor;
    const slots = groupCount - index;
    const take = Math.ceil(remaining / slots);
    groups.push(safeParts.slice(cursor, cursor + take));
    cursor += take;
  }

  const earthScenario = isEarthStopTopic(topicContext);
  const sceneDuration = Math.max(1, duration) / groups.length;
  return groups.map((parts, index) => {
    const narration = parts.join(" ").trim();
    const text = narration.toLowerCase();
    let title = ["Opening", "The key detail", "How it works", "What changes", "The impact", "The takeaway"][index % 6];
    if (earthScenario) {
      title = index === 0 ? "The impossible stop"
        : /equator|speed|rotation|spin|kilomet/.test(text) ? "The speed we already carry"
        : /atmosphere|air|wind|hawa|inertia/.test(text) ? "Air keeps its momentum"
        : /ocean|sea|water|samundar|wave|tsunami/.test(text) ? "Oceans keep moving"
        : /building|infrastructure|city|damage|destruction/.test(text) ? "The impact on the surface"
        : /survive|question|socho/.test(text) ? "Could anyone survive?"
        : ["The scenario", "Momentum matters", "The atmosphere", "The oceans", "The consequences", "The takeaway"][index % 6];
    }
    return {
      id: id(),
      title,
      narration,
      caption: captionFromNarration(narration),
      visualPrompt: earthScenario
        ? earthVisualPrompt(narration, index)
        : [
            "Cinematic establishing shot related to the narration, deep navy, electric cyan and warm saffron accents, no text",
            "Close-up documentary scene illustrating the key detail, cinematic lighting, no text",
            "Elegant animated infographic that explains the spoken idea, minimal labels, no watermark",
            "Wide cinematic scene that reveals the consequence or bigger picture, no text",
            "Memorable closing visual that supports the final thought, no text"
          ][index % 5],
      duration: sceneDuration,
    };
  });
}
