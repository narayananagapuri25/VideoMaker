import type { Scene } from "../types";
import { drawSceneVisualPlan } from "./visual-plan-renderer";
import { drawSportsScene } from "./sports-visuals";
import { buildSubtitleCues, getActiveSubtitleCue } from "./subtitle-layout";

export interface SceneTransition {
  scene: Scene;
  image?: HTMLImageElement;
  video?: HTMLVideoElement;
  index: number;
  progress: number;
}

export type SceneTheme =
  | "space" | "earth" | "weather" | "ocean" | "city" | "sports"
  | "technology" | "history" | "nature" | "science" | "finance"
  | "entertainment" | "travel" | "food" | "health" | "education"
  | "mystery" | "biography" | "energy" | "generic";

export function getSceneTheme(scene: Pick<Scene, "title" | "caption" | "visualPrompt"> & Partial<Pick<Scene, "visualPlan" | "narration" | "topicContext">>): SceneTheme {
  const topicContext = (scene.topicContext ?? "").toLowerCase();
  // The explicit whole-video topic must outrank a misleading scene-level art prompt.
  // A generic AI prompt mentioning a planet must not turn a cricket story into an Earth scene.
  if (/football|soccer|cricket|basketball|tennis|formula 1|grand prix|athlete|stadium|match|tournament|olympic|race|mumbai indians|rohit sharma|wankhede|\\bipl\\b|captaincy/.test(topicContext)) return "sports";
  const subject = ((scene.topicContext ?? "") + " " + (scene.narration ?? "") + " " + scene.title + " " + scene.caption + " " + scene.visualPrompt + " " + (scene.visualPlan?.subject ?? "")).toLowerCase();
  if (/\b(petrol|gasoline|diesel|fuel|petroleum|refinery|oilfield|pipeline|opec|brent|wti|barrel|fuel pump)\b|crude[- ]oil|oil tanker|fuel price|oil price/.test(subject)) return "energy";
  if (/stock market|share market|stock exchange|trading floor|investor|investment portfolio|initial public offering|\\bipo\\b|\\bnifty\\b|\\bsensex\\b|candlestick|order book|equity market|bull market|bear market|dividend/.test(subject)) return "finance";
  if (/earth|planet|rotation|equator|globe|continent|world/.test(subject)) return "earth";
  if (/space|galaxy|black hole|nebula|moon|mars|orbit|cosmos|astronaut|star/.test(subject)) return "space";
  if (/lightning|thunder|storm|rain(?!forest)|cloud|hurricane|cyclone|weather|wind|atmosphere|inertia|pressure/.test(subject)) return "weather";
  if (/ocean|sea|water|wave|tsunami|river|underwater|coral|iceberg/.test(subject)) return "ocean";
  if (/football|soccer|cricket|basketball|tennis|formula 1|grand prix|athlete|stadium|match|tournament|olympic|race|mumbai indians|rohit sharma|wankhede|\\bipl\\b|captaincy/.test(subject)) return "sports";
  if (/travel|tourism|destination|holiday|journey|sightseeing|landmark|itinerary|airport|hotel/.test(subject)) return "travel";
  if (/food|recipe|cooking|cuisine|dish|restaurant|ingredient|kitchen|baking|street food/.test(subject)) return "food";
  if (/health|fitness|workout|exercise|nutrition|medical|hospital|anatomy|wellness|medicine/.test(subject)) return "health";
  if (/classroom|education|learning|lesson|school|university|student|teacher|study guide/.test(subject)) return "education";
  if (/mystery|investigation|unsolved|detective|clue|disappearance|case file|whodunit/.test(subject)) return "mystery";
  if (/biography|life story|early life|born in|founder|inventor|career timeline|legacy/.test(subject)) return "biography";
  if (/film|movie|cinema|concert|music|album|streaming|television|anime|entertainment|pop culture/.test(subject)) return "entertainment";
  if (/city|building|traffic|road|bridge|architecture|skyline|metro|urban/.test(subject)) return "city";
  if (/\bai\b|artificial intelligence|robot|technology|computer|digital|circuit|internet|data|chip|quantum|future/.test(subject)) return "technology";
  if (/temple|ancient|history|historical|empire|kingdom|fort|monument|civilization|archaeolog/.test(subject)) return "history";
  if (/forest|tree|nature|mountain|wildlife|animal|jungle|desert|volcano|plant|flower/.test(subject)) return "nature";
  if (/science|atom|molecule|physics|energy|gravity|magnet|chemical|experiment|cell|dna/.test(subject)) return "science";
  return "generic";
}

const PALETTES: Record<SceneTheme, { accent: string; secondary: string; glow: string; deep: string }> = {
  space: { accent: "#A78BFA", secondary: "#55D6E8", glow: "167,139,250", deep: "#10142F" },
  earth: { accent: "#55D6E8", secondary: "#83D69A", glow: "65,194,207", deep: "#092B3A" },
  weather: { accent: "#8BD8F5", secondary: "#F7BE66", glow: "91,178,226", deep: "#0B2038" },
  ocean: { accent: "#4DD9E6", secondary: "#5C9DF5", glow: "43,185,214", deep: "#062C43" },
  city: { accent: "#F5B66B", secondary: "#62D9E5", glow: "238,157,83", deep: "#201B2C" },
  technology: { accent: "#46E4D2", secondary: "#9B8CFF", glow: "42,218,205", deep: "#071F2C" },
  history: { accent: "#E8B477", secondary: "#F0D9A8", glow: "228,166,100", deep: "#2A1C20" },
  nature: { accent: "#9BD68C", secondary: "#F5C36C", glow: "111,183,110", deep: "#102C29" },
  science: { accent: "#70DDF2", secondary: "#C29AFF", glow: "87,196,226", deep: "#0B2036" },
  finance: { accent: "#45E2B3", secondary: "#F2B86C", glow: "49,208,165", deep: "#092A2A" },
  sports: { accent: "#F6A84E", secondary: "#5DE0B2", glow: "235,150,62", deep: "#2B1B17" },
  entertainment: { accent: "#F08BC7", secondary: "#A68BFF", glow: "213,115,188", deep: "#2B1731" },
  travel: { accent: "#63D6C5", secondary: "#E7C078", glow: "67,194,171", deep: "#0B2C38" },
  food: { accent: "#F2A55B", secondary: "#9EDB87", glow: "220,135,67", deep: "#321D1B" },
  health: { accent: "#6BD9B4", secondary: "#84BFF6", glow: "78,193,157", deep: "#102A31" },
  education: { accent: "#73C8F3", secondary: "#EBC678", glow: "83,170,220", deep: "#11283B" },
  mystery: { accent: "#A78BFA", secondary: "#6CD5DE", glow: "138,110,216", deep: "#17162F" },
  biography: { accent: "#E3B87B", secondary: "#D7A1B5", glow: "207,158,99", deep: "#2C2028" },
  energy: { accent: "#F2AD61", secondary: "#6FD2C4", glow: "218,137,73", deep: "#2C1A17" },
  generic: { accent: "#55DCE8", secondary: "#F5B36A", glow: "63,183,205", deep: "#0B1E32" },
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const smooth = (value: number) => {
  const x = clamp(value, 0, 1);
  return x * x * (3 - 2 * x);
};

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines = 3): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? line + " " + word : word;
    if (ctx.measureText(candidate).width > maxWidth && line) {
      lines.push(line);
      line = word;
      if (lines.length === maxLines - 1) break;
    } else {
      line = candidate;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  const used = lines.join(" ").length;
  if (used < text.trim().length && lines.length) {
    let last = lines.length - 1;
    let value = lines[last];
    while (ctx.measureText(value + "…").width > maxWidth && value.length > 4) value = value.slice(0, -1);
    lines[last] = value.replace(/[.,;:!?-]?$/, "") + "…";
  }
  return lines;
}

function drawBackdrop(ctx: CanvasRenderingContext2D, width: number, height: number, theme: SceneTheme, time: number, sceneIndex: number) {
  const palette = PALETTES[theme];
  const base = ctx.createLinearGradient(0, 0, width, height);
  base.addColorStop(0, "#050B16");
  base.addColorStop(0.42, palette.deep);
  base.addColorStop(1, "#050914");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, width, height);

  const glowX = width * (0.32 + 0.12 * Math.sin(time * 0.13 + sceneIndex));
  const glowY = height * 0.39;
  const glow = ctx.createRadialGradient(glowX, glowY, 0, glowX, glowY, Math.max(width, height) * 0.74);
  glow.addColorStop(0, "rgba(" + palette.glow + ",0.22)");
  glow.addColorStop(0.42, "rgba(" + palette.glow + ",0.07)");
  glow.addColorStop(1, "rgba(" + palette.glow + ",0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.globalAlpha = 0.12;
  ctx.strokeStyle = palette.accent;
  ctx.lineWidth = 1;
  const grid = Math.max(34, Math.round(Math.min(width, height) * 0.075));
  for (let x = -height; x < width + height; x += grid) {
    ctx.beginPath();
    ctx.moveTo(x + (time * 3) % grid, 0);
    ctx.lineTo(x - height * 0.24 + (time * 3) % grid, height * 0.68);
    ctx.stroke();
  }
  for (let y = grid; y < height * 0.68; y += grid) {
    ctx.globalAlpha = 0.035;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
  ctx.restore();

  ctx.save();
  ctx.globalCompositeOperation = "screen";
  for (let i = 0; i < 58; i += 1) {
    const seedX = ((i * 137 + sceneIndex * 29) % 997) / 997;
    const seedY = ((i * 313 + sceneIndex * 47) % 991) / 991;
    const x = ((seedX * width + time * (3 + i % 5)) % (width + 20)) - 10;
    const y = seedY * height * 0.77 + Math.sin(time * (0.16 + i % 3 * 0.05) + i) * height * 0.009;
    const radius = 0.8 + (i % 4) * 0.55;
    ctx.globalAlpha = 0.14 + (i % 5) * 0.035;
    ctx.fillStyle = i % 7 === 0 ? palette.secondary : "#D9F4FF";
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  const vignette = ctx.createRadialGradient(width * 0.5, height * 0.42, Math.min(width, height) * 0.18, width * 0.5, height * 0.42, Math.max(width, height) * 0.76);
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(0,0,0,0.56)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);
}

function drawEarth(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, time: number, palette: typeof PALETTES[SceneTheme]) {
  ctx.save();
  ctx.shadowColor = palette.accent;
  ctx.shadowBlur = radius * 0.36;
  const ocean = ctx.createRadialGradient(x - radius * 0.36, y - radius * 0.44, radius * 0.04, x, y, radius);
  ocean.addColorStop(0, "#A5F5F0");
  ocean.addColorStop(0.22, "#2DA8C1");
  ocean.addColorStop(0.68, "#12618A");
  ocean.addColorStop(1, "#071B44");
  ctx.fillStyle = ocean;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, radius * 0.985, 0, Math.PI * 2);
  ctx.clip();
  const drift = Math.sin(time * 0.18) * radius * 0.1;
  ctx.fillStyle = "#73C58E";
  ctx.beginPath();
  ctx.moveTo(x - radius * 0.9 + drift, y - radius * 0.35);
  ctx.bezierCurveTo(x - radius * 0.86, y - radius * 0.74, x - radius * 0.36, y - radius * 0.77, x - radius * 0.16, y - radius * 0.5);
  ctx.bezierCurveTo(x + radius * 0.03, y - radius * 0.28, x - radius * 0.23, y - radius * 0.04, x - radius * 0.42, y + radius * 0.12);
  ctx.bezierCurveTo(x - radius * 0.56, y + radius * 0.4, x - radius * 0.38, y + radius * 0.68, x - radius * 0.58, y + radius * 0.8);
  ctx.lineTo(x - radius, y + radius * 0.62);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x + radius * 0.16 + drift, y - radius * 0.1);
  ctx.bezierCurveTo(x + radius * 0.42, y - radius * 0.48, x + radius * 0.84, y - radius * 0.35, x + radius * 0.88, y + radius * 0.03);
  ctx.bezierCurveTo(x + radius * 0.75, y + radius * 0.38, x + radius * 0.52, y + radius * 0.5, x + radius * 0.46, y + radius * 0.86);
  ctx.bezierCurveTo(x + radius * 0.17, y + radius * 0.69, x + radius * 0.1, y + radius * 0.36, x + radius * 0.16 + drift, y - radius * 0.1);
  ctx.fill();
  ctx.fillStyle = "rgba(235,255,255,.13)";
  for (let i = 0; i < 4; i += 1) {
    const cloudX = x + Math.sin(time * 0.12 + i) * radius * 0.65;
    const cloudY = y - radius * 0.48 + i * radius * 0.25;
    ctx.beginPath();
    ctx.ellipse(cloudX, cloudY, radius * 0.28, radius * 0.05, -0.3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  ctx.strokeStyle = "rgba(189,246,255,.48)";
  ctx.lineWidth = Math.max(2, radius * 0.025);
  ctx.beginPath();
  ctx.ellipse(x, y, radius * 0.42, radius, time * 0.055, 0, Math.PI * 2);
  ctx.ellipse(x, y, radius, radius * 0.34, time * 0.035, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = palette.secondary;
  ctx.lineWidth = Math.max(2, radius * 0.028);
  ctx.beginPath();
  ctx.ellipse(x, y, radius * 1.48, radius * 0.42, -0.18, time * 0.12, Math.PI * 2 + time * 0.12);
  ctx.stroke();
  ctx.fillStyle = "#FFF0BD";
  ctx.beginPath();
  ctx.arc(x + radius * 1.12, y - radius * 0.18, radius * 0.045, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawSpace(ctx: CanvasRenderingContext2D, x: number, y: number, unit: number, time: number, palette: typeof PALETTES[SceneTheme]) {
  ctx.save();
  const nebula = ctx.createRadialGradient(x - unit * 0.18, y - unit * 0.12, unit * 0.04, x, y, unit * 0.85);
  nebula.addColorStop(0, "rgba(125,88,218,.3)");
  nebula.addColorStop(0.55, "rgba(42,94,150,.13)");
  nebula.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = nebula;
  ctx.fillRect(x - unit, y - unit, unit * 2, unit * 2);
  for (let i = 0; i < 3; i += 1) {
    const radius = unit * (0.42 + i * 0.16);
    ctx.strokeStyle = "rgba(168,147,255," + (0.22 - i * 0.045) + ")";
    ctx.lineWidth = Math.max(1, unit * 0.009);
    ctx.beginPath();
    ctx.ellipse(x, y, radius * 1.45, radius * 0.45, -0.26 + time * 0.025, 0, Math.PI * 2);
    ctx.stroke();
  }
  const disk = ctx.createRadialGradient(x, y, unit * 0.05, x, y, unit * 0.42);
  disk.addColorStop(0, "#02040B");
  disk.addColorStop(0.23, "#080A22");
  disk.addColorStop(0.31, "#B56AF7");
  disk.addColorStop(0.38, "#5BDCE8");
  disk.addColorStop(0.48, "rgba(27,35,78,.02)");
  disk.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = disk;
  ctx.beginPath();
  ctx.ellipse(x, y, unit * 0.72, unit * 0.31, -0.25, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowColor = palette.accent;
  ctx.shadowBlur = unit * 0.18;
  ctx.fillStyle = "#030611";
  ctx.beginPath();
  ctx.arc(x, y, unit * 0.27, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "rgba(211,196,255,.8)";
  ctx.lineWidth = Math.max(2, unit * 0.018);
  ctx.beginPath();
  ctx.ellipse(x, y, unit * 0.42, unit * 0.13, -0.25 + time * 0.06, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawWeather(ctx: CanvasRenderingContext2D, x: number, y: number, unit: number, time: number, palette: typeof PALETTES[SceneTheme]) {
  ctx.save();
  const cloudGlow = ctx.createRadialGradient(x, y - unit * 0.13, unit * 0.04, x, y, unit * 0.72);
  cloudGlow.addColorStop(0, "rgba(210,237,255,.27)");
  cloudGlow.addColorStop(1, "rgba(80,147,194,0)");
  ctx.fillStyle = cloudGlow;
  ctx.fillRect(x - unit, y - unit * 0.8, unit * 2, unit * 1.6);
  const cloud = ctx.createLinearGradient(0, y - unit * 0.3, 0, y + unit * 0.32);
  cloud.addColorStop(0, "#718DA8");
  cloud.addColorStop(0.42, "#344D6B");
  cloud.addColorStop(1, "#152A43");
  ctx.fillStyle = cloud;
  ctx.shadowColor = "#75B8DC";
  ctx.shadowBlur = unit * 0.12;
  const puffs = [
    [-0.42, 0.02, 0.25], [-0.2, -0.17, 0.31], [0.08, -0.22, 0.34], [0.36, -0.04, 0.27], [0.02, 0.08, 0.48],
  ];
  puffs.forEach(([dx, dy, scale]) => {
    ctx.beginPath();
    ctx.arc(x + dx * unit, y + dy * unit, scale * unit, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.shadowBlur = 0;
  ctx.strokeStyle = palette.accent;
  ctx.lineWidth = Math.max(2, unit * 0.014);
  for (let i = 0; i < 16; i += 1) {
    const rx = x - unit * 0.55 + i * unit * 0.073;
    const dropY = y + unit * (0.32 + (i % 4) * 0.075) + ((time * (0.3 + i % 3 * 0.15) + i * 0.17) % 1) * unit * 0.15;
    ctx.beginPath();
    ctx.moveTo(rx, dropY);
    ctx.lineTo(rx - unit * 0.025, dropY + unit * 0.09);
    ctx.stroke();
  }
  if (Math.sin(time * 2.4 + 1) > 0.93) {
    ctx.shadowColor = "#F9DB8D";
    ctx.shadowBlur = unit * 0.16;
    ctx.strokeStyle = "#FFE7A8";
    ctx.lineWidth = unit * 0.035;
    ctx.beginPath();
    ctx.moveTo(x + unit * 0.17, y + unit * 0.12);
    ctx.lineTo(x + unit * 0.02, y + unit * 0.48);
    ctx.lineTo(x + unit * 0.18, y + unit * 0.44);
    ctx.lineTo(x - unit * 0.06, y + unit * 0.86);
    ctx.stroke();
  }
  ctx.restore();
}

function drawOcean(ctx: CanvasRenderingContext2D, x: number, y: number, unit: number, time: number, palette: typeof PALETTES[SceneTheme]) {
  ctx.save();
  const sunGlow = ctx.createRadialGradient(x - unit * 0.27, y - unit * 0.48, unit * 0.02, x - unit * 0.27, y - unit * 0.48, unit * 0.52);
  sunGlow.addColorStop(0, "rgba(255,220,157,.65)");
  sunGlow.addColorStop(0.35, "rgba(255,180,109,.17)");
  sunGlow.addColorStop(1, "rgba(255,180,109,0)");
  ctx.fillStyle = sunGlow;
  ctx.fillRect(x - unit, y - unit, unit * 2, unit * 2);
  ctx.fillStyle = "#F8D9A1";
  ctx.globalAlpha = 0.88;
  ctx.beginPath();
  ctx.arc(x - unit * 0.27, y - unit * 0.48, unit * 0.14, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  const horizon = y + unit * 0.03;
  for (let layer = 0; layer < 6; layer += 1) {
    const waveY = horizon + layer * unit * 0.12;
    ctx.beginPath();
    ctx.moveTo(x - unit, waveY);
    for (let px = -unit; px <= unit; px += unit * 0.025) {
      const py = waveY + Math.sin(px / unit * 4.8 + time * (0.75 + layer * 0.07) + layer) * unit * (0.035 + layer * 0.007);
      ctx.lineTo(x + px, py);
    }
    ctx.lineTo(x + unit, y + unit);
    ctx.lineTo(x - unit, y + unit);
    ctx.closePath();
    ctx.fillStyle = layer % 2 ? "#0D7295" : "#0A3C64";
    ctx.globalAlpha = 0.78 - layer * 0.065;
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.strokeStyle = palette.accent;
  ctx.lineWidth = Math.max(2, unit * 0.012);
  for (let i = 0; i < 9; i += 1) {
    const yy = horizon + unit * (0.09 + i * 0.075);
    const span = unit * (0.3 + (i % 4) * 0.12);
    const start = x - span * 0.5 + Math.sin(time * 0.6 + i) * unit * 0.12;
    ctx.beginPath();
    ctx.moveTo(start, yy);
    ctx.quadraticCurveTo(x, yy + Math.sin(time + i) * unit * 0.025, start + span, yy);
    ctx.stroke();
  }
  ctx.restore();
}

function drawCity(ctx: CanvasRenderingContext2D, x: number, y: number, unit: number, time: number, palette: typeof PALETTES[SceneTheme]) {
  ctx.save();
  const haze = ctx.createLinearGradient(0, y - unit * 0.7, 0, y + unit * 0.6);
  haze.addColorStop(0, "rgba(255,191,126,.28)");
  haze.addColorStop(1, "rgba(255,191,126,0)");
  ctx.fillStyle = haze;
  ctx.fillRect(x - unit, y - unit, unit * 2, unit * 1.6);
  const heights = [0.48,0.68,0.42,0.78,0.56,0.88,0.49,0.7,0.4,0.63,0.8,0.45,0.7];
  heights.forEach((h, i) => {
    const bw = unit * (0.105 + (i % 3) * 0.018);
    const bx = x - unit * 0.94 + i * unit * 0.15;
    const bh = unit * h;
    const by = y + unit * 0.4 - bh;
    const gradient = ctx.createLinearGradient(bx, by, bx + bw, by + bh);
    gradient.addColorStop(0, i % 2 ? "#34506B" : "#263D58");
    gradient.addColorStop(1, "#0B172B");
    ctx.fillStyle = gradient;
    ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = i % 3 ? palette.secondary : palette.accent;
    for (let row = 0; row < 5; row += 1) {
      for (let col = 0; col < 2; col += 1) {
        const pulse = 0.72 + 0.28 * Math.sin(time * 0.8 + i * 3 + row + col);
        ctx.globalAlpha = pulse;
        ctx.fillRect(bx + bw * (0.19 + col * 0.43), by + unit * (0.1 + row * 0.12), bw * 0.13, unit * 0.035);
      }
    }
    ctx.globalAlpha = 1;
  });
  const roadY = y + unit * 0.41;
  ctx.fillStyle = "#070F1E";
  ctx.beginPath();
  ctx.moveTo(x - unit * 0.65, roadY);
  ctx.lineTo(x + unit * 0.65, roadY);
  ctx.lineTo(x + unit * 0.36, y + unit * 0.84);
  ctx.lineTo(x - unit * 0.36, y + unit * 0.84);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#F4BE75";
  ctx.lineWidth = Math.max(2, unit * 0.013);
  ctx.setLineDash([unit * 0.08, unit * 0.08]);
  ctx.beginPath();
  ctx.moveTo(x, roadY);
  ctx.lineTo(x, y + unit * 0.82);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

function drawTechnology(ctx: CanvasRenderingContext2D, x: number, y: number, unit: number, time: number, palette: typeof PALETTES[SceneTheme]) {
  ctx.save();
  const rx = unit * 0.29;
  const ry = unit * 0.24;
  const centerGlow = ctx.createRadialGradient(x, y, unit * 0.02, x, y, unit * 0.85);
  centerGlow.addColorStop(0, "rgba(52,228,208,.28)");
  centerGlow.addColorStop(1, "rgba(52,228,208,0)");
  ctx.fillStyle = centerGlow;
  ctx.fillRect(x - unit, y - unit, unit * 2, unit * 2);
  for (let ring = 0; ring < 4; ring += 1) {
    ctx.strokeStyle = "rgba(80,231,220," + (0.18 + ring * 0.06) + ")";
    ctx.lineWidth = Math.max(2, unit * 0.008);
    ctx.beginPath();
    ctx.ellipse(x, y, rx + ring * unit * 0.15, ry + ring * unit * 0.13, time * (ring % 2 ? -0.04 : 0.04), 0, Math.PI * 2);
    ctx.stroke();
  }
  const chip = ctx.createLinearGradient(x - unit * 0.25, y - unit * 0.25, x + unit * 0.25, y + unit * 0.25);
  chip.addColorStop(0, "#23667A");
  chip.addColorStop(1, "#111C42");
  ctx.fillStyle = chip;
  ctx.strokeStyle = palette.accent;
  ctx.lineWidth = Math.max(3, unit * 0.025);
  roundedRect(ctx, x - unit * 0.25, y - unit * 0.25, unit * 0.5, unit * 0.5, unit * 0.06);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#E8FFFA";
  ctx.font = "800 " + Math.round(unit * 0.19) + "px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("AI", x, y);
  ctx.textBaseline = "alphabetic";
  for (let i = 0; i < 12; i += 1) {
    const angle = (Math.PI * 2 * i) / 12 + time * 0.16;
    const sx = x + Math.cos(angle) * unit * (0.58 + (i % 2) * 0.1);
    const sy = y + Math.sin(angle) * unit * (0.43 + (i % 3) * 0.06);
    ctx.strokeStyle = "rgba(85,230,218,.52)";
    ctx.lineWidth = Math.max(2, unit * 0.012);
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(angle) * unit * 0.3, y + Math.sin(angle) * unit * 0.23);
    ctx.lineTo(sx, sy);
    ctx.stroke();
    ctx.fillStyle = i % 3 ? "#57E5D6" : "#F6BD77";
    ctx.beginPath();
    ctx.arc(sx, sy, unit * 0.018, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawHistory(ctx: CanvasRenderingContext2D, x: number, y: number, unit: number, time: number, palette: typeof PALETTES[SceneTheme]) {
  ctx.save();
  const light = ctx.createRadialGradient(x, y - unit * 0.68, 0, x, y - unit * 0.35, unit * 0.95);
  light.addColorStop(0, "rgba(255,210,151," + (0.28 + 0.08 * Math.sin(time * 0.35)) + ")");
  light.addColorStop(1, "rgba(255,190,130,0)");
  ctx.fillStyle = light;
  ctx.fillRect(x - unit, y - unit, unit * 2, unit * 1.6);
  const baseY = y + unit * 0.48;
  for (let step = 0; step < 5; step += 1) {
    const inset = step * unit * 0.12;
    ctx.fillStyle = step % 2 ? "#805B43" : "#AD8057";
    ctx.fillRect(x - unit * 0.84 + inset, baseY + step * unit * 0.075, unit * 1.68 - inset * 2, unit * 0.075);
  }
  const facade = ctx.createLinearGradient(x - unit * 0.58, 0, x + unit * 0.58, 0);
  facade.addColorStop(0, "#624A42");
  facade.addColorStop(0.5, palette.secondary);
  facade.addColorStop(1, "#5B3F3A");
  ctx.fillStyle = facade;
  ctx.fillRect(x - unit * 0.58, y - unit * 0.42, unit * 1.16, unit * 0.82);
  ctx.fillStyle = "#392D35";
  ctx.beginPath();
  ctx.moveTo(x - unit * 0.72, y - unit * 0.4);
  ctx.lineTo(x, y - unit * 0.88);
  ctx.lineTo(x + unit * 0.72, y - unit * 0.4);
  ctx.closePath();
  ctx.fill();
  for (let column = 0; column < 6; column += 1) {
    const cx = x - unit * 0.49 + column * unit * 0.196;
    ctx.fillStyle = "#E3C092";
    ctx.fillRect(cx, y - unit * 0.27, unit * 0.065, unit * 0.64);
    ctx.fillStyle = "#46333A";
    ctx.beginPath();
    ctx.arc(cx + unit * 0.032, y - unit * 0.27, unit * 0.034, Math.PI, 0);
    ctx.fill();
  }
  ctx.fillStyle = "#332D39";
  ctx.fillRect(x - unit * 0.1, y + unit * 0.05, unit * 0.2, unit * 0.34);
  ctx.restore();
}

function drawNature(ctx: CanvasRenderingContext2D, x: number, y: number, unit: number, time: number, palette: typeof PALETTES[SceneTheme]) {
  ctx.save();
  const sun = ctx.createRadialGradient(x - unit * 0.35, y - unit * 0.58, unit * 0.03, x - unit * 0.35, y - unit * 0.58, unit * 0.58);
  sun.addColorStop(0, "rgba(255,229,161,.75)");
  sun.addColorStop(0.25, "rgba(255,184,103,.24)");
  sun.addColorStop(1, "rgba(255,184,103,0)");
  ctx.fillStyle = sun;
  ctx.fillRect(x - unit, y - unit, unit * 2, unit * 2);
  ctx.fillStyle = "#F5D797";
  ctx.beginPath();
  ctx.arc(x - unit * 0.35, y - unit * 0.58, unit * 0.12, 0, Math.PI * 2);
  ctx.fill();
  const layers = [
    { color: "#284E54", y: 0.02, left: -0.9, peak: -0.27 },
    { color: "#38645A", y: 0.18, left: -0.2, peak: 0.2 },
    { color: "#163C3C", y: 0.32, left: 0.42, peak: 0.48 },
  ];
  layers.forEach((layer, i) => {
    ctx.fillStyle = layer.color;
    ctx.beginPath();
    ctx.moveTo(x - unit, y + unit * (layer.y + 0.54));
    ctx.lineTo(x - unit * 0.78, y + unit * (layer.y + 0.25));
    ctx.lineTo(x + unit * layer.peak, y - unit * (0.58 - i * 0.08));
    ctx.lineTo(x + unit * 0.35, y + unit * (layer.y + 0.18));
    ctx.lineTo(x + unit, y + unit * (layer.y + 0.5));
    ctx.closePath();
    ctx.fill();
  });
  ctx.strokeStyle = palette.accent;
  ctx.lineWidth = unit * 0.035;
  for (let i = 0; i < 7; i += 1) {
    const sway = Math.sin(time * 0.7 + i) * unit * 0.025;
    const tx = x - unit * 0.82 + i * unit * 0.27;
    const th = unit * (0.25 + (i % 3) * 0.08);
    ctx.beginPath();
    ctx.moveTo(tx, y + unit * 0.5);
    ctx.lineTo(tx + sway, y + unit * 0.5 - th);
    ctx.stroke();
    ctx.fillStyle = i % 2 ? "#5FAE72" : "#80BF7B";
    ctx.beginPath();
    ctx.arc(tx + sway, y + unit * 0.5 - th, unit * 0.085, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawFinanceHero(ctx: CanvasRenderingContext2D, x: number, y: number, unit: number, time: number, palette: typeof PALETTES[SceneTheme]) {
  ctx.save();
  const boardW = unit * 1.85;
  const boardH = unit * 1.12;
  const bx = x - boardW / 2;
  const by = y - boardH * 0.45;
  const board = ctx.createLinearGradient(bx, by, bx + boardW, by + boardH);
  board.addColorStop(0, "rgba(9,37,48,.98)");
  board.addColorStop(1, "rgba(5,18,31,.96)");
  ctx.fillStyle = board;
  ctx.strokeStyle = "rgba(69,226,179,.55)";
  ctx.lineWidth = Math.max(2, unit * 0.018);
  ctx.shadowColor = palette.accent;
  ctx.shadowBlur = unit * 0.12;
  ctx.beginPath();
  ctx.roundRect(bx, by, boardW, boardH, unit * 0.09);
  ctx.fill();
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#EAFBF5";
  ctx.font = "800 " + Math.round(unit * 0.09) + "px Arial";
  ctx.textAlign = "left";
  ctx.fillText("MARKET ACTIVITY", bx + unit * 0.12, by + unit * 0.21);
  ctx.strokeStyle = "rgba(190,225,230,.16)";
  for (let row = 0; row < 4; row += 1) {
    const yy = by + unit * (0.34 + row * 0.16);
    ctx.beginPath(); ctx.moveTo(bx + unit * 0.12, yy); ctx.lineTo(bx + boardW - unit * 0.12, yy); ctx.stroke();
  }
  const heights = [0.27,0.4,0.32,0.52,0.43,0.64,0.57,0.72,0.63,0.81];
  heights.forEach((value, i) => {
    const cx = bx + unit * (0.2 + i * 0.15);
    const candleH = unit * value * (0.65 + Math.sin(time * 0.16 + i) * 0.04);
    const baseY = by + boardH * 0.79;
    const up = i % 4 !== 1;
    ctx.strokeStyle = up ? "#45D9A4" : "#EE7B83";
    ctx.fillStyle = up ? "#34C58F" : "#DE6B76";
    ctx.lineWidth = Math.max(2, unit * 0.012);
    ctx.beginPath(); ctx.moveTo(cx, baseY - candleH - unit * 0.08); ctx.lineTo(cx, baseY + unit * 0.06); ctx.stroke();
    ctx.fillRect(cx - unit * 0.035, baseY - candleH * 0.65, unit * 0.07, candleH * 0.52);
  });
  ctx.fillStyle = palette.secondary;
  ctx.font = "700 " + Math.round(unit * 0.075) + "px Arial";
  ctx.textAlign = "right";
  ctx.fillText("BUY  /  SELL", bx + boardW - unit * 0.13, by + unit * 0.21);
  for (let i = 0; i < 3; i += 1) {
    const orbitX = x + Math.cos(time * 0.16 + i * 2.1) * unit * (1.15 + i * 0.18);
    const orbitY = y + Math.sin(time * 0.18 + i * 2.1) * unit * 0.63;
    ctx.fillStyle = i % 2 ? palette.secondary : palette.accent;
    ctx.globalAlpha = 0.7;
    ctx.beginPath(); ctx.arc(orbitX, orbitY, unit * 0.035, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

function drawEnergyHero(ctx: CanvasRenderingContext2D, x: number, y: number, unit: number, time: number, palette: typeof PALETTES[SceneTheme]) {
  ctx.save();
  const ground = y + unit * 0.48;
  ctx.strokeStyle = "rgba(216,173,127,.6)";
  ctx.lineWidth = Math.max(3, unit * 0.018);
  ctx.beginPath();
  ctx.moveTo(x - unit * 0.96, ground);
  ctx.lineTo(x + unit * 0.96, ground);
  ctx.stroke();

  // An oil pumpjack silhouette gives fuel and crude-oil stories a relevant
  // visual anchor instead of the unrelated orbital sphere used by the fallback.
  ctx.strokeStyle = "#D6A16A";
  ctx.lineWidth = Math.max(5, unit * 0.035);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x - unit * 0.42, ground);
  ctx.lineTo(x - unit * 0.08, y - unit * 0.13);
  ctx.lineTo(x + unit * 0.22, ground);
  ctx.moveTo(x - unit * 0.27, ground - unit * 0.08);
  ctx.lineTo(x + unit * 0.08, y - unit * 0.03);
  ctx.moveTo(x + unit * 0.02, ground);
  ctx.lineTo(x + unit * 0.02, y + unit * 0.06);
  ctx.stroke();

  const pivotX = x + unit * 0.05;
  const pivotY = y - unit * 0.16;
  const swing = Math.sin(time * 0.72) * 0.055;
  ctx.save();
  ctx.translate(pivotX, pivotY);
  ctx.rotate(swing);
  ctx.strokeStyle = palette.accent;
  ctx.lineWidth = Math.max(8, unit * 0.052);
  ctx.beginPath();
  ctx.moveTo(-unit * 0.73, 0);
  ctx.lineTo(unit * 0.68, 0);
  ctx.stroke();
  ctx.fillStyle = "#E9B67E";
  ctx.beginPath();
  ctx.ellipse(-unit * 0.78, unit * 0.03, unit * 0.12, unit * 0.19, -0.25, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = palette.secondary;
  ctx.beginPath();
  ctx.arc(unit * 0.67, 0, unit * 0.12, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.strokeStyle = "rgba(235,193,145,.9)";
  ctx.lineWidth = Math.max(3, unit * 0.018);
  ctx.beginPath();
  ctx.moveTo(x - unit * 0.73, pivotY);
  ctx.lineTo(x - unit * 0.73, ground - unit * 0.02);
  ctx.stroke();
  ctx.fillStyle = "#D7A16B";
  ctx.beginPath();
  ctx.roundRect(x - unit * 0.53, ground - unit * 0.3, unit * 0.25, unit * 0.3, unit * 0.035);
  ctx.fill();
  ctx.fillStyle = "#3F2830";
  ctx.fillRect(x - unit * 0.53, ground - unit * 0.23, unit * 0.25, unit * 0.055);
  ctx.fillStyle = palette.secondary;
  ctx.font = "800 " + Math.round(unit * 0.075) + "px Arial";
  ctx.textAlign = "center";
  ctx.fillText("CRUDE OIL", x - unit * 0.405, ground - unit * 0.11);

  ctx.fillStyle = "rgba(238,184,128,.72)";
  for (let i = 0; i < 5; i += 1) {
    const bx = x + unit * (0.38 + i * 0.14);
    const by = ground - unit * (0.08 + (i % 2) * 0.035);
    ctx.beginPath();
    ctx.arc(bx, by, unit * 0.018, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawScience(ctx: CanvasRenderingContext2D, x: number, y: number, unit: number, time: number, palette: typeof PALETTES[SceneTheme]) {
  ctx.save();
  const glow = ctx.createRadialGradient(x, y, 0, x, y, unit * 0.85);
  glow.addColorStop(0, "rgba(90,195,239,.22)");
  glow.addColorStop(1, "rgba(90,195,239,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(x - unit, y - unit, unit * 2, unit * 2);
  for (let i = 0; i < 3; i += 1) {
    ctx.strokeStyle = i === 1 ? palette.secondary : palette.accent;
    ctx.lineWidth = Math.max(2, unit * 0.018);
    ctx.beginPath();
    ctx.ellipse(x, y, unit * 0.67, unit * (0.22 + i * 0.06), time * (i % 2 ? -0.25 : 0.22), 0, Math.PI * 2);
    ctx.stroke();
  }
  const core = ctx.createRadialGradient(x - unit * 0.05, y - unit * 0.08, 0, x, y, unit * 0.18);
  core.addColorStop(0, "#FFFFFF");
  core.addColorStop(0.35, "#93F7F1");
  core.addColorStop(1, "#2A8AB4");
  ctx.fillStyle = core;
  ctx.shadowColor = "#65E8ED";
  ctx.shadowBlur = unit * 0.12;
  ctx.beginPath();
  ctx.arc(x, y, unit * 0.13, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  for (let i = 0; i < 6; i += 1) {
    const angle = time * 0.32 + i * Math.PI / 3;
    const nx = x + Math.cos(angle) * unit * (0.48 + (i % 2) * 0.1);
    const ny = y + Math.sin(angle) * unit * (0.19 + (i % 3) * 0.055);
    ctx.fillStyle = i % 2 ? "#F4BD7B" : "#9F9AFF";
    ctx.beginPath();
    ctx.arc(nx, ny, unit * 0.035, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawGeneric(ctx: CanvasRenderingContext2D, x: number, y: number, unit: number, time: number, palette: typeof PALETTES[SceneTheme]) {
  ctx.save();
  const sphere = ctx.createRadialGradient(x - unit * 0.19, y - unit * 0.24, unit * 0.02, x, y, unit * 0.43);
  sphere.addColorStop(0, "#E2FCFF");
  sphere.addColorStop(0.18, palette.accent);
  sphere.addColorStop(0.58, palette.deep);
  sphere.addColorStop(1, "#020713");
  ctx.fillStyle = sphere;
  ctx.shadowColor = palette.accent;
  ctx.shadowBlur = unit * 0.12;
  ctx.beginPath();
  ctx.arc(x, y, unit * 0.38, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  for (let i = 0; i < 3; i += 1) {
    ctx.strokeStyle = i % 2 ? palette.secondary : palette.accent;
    ctx.globalAlpha = 0.65 - i * 0.12;
    ctx.lineWidth = Math.max(2, unit * 0.012);
    ctx.beginPath();
    ctx.ellipse(x, y, unit * (0.53 + i * 0.14), unit * (0.19 + i * 0.04), time * (i % 2 ? -0.16 : 0.16), 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  const shapes = ["◆", "●", "✦", "▲"];
  ctx.font = "700 " + Math.round(unit * 0.1) + "px Arial";
  ctx.fillStyle = palette.secondary;
  shapes.forEach((shape, i) => {
    const angle = time * 0.12 + i * Math.PI * 0.5;
    ctx.fillText(shape, x + Math.cos(angle) * unit * 0.85, y + Math.sin(angle) * unit * 0.45);
  });
  ctx.restore();
}

function drawImageScene(ctx: CanvasRenderingContext2D, width: number, height: number, image: HTMLImageElement, elapsed: number, duration: number, sceneIndex: number) {
  // Give each still its own documentary camera move instead of applying the same zoom to every scene.
  const progress = smooth(elapsed / Math.max(0.5, duration));
  const shot = sceneIndex % 6;
  const cover = Math.max(width / image.width, height / image.height);
  const zoomStart = shot === 2 || shot === 5 ? 1.19 : 1.065;
  const zoomEnd = shot === 2 || shot === 5 ? 1.065 : 1.19;
  const scale = cover * (zoomStart + (zoomEnd - zoomStart) * progress);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  const pan = (progress - 0.5) * width * 0.075;
  const driftX = shot === 0 || shot === 3 || shot === 4 ? -pan : shot === 1 ? pan : Math.sin(progress * Math.PI) * width * 0.018;
  const driftY = shot === 2 || shot === 5 ? (progress - 0.5) * -height * 0.045 : Math.sin(progress * Math.PI) * height * 0.018;
  const rotation = shot === 4 ? (progress - 0.5) * 0.014 : shot === 5 ? (progress - 0.5) * -0.009 : 0;
  ctx.save();
  ctx.translate(width / 2 + driftX, height / 2 + driftY);
  ctx.rotate(rotation);
  ctx.drawImage(image, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
  ctx.restore();
}

function drawVideoScene(ctx: CanvasRenderingContext2D, width: number, height: number, video: HTMLVideoElement, elapsed: number, duration: number, sceneIndex: number) {
  if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth || !video.videoHeight) return;
  const progress = smooth(elapsed / Math.max(0.2, duration));
  const cover = Math.max(width / video.videoWidth, height / video.videoHeight);
  const scale = cover * (1.045 + progress * (sceneIndex % 2 ? 0.09 : 0.14));
  const drawWidth = video.videoWidth * scale;
  const drawHeight = video.videoHeight * scale;
  const direction = sceneIndex % 4 === 0 ? -1 : 1;
  const driftX = direction * (progress - 0.5) * width * 0.045;
  const driftY = sceneIndex % 3 === 0 ? (progress - 0.5) * height * 0.025 : 0;
  ctx.save();
  ctx.translate(width / 2 + driftX, height / 2 + driftY);
  ctx.drawImage(video, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
  ctx.restore();
}

function drawFrameAccents(ctx: CanvasRenderingContext2D, width: number, height: number, palette: typeof PALETTES[SceneTheme], elapsed: number, sceneIndex: number) {
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  for (let i = 0; i < 30; i += 1) {
    const xSeed = ((i * 197 + sceneIndex * 53) % 991) / 991;
    const ySeed = ((i * 277 + sceneIndex * 31) % 983) / 983;
    const x = ((xSeed * width + elapsed * (8 + i % 7)) % (width + 40)) - 20;
    const y = ySeed * height * 0.68 + Math.sin(elapsed * (0.2 + i % 3 * 0.08) + i) * height * 0.013;
    const r = 1.2 + (i % 4) * 0.8;
    ctx.globalAlpha = 0.11 + (i % 5) * 0.025;
    ctx.fillStyle = i % 4 ? palette.accent : palette.secondary;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const scanX = ((elapsed * width * 0.09) % (width * 1.5)) - width * 0.25;
  const beam = ctx.createLinearGradient(scanX - width * 0.12, 0, scanX + width * 0.12, height * 0.7);
  beam.addColorStop(0, "rgba(255,255,255,0)");
  beam.addColorStop(0.5, "rgba(255,255,255,.055)");
  beam.addColorStop(1, "rgba(255,255,255,0)");
  ctx.globalAlpha = 1;
  ctx.fillStyle = beam;
  ctx.fillRect(0, 0, width, height * 0.7);
  ctx.restore();
}

function drawTextOverlay(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  scene: Scene,
  palette: typeof PALETTES[SceneTheme],
  elapsed: number,
  sceneIndex: number,
  sceneCount: number,
  projectElapsed: number,
  totalDuration: number,
  sceneDuration: number,
) {
  const intro = smooth(elapsed / 0.58);
  const fontScale = Math.min(width / 720, height / 1280);
  const left = width * 0.075;
  const right = width * 0.925;
  const panelTop = height * 0.665;
  const panel = ctx.createLinearGradient(0, panelTop, 0, height);
  panel.addColorStop(0, "rgba(3,9,18,0)");
  panel.addColorStop(0.17, "rgba(3,9,18,.72)");
  panel.addColorStop(1, "rgba(3,9,18,.97)");
  ctx.fillStyle = panel;
  ctx.fillRect(0, panelTop, width, height - panelTop);

  ctx.save();
  ctx.globalAlpha = 0.92;
  ctx.fillStyle = "rgba(4,13,25,.56)";
  roundedRect(ctx, left, height * 0.055, width * 0.34, height * 0.048, height * 0.022);
  ctx.fill();
  ctx.fillStyle = palette.accent;
  ctx.beginPath();
  ctx.arc(left + width * 0.025, height * 0.079, Math.max(3, width * 0.006), 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#EAF7FF";
  ctx.font = "800 " + Math.round(Math.min(width * 0.024, height * 0.016)) + "px Arial";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText("SOCHOZARA  /  ORIGINAL STORIES", left + width * 0.045, height * 0.079);
  ctx.restore();

  const slide = (1 - intro) * width * 0.035;
  ctx.save();
  ctx.globalAlpha = intro;
  ctx.translate(-slide, 0);
  // Canvas text alignment is stateful: the scene artwork may leave it centered
  // or right-aligned, which previously pushed chapter headings off the left edge.
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  ctx.fillStyle = palette.accent;
  ctx.font = "800 " + Math.round(Math.min(width * 0.026, height * 0.019)) + "px Arial";
  ctx.textBaseline = "alphabetic";
  ctx.fillText("CHAPTER " + String(sceneIndex + 1).padStart(2, "0") + "   /   " + String(sceneCount).padStart(2, "0"), left, height * 0.69);

  const titleSize = Math.round(Math.min(width * 0.065, height * 0.06));
  ctx.font = "900 " + titleSize + "px Arial";
  ctx.fillStyle = "#FFFFFF";
  ctx.shadowColor = "rgba(0,0,0,.6)";
  ctx.shadowBlur = 18 * fontScale;
  const titleLines = wrapText(ctx, scene.title.toUpperCase(), width * 0.84, 2);
  const titleLineHeight = titleSize * 1.08;
  titleLines.forEach((line, i) => ctx.fillText(line, left, height * 0.745 + i * titleLineHeight));
  ctx.shadowBlur = 0;

  // Social-video safe subtitle block: centered horizontally, wrapped, high-contrast and kept clear of the bottom app controls.
  const captionSize = Math.max(25, Math.round(Math.min(width * 0.043, height * 0.026)));
  const captionMaxWidth = width * 0.86;
  ctx.font = "650 " + captionSize + "px Arial";
  const maxCharactersPerLine = Math.max(28, Math.floor(captionMaxWidth / (captionSize * 0.55)));
  const caption = scene.narration || scene.caption;
  const cues = buildSubtitleCues(caption, sceneDuration, maxCharactersPerLine);
  const cue = getActiveSubtitleCue(cues, elapsed);
  if (cue) {
    const lines = cue.text.split("\n").slice(0, 2);
    const lineHeight = captionSize * 1.28;
    const paddingX = captionSize * 0.72;
    const paddingY = captionSize * 0.42;
    ctx.font = "650 " + captionSize + "px Arial";
    const measuredWidth = Math.max(...lines.map((line) => ctx.measureText(line).width), captionSize * 3);
    const boxWidth = Math.min(captionMaxWidth, measuredWidth + paddingX * 2);
    const boxHeight = lines.length * lineHeight + paddingY * 2;
    const centerX = width * 0.5;
    const titleBottom = height * 0.745 + titleLines.length * titleLineHeight;
    const centerY = Math.min(
      height * 0.90 - boxHeight / 2,
      Math.max(height * 0.835, titleBottom + boxHeight / 2 + height * 0.025),
    );
    const boxX = centerX - boxWidth / 2;
    const boxY = centerY - boxHeight / 2;
    const cueFade = smooth((elapsed - cue.start) / 0.18);
    ctx.save();
    ctx.globalAlpha = cueFade;
    ctx.translate(0, (1 - cueFade) * captionSize * 0.18);
    ctx.fillStyle = "rgba(3,9,18,.84)";
    ctx.strokeStyle = "rgba(220,240,250,.22)";
    ctx.lineWidth = Math.max(1, width * 0.0015);
    roundedRect(ctx, boxX, boxY, boxWidth, boxHeight, captionSize * 0.38);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "650 " + captionSize + "px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(0,0,0,.65)";
    ctx.shadowBlur = captionSize * 0.2;
    lines.forEach((line, index) => {
      ctx.fillText(line, centerX, boxY + paddingY + lineHeight * (index + 0.5), captionMaxWidth - paddingX);
    });
    ctx.restore();
  }

  ctx.restore();

  const progress = clamp(projectElapsed / Math.max(0.1, totalDuration), 0, 1);
  const barY = height * 0.958;
  ctx.fillStyle = "rgba(255,255,255,.2)";
  ctx.fillRect(left, barY, right - left, Math.max(3, height * 0.004));
  ctx.fillStyle = palette.accent;
  ctx.fillRect(left, barY, (right - left) * progress, Math.max(3, height * 0.004));
  ctx.fillStyle = "#F4F8FD";
  ctx.font = "700 " + Math.round(Math.min(width * 0.017, height * 0.013)) + "px Arial";
  ctx.textAlign = "right";
  if (scene.videoClipSource === "nasa" || scene.videoClipSource === "pixabay") {
    ctx.save();
    ctx.fillStyle = "rgba(240,248,255,.82)";
    ctx.font = "700 " + Math.round(Math.min(width * 0.014, height * 0.011)) + "px Arial";
    ctx.textAlign = "left";
    const sourceCredit = scene.videoClipSource === "nasa"
      ? "FOOTAGE: NASA"
      : "FOOTAGE: PIXABAY · " + (scene.videoClipAuthor || "CREATOR").toUpperCase().slice(0, 22);
    ctx.fillText(sourceCredit, left, height * 0.948);
    ctx.restore();
  }
  ctx.fillText(String(sceneIndex + 1).padStart(2, "0") + " / " + String(sceneCount).padStart(2, "0"), right, height * 0.948);
}

export function drawSceneFrame(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  scene: Scene,
  image: HTMLImageElement | undefined,
  video: HTMLVideoElement | undefined,
  elapsed: number,
  duration: number,
  sceneIndex: number,
  sceneCount: number,
  projectElapsed = elapsed,
  totalDuration = duration,
  transition?: SceneTransition,
): void {
  const theme = getSceneTheme(scene);
  const palette = PALETTES[theme];
  const time = Math.max(0, elapsed);
  drawBackdrop(ctx, width, height, theme, time, sceneIndex);

  if (video && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
    drawVideoScene(ctx, width, height, video, time, duration, sceneIndex);
    const tint = ctx.createLinearGradient(0, 0, 0, height);
    tint.addColorStop(0, "rgba(4,12,25,.2)");
    tint.addColorStop(0.62, "rgba(4,12,25,.08)");
    tint.addColorStop(1, "rgba(4,12,25,.65)");
    ctx.fillStyle = tint;
    ctx.fillRect(0, 0, width, height);
  } else if (image) {
    drawImageScene(ctx, width, height, image, time, duration, sceneIndex);
    const tint = ctx.createLinearGradient(0, 0, 0, height);
    tint.addColorStop(0, "rgba(4,12,25,.2)");
    tint.addColorStop(0.58, "rgba(4,12,25,.06)");
    tint.addColorStop(1, "rgba(4,12,25,.72)");
    ctx.fillStyle = tint;
    ctx.fillRect(0, 0, width, height);
    drawFrameAccents(ctx, width, height, palette, time, sceneIndex);
  } else {
    const x = width * (0.5 + Math.sin(time * 0.16) * 0.018);
    const y = height * (0.405 + Math.sin(time * 0.27) * 0.012);
    const unit = Math.min(width * 0.43, height * 0.28);
    const hero = ctx.createRadialGradient(x - unit * 0.2, y - unit * 0.28, unit * 0.02, x, y, unit * 1.05);
    hero.addColorStop(0, "rgba(" + palette.glow + ",.24)");
    hero.addColorStop(1, "rgba(" + palette.glow + ",0)");
    ctx.fillStyle = hero;
    ctx.fillRect(x - unit * 1.1, y - unit * 1.1, unit * 2.2, unit * 2.2);
    switch (theme) {
      case "earth": drawEarth(ctx, x, y, unit * 0.58, time, palette); break;
      case "space": drawSpace(ctx, x, y, unit, time, palette); break;
      case "weather": drawWeather(ctx, x, y, unit, time, palette); break;
      case "ocean": drawOcean(ctx, x, y, unit, time, palette); break;
      case "city": drawCity(ctx, x, y, unit, time, palette); break;
      case "technology": drawTechnology(ctx, x, y, unit, time, palette); break;
      case "history": drawHistory(ctx, x, y, unit, time, palette); break;
      case "nature": drawNature(ctx, x, y, unit, time, palette); break;
      case "science": drawScience(ctx, x, y, unit, time, palette); break;
      case "finance": drawFinanceHero(ctx, x, y, unit, time, palette); break;
      case "energy": drawEnergyHero(ctx, x, y, unit, time, palette); break;
      case "sports": drawSportsScene(ctx, width, height, scene, time, sceneIndex); break;
      default: drawGeneric(ctx, x, y, unit, time, palette);
    }
    drawFrameAccents(ctx, width, height, palette, time, sceneIndex);
  }

  // Sports scenes use dedicated full-frame action art; generic chart/process templates
  // made cricket stories look like finance presentations.
  if (theme !== "sports" && scene.visualPlan && scene.visualPlan.layout !== "hero" && scene.visualPlan.layout !== "illustration") {
    drawSceneVisualPlan(ctx, width, height, scene.visualPlan, time, theme === "finance");
  }

  const entry = smooth(time / 0.48);
  if (entry < 1) {
    ctx.fillStyle = "rgba(3,8,18," + ((1 - entry) * 0.48) + ")";
    ctx.fillRect(0, 0, width, height);
  }
  drawTextOverlay(ctx, width, height, scene, palette, time, sceneIndex, sceneCount, projectElapsed, totalDuration, duration);
  if (transition && transition.progress > 0) {
    ctx.save();
    ctx.globalAlpha = clamp(transition.progress, 0, 1);
    drawSceneFrame(
      ctx,
      width,
      height,
      transition.scene,
      transition.image,
      transition.video,
      0,
      transition.scene.duration,
      transition.index,
      sceneCount,
      projectElapsed,
      totalDuration,
    );
    ctx.restore();
  }
}
