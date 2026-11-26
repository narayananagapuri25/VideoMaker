export interface StarterTopic {
  id: number;
  category: string;
  title: string;
  angle: string;
}

export interface PromptTemplate {
  title: string;
  purpose: string;
  prompt: string;
}

export const channelBrand = {
  name: "SochoZara",
  tagline: "Duniya ke facts. Ek naya angle.",
  promise: "Everyday questions, surprising explanations and useful context — in clear, curious Hinglish.",
  audience: "Curious Indian viewers who enjoy science, history, technology, psychology, money and the world around them.",
  voice: "Warm, confident, energetic and conversational. Explain difficult ideas simply; never shout, exaggerate or present guesses as facts.",
  visual: "Premium motion-documentary look: midnight navy backgrounds, electric cyan highlights, restrained saffron-orange accents, clean typography and purposeful movement.",
  description: "SochoZara brings you curious stories from science, history, technology, psychology, money, nature and everyday life. We break big ideas into simple Hinglish explanations, cinematic motion visuals and questions that make you look at the world differently. Facts first, curiosity always. New perspectives, one video at a time.",
  shortDescription: "Curious stories. Clear Hinglish. Duniya ke facts, ek naya angle.",
  logoDirection: "A bold, readable SOCHOZARA wordmark with a simple question-mark thought bubble and a small play-triangle cut-out. Keep it geometric, recognisable at tiny profile size, and avoid detailed illustrations.",
  bannerDirection: "A wide midnight-navy canvas with the SOCHOZARA wordmark in the safe centre, the tagline below, and a restrained cyan-to-saffron motion trail linking small abstract symbols for science, history, technology and nature. Keep the outer edges uncluttered so the design crops cleanly on phones and TVs.",
  publishingRhythm: "Start with 3 short videos per week and one deeper explainer every 2 weeks. Batch scripts and visuals, then adjust cadence to the time available and audience response.",
};

export const topicCategories = [
  "All topics",
  "Science & Nature",
  "History & Culture",
  "Technology & Future",
  "Mind & Everyday Life",
  "Money & Society",
] as const;

export const starterTopics: StarterTopic[] = [
  { id: 1, category: "Science & Nature", title: "Why do we see lightning before hearing thunder?", angle: "Use the speed difference between light and sound to explain how distance can be estimated — with a clear safety reminder." },
  { id: 2, category: "Science & Nature", title: "Why is the sky blue but sunsets look orange?", angle: "Explain scattering, the path of sunlight and why colours change through the atmosphere." },
  { id: 3, category: "Science & Nature", title: "What happens inside your brain while you sleep?", angle: "Tour the sleep cycle, memory and body repair without claiming sleep has only one purpose." },
  { id: 4, category: "Science & Nature", title: "How can something feel cold without being below zero?", angle: "Compare heat transfer, wind chill and the difference between temperature and how skin senses it." },
  { id: 5, category: "Science & Nature", title: "How do deep-sea animals make their own light?", angle: "Explore bioluminescence, camouflage and communication in the deep ocean." },
  { id: 6, category: "Science & Nature", title: "Why do we get hiccups — and what actually helps?", angle: "Explain the diaphragm reflex and separate common remedies from proven evidence." },
  { id: 7, category: "History & Culture", title: "How did ancient Indian stepwells manage water?", angle: "Show how architecture, climate and community use shaped stepwells; distinguish regional examples." },
  { id: 8, category: "History & Culture", title: "What made Nalanda a major centre of learning?", angle: "Explore its institutions, scholars and historical record without reducing its history to one dramatic event." },
  { id: 9, category: "History & Culture", title: "How did the Indian Ocean become a global trade network?", angle: "Map monsoon winds, ports, ships and the exchange of goods and ideas across centuries." },
  { id: 10, category: "History & Culture", title: "How did the idea of zero change mathematics?", angle: "Trace the development and transmission of zero and place Indian mathematical contributions in context." },
  { id: 11, category: "History & Culture", title: "Why were ancient Indian temples built with such precise geometry?", angle: "Explain proportion, structural design and regional variation using documented examples." },
  { id: 12, category: "Technology & Future", title: "What actually happens when you scan a QR code?", angle: "Follow the data from camera to pattern detection, error correction and the link or payment action." },
  { id: 13, category: "Technology & Future", title: "How does GPS know where you are?", angle: "Explain satellite timing, trilateration and why buildings or atmosphere can affect accuracy." },
  { id: 14, category: "Technology & Future", title: "How do batteries store and release electricity?", angle: "Use a simple animation to explain ions, electrodes, charging and why batteries age." },
  { id: 15, category: "Technology & Future", title: "Why are tiny semiconductor chips so difficult to make?", angle: "Visualise transistors, lithography, clean rooms and the complexity of modern chip fabrication." },
  { id: 16, category: "Technology & Future", title: "Why can AI confidently give a wrong answer?", angle: "Explain pattern prediction, missing context and hallucinations; show practical ways to verify outputs." },
  { id: 17, category: "Technology & Future", title: "How does the internet travel through undersea cables?", angle: "Follow a message through fibre optics, landing stations, routing and cable resilience." },
  { id: 18, category: "Mind & Everyday Life", title: "Why do songs get stuck in your head?", angle: "Explore earworms, repetition and memory while noting that individual experiences vary." },
  { id: 19, category: "Mind & Everyday Life", title: "Why does time seem to move faster as we grow older?", angle: "Compare memory density, routine and attention as possible explanations rather than a single proven cause." },
  { id: 20, category: "Mind & Everyday Life", title: "Why do we remember embarrassing moments for years?", angle: "Explain emotional memory, attention and rumination, with a helpful non-clinical perspective." },
  { id: 21, category: "Mind & Everyday Life", title: "How do habits become automatic?", angle: "Break down cues, routines, rewards and realistic ways to shape a small habit." },
  { id: 22, category: "Mind & Everyday Life", title: "Why do phone notifications interrupt our focus?", angle: "Show attention switching and design choices without overstating neuroscience claims." },
  { id: 23, category: "Money & Society", title: "Why does the value of the rupee change?", angle: "Explain exchange rates through demand, supply, trade, inflation and market expectations — not predictions." },
  { id: 24, category: "Money & Society", title: "Why does inflation feel different for every family?", angle: "Compare household spending baskets, frequency of purchases and regional price differences." },
  { id: 25, category: "Money & Society", title: "How does a credit score work in India?", angle: "Explain credit reports, repayment history and enquiries using current regulator and bureau sources." },
  { id: 26, category: "Money & Society", title: "Why can two nearby streets feel different in summer?", angle: "Introduce the urban heat-island effect through shade, surfaces, traffic and building density." },
  { id: 27, category: "Money & Society", title: "How does drinking water reach a city home?", angle: "Animate source, treatment, storage, pumping, distribution and the last-mile challenges." },
  { id: 28, category: "Science & Nature", title: "How do monsoon winds bring rain to India?", angle: "Explain seasonal pressure patterns, land-sea heating and orographic rainfall using trusted climate sources." },
  { id: 29, category: "Science & Nature", title: "How do migratory birds find their way across continents?", angle: "Explore multiple navigation cues such as stars, landmarks and Earth's magnetic field." },
  { id: 30, category: "Technology & Future", title: "Can we predict an earthquake before it happens?", angle: "Separate long-term hazard assessment and early-warning systems from precise prediction claims." },
];

export const promptTemplates: PromptTemplate[] = [
  {
    title: "Hinglish Shorts script",
    purpose: "A tight 30–60 second vertical video with a strong opening and scene-by-scene visuals.",
    prompt: "You are the Hinglish-first documentary writer for SochoZara. Create an original 30–60 second YouTube Short / Instagram Reel about: [TOPIC]. Audience: curious Indian viewers. Start with a specific curiosity hook in the first 2 seconds, explain one central idea in simple natural Hinglish, use short speakable sentences, and end with a memorable takeaway plus a light question for comments. Return: 3 title options, a voiceover script, 5–7 timed scenes with narration/caption/visual direction, and a short description. Do not invent facts, statistics, dates or quotes. Mark uncertain claims [VERIFY] and list the exact claims that need checking. Keep visual directions suitable for original motion graphics or licensed assets.",
  },
  {
    title: "Long-form explainer",
    purpose: "A structured 5–8 minute video with context, examples and a satisfying conclusion.",
    prompt: "Develop a 5–8 minute SochoZara explainer on: [TOPIC]. Write in conversational Hinglish for Indian viewers. Structure it as: cold open, why the question matters, background, 3–5 clear sections, real-world Indian example where relevant, limitations or counterpoints, conclusion and one audience question. Provide chapter timestamps, full narration, scene-by-scene motion-visual directions, on-screen captions and a concise description. Do not fabricate sources or quotations. Insert [VERIFY] next to every factual claim that needs independent checking and provide a research checklist with trustworthy source types to consult.",
  },
  {
    title: "Fact-check before publishing",
    purpose: "Turn a draft into a claim-by-claim verification checklist; this does not replace checking original sources.",
    prompt: "Review this SochoZara draft for factual reliability: [PASTE SCRIPT]. Extract every factual claim, number, date, attribution and causal statement into a table with: claim, why it matters, what evidence would verify it, best primary source to seek, and status (unverified / needs context / supported by supplied source). Do not mark any claim verified unless the supporting source text is supplied. Flag misleading simplifications, missing context and disputed interpretations. Suggest safer wording where needed. Never invent URLs, citations or source titles.",
  },
  {
    title: "Scene-by-scene motion plan",
    purpose: "Translate a finished script into animation directions that are practical to build and edit.",
    prompt: "Convert this SochoZara script into a production-ready motion storyboard: [PASTE SCRIPT]. For each scene, specify duration, narration line, short on-screen caption, visual metaphor, subject placement, camera movement, transition, sound-effect idea and whether it needs a licensed image or can be built with shapes/text/diagrams. Use a midnight-navy base, electric-cyan highlights and restrained saffron accents. Keep captions readable on a phone. Do not put text inside generated image prompts; add titles later in the editor. Avoid fake archival visuals and label any reconstruction as illustrative.",
  },
];

export const creatorChecklist = [
  "Choose one topic and one clear question for each video.",
  "Generate the script and storyboard, then edit it into your own voice.",
  "Check names, dates, numbers and causal claims against reliable sources.",
  "Use original artwork or assets whose licence permits your intended use.",
  "Listen to the full narration and check pronunciation, pacing and captions.",
  "Preview the complete video on a phone before publishing.",
];
