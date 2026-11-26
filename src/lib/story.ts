import type { AspectRatio, GeneratedStory, Language, Scene, StudioProject } from "../types";

const id = () => globalThis.crypto?.randomUUID?.() ?? ("scene-" + Date.now() + "-" + Math.random().toString(16).slice(2));

export function buildLocalStory(topic: string, language: Language, targetDuration: number): GeneratedStory {
  const cleanTopic = topic.trim() || "An amazing fact about our world";
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
    updatedAt: Date.now(),
  };
}

export function scenesFromScript(script: string, duration: number): Scene[] {
  const paragraphs = script.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
  const parts = paragraphs.length ? paragraphs : script.split(/[.!?]+/).map((part) => part.trim()).filter(Boolean);
  const safeParts = parts.length ? parts : ["Add your narration for this scene."];
  const prompts = [
    "Cinematic establishing shot related to the narration, deep navy, electric cyan and warm saffron accents, no text",
    "Close-up documentary scene illustrating the key detail, cinematic lighting, no text",
    "Elegant animated infographic that explains the spoken idea, minimal labels, no watermark",
    "Wide cinematic scene that reveals the consequence or bigger picture, no text",
    "Memorable closing visual that supports the final thought, no text"
  ];
  return safeParts.map((part, index) => ({
    id: globalThis.crypto?.randomUUID?.() ?? ("scene-" + Date.now() + "-" + index),
    title: ["Opening", "Discovery", "Explanation", "The reveal", "Closing"][index % 5],
    narration: part,
    caption: part,
    visualPrompt: prompts[index % prompts.length],
    duration: Math.max(3, duration / safeParts.length),
  }));
}