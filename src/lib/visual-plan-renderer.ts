import type { SceneVisualPlan } from "../types";

type Theme = { accent: string; secondary: string; glow: string };
const FINANCE: Theme = { accent: "#45E2B3", secondary: "#F2B86C", glow: "49,208,165" };
const GENERAL: Theme = { accent: "#54D9E8", secondary: "#F2B86C", glow: "60,190,214" };
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const smooth = (n: number) => { const t = clamp(n, 0, 1); return t * t * (3 - 2 * t); };

function panel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, accent: string) {
  ctx.save();
  ctx.shadowColor = accent;
  ctx.shadowBlur = Math.max(8, w * 0.012);
  ctx.fillStyle = "rgba(5,16,30,.84)";
  ctx.strokeStyle = "rgba(160,213,230,.24)";
  ctx.lineWidth = Math.max(1, w * 0.0016);
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, Math.max(12, w * 0.018));
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function fitText(ctx: CanvasRenderingContext2D, value: string, maxWidth: number, maxChars = 42): string {
  const text = (value || "").trim().replace(/\s+/g, " ");
  if (!text) return "";
  if (text.length <= maxChars && ctx.measureText(text).width <= maxWidth) return text;
  let out = text.slice(0, maxChars);
  while (out.length > 4 && ctx.measureText(out + "…").width > maxWidth) out = out.slice(0, -1);
  return out.trimEnd() + "…";
}

function drawText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, color: string, weight = 600, maxWidth = 1000) {
  ctx.fillStyle = color;
  ctx.font = weight + " " + Math.round(size) + "px Arial";
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(fitText(ctx, text, maxWidth), x, y);
}

function header(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, plan: SceneVisualPlan, theme: Theme, scale: number) {
  drawText(ctx, plan.headline || plan.subject, x + w * 0.045, y, 17 * scale, "#F4FAFF", 800, w * 0.88);
  ctx.fillStyle = theme.accent;
  ctx.fillRect(x + w * 0.045, y + 10 * scale, 34 * scale, Math.max(2, 2 * scale));
  drawText(ctx, plan.subject, x + w * 0.045, y + 32 * scale, 8.5 * scale, "rgba(206,225,240,.72)", 500, w * 0.88);
}

function drawGrid(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, theme: Theme) {
  ctx.save();
  ctx.strokeStyle = "rgba(" + theme.glow + ",.13)";
  ctx.lineWidth = 1;
  for (let i = 1; i <= 4; i += 1) {
    const yy = y + h * i / 5;
    ctx.beginPath(); ctx.moveTo(x, yy); ctx.lineTo(x + w, yy); ctx.stroke();
  }
  ctx.restore();
}

function drawChart(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, plan: SceneVisualPlan, theme: Theme, time: number, candles = false) {
  const px = x + w * 0.075;
  const py = y + h * 0.12;
  const pw = w * 0.84;
  const ph = h * 0.58;
  drawGrid(ctx, px, py, pw, ph, theme);
  const supplied = plan.values?.length ? plan.values : [28, 42, 37, 55, 47, 63, 58, 76];
  const count = clamp(supplied.length, 5, 8);
  const values = Array.from({ length: count }, (_, i) => {
    const source = supplied[i % supplied.length] ?? 50;
    const trend = plan.trend === "up" ? i * 2.3 : plan.trend === "down" ? -i * 2.3 : 0;
    return clamp(source + trend, 10, 92);
  });
  const xAt = (i: number) => px + (pw * i) / Math.max(1, values.length - 1);
  const yAt = (v: number) => py + ph - (v / 100) * ph;
  const reveal = Math.max(2, Math.ceil(values.length * (0.55 + 0.45 * smooth(time / 2.8))));
  if (!candles) {
    const gradient = ctx.createLinearGradient(0, py, 0, py + ph);
    gradient.addColorStop(0, "rgba(" + theme.glow + ",.28)");
    gradient.addColorStop(1, "rgba(" + theme.glow + ",0)");
    ctx.beginPath();
    values.slice(0, reveal).forEach((v, i) => {
      if (i === 0) ctx.moveTo(xAt(i), yAt(v));
      else ctx.lineTo(xAt(i), yAt(v));
    });
    ctx.lineTo(xAt(reveal - 1), py + ph);
    ctx.lineTo(xAt(0), py + ph);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.beginPath();
    values.slice(0, reveal).forEach((v, i) => {
      if (i === 0) ctx.moveTo(xAt(i), yAt(v));
      else ctx.lineTo(xAt(i), yAt(v));
    });
    ctx.strokeStyle = theme.accent;
    ctx.lineWidth = 3 * Math.min(1.8, w / 720);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.shadowColor = theme.accent;
    ctx.shadowBlur = 9 * Math.min(1.8, w / 720);
    ctx.stroke();
    ctx.shadowBlur = 0;
    values.slice(0, reveal).forEach((v, i) => {
      ctx.fillStyle = "#F3FBFF";
      ctx.beginPath(); ctx.arc(xAt(i), yAt(v), 3.2 * Math.min(1.8, w / 720), 0, Math.PI * 2); ctx.fill();
    });
  } else {
    const gap = pw / values.length;
    values.slice(0, reveal).forEach((v, i) => {
      const wobble = Math.sin(i * 2.37 + 1) * 9;
      const open = clamp(v - wobble, 12, 86);
      const close = clamp(v + wobble * 0.82, 14, 88);
      const high = Math.min(96, Math.max(open, close) + 7 + (i % 3) * 2);
      const low = Math.max(4, Math.min(open, close) - 6 - (i % 2) * 2);
      const up = close >= open;
      const cx = px + gap * (i + 0.5);
      ctx.strokeStyle = up ? "#48D9A0" : "#F17B80";
      ctx.fillStyle = up ? "#37C995" : "#E96B78";
      ctx.lineWidth = Math.max(2, gap * 0.055);
      ctx.beginPath(); ctx.moveTo(cx, yAt(high)); ctx.lineTo(cx, yAt(low)); ctx.stroke();
      const top = Math.min(yAt(open), yAt(close));
      const bodyH = Math.max(5, Math.abs(yAt(open) - yAt(close)));
      ctx.globalAlpha = 0.9;
      ctx.fillRect(cx - gap * 0.19, top, gap * 0.38, bodyH);
      ctx.globalAlpha = 1;
    });
  }
  ctx.fillStyle = "rgba(209,227,239,.6)";
  ctx.font = "500 " + Math.round(8 * Math.min(1.8, w / 720)) + "px Arial";
  ctx.textAlign = "center";
  (plan.labels || []).slice(0, 4).forEach((label, i) => ctx.fillText(fitText(ctx, label, pw / 4, 16), px + pw * (i + 0.5) / Math.min(4, plan.labels!.length), py + ph + 19 * Math.min(1.8, w / 720)));
  const badge = candles ? "ILLUSTRATIVE PRICE ACTION · NOT LIVE DATA" : (plan.note || "CONCEPTUAL VISUAL · NOT A LIVE DATA FEED");
  drawText(ctx, badge, x + w * 0.075, y + h * 0.91, 7.8 * Math.min(1.8, w / 720), "#F0BE7B", 700, w * 0.86);
}

function drawCandlestick(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, plan: SceneVisualPlan, theme: Theme, time: number) {
  drawChart(ctx, x, y, w, h, plan, theme, time, true);
  const scale = Math.min(1.8, w / 720);
  const candleX = x + w * 0.78;
  const candleY = y + h * 0.22;
  ctx.save();
  ctx.fillStyle = "rgba(7,20,34,.94)";
  ctx.strokeStyle = "rgba(175,214,229,.3)";
  ctx.beginPath(); ctx.roundRect(candleX, candleY, w * 0.17, h * 0.48, 9 * scale); ctx.fill(); ctx.stroke();
  drawText(ctx, "CANDLE ANATOMY", candleX + 10 * scale, candleY + 16 * scale, 7 * scale, "#D7EAF5", 800, w * 0.15);
  const cx = candleX + w * 0.085;
  const top = candleY + h * 0.10;
  const bottom = candleY + h * 0.41;
  ctx.strokeStyle = theme.accent; ctx.lineWidth = 3 * scale;
  ctx.beginPath(); ctx.moveTo(cx, top); ctx.lineTo(cx, bottom); ctx.stroke();
  ctx.fillStyle = "#35C992";
  ctx.fillRect(cx - w * 0.018, candleY + h * 0.22, w * 0.036, h * 0.11);
  ctx.fillStyle = "#F5D9A4"; ctx.font = "700 " + Math.round(7 * scale) + "px Arial"; ctx.textAlign = "left";
  ctx.fillText("HIGH", candleX + 8 * scale, top + 2 * scale);
  ctx.fillText("OPEN", candleX + 8 * scale, candleY + h * 0.215);
  ctx.fillText("CLOSE", candleX + 8 * scale, candleY + h * 0.30);
  ctx.fillText("LOW", candleX + 8 * scale, bottom + 2 * scale);
  ctx.restore();
}

function drawDashboard(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, plan: SceneVisualPlan, theme: Theme, time: number) {
  const labels = (plan.labels?.length ? plan.labels : ["BUYERS", "SELLERS", "MARKET INDEX"]).slice(0, 4);
  const gap = w * 0.025;
  const cardW = (w * 0.86 - gap * (labels.length - 1)) / labels.length;
  const cardY = y + h * 0.2;
  labels.forEach((label, i) => {
    const cx = x + w * 0.07 + i * (cardW + gap);
    const cw = cardW;
    panel(ctx, cx, cardY, cw, h * 0.58, theme.accent);
    drawText(ctx, label.toUpperCase(), cx + cw * 0.09, cardY + h * 0.14, 9 * Math.min(1.8, w / 720), "#D9EAF4", 800, cw * 0.82);
    const rising = i !== 1;
    ctx.strokeStyle = rising ? theme.accent : "#F17B80";
    ctx.lineWidth = 2.6 * Math.min(1.8, w / 720);
    ctx.beginPath();
    for (let p = 0; p < 7; p += 1) {
      const xx = cx + cw * (0.10 + p * 0.13);
      const yy = cardY + h * (0.42 + 0.08 * Math.sin(p * 1.4 + time * 0.7 + i) + (rising ? -p * 0.012 : p * 0.012));
      if (p === 0) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy);
    }
    ctx.stroke();
    const status = i === 0 ? "DEMAND" : i === 1 ? "SUPPLY" : "TRACKER";
    drawText(ctx, status, cx + cw * 0.09, cardY + h * 0.51, 7 * Math.min(1.8, w / 720), i === 1 ? "#F3A1A5" : theme.secondary, 700, cw * 0.82);
  });
  drawText(ctx, plan.note || "Conceptual dashboard · no live prices", x + w * 0.075, y + h * 0.91, 7.8 * Math.min(1.8, w / 720), "#F0BE7B", 700, w * 0.85);
}

function drawSteps(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, plan: SceneVisualPlan, theme: Theme, time: number, timeline = false) {
  const items = (plan.steps?.length ? plan.steps : plan.labels?.length ? plan.labels : [plan.subject, "Key idea", "Outcome"]).slice(0, 5);
  const count = items.length;
  const left = x + w * 0.075;
  const right = x + w * 0.925;
  const lineY = y + h * (timeline ? 0.49 : 0.52);
  ctx.strokeStyle = "rgba(150,195,216,.42)";
  ctx.lineWidth = Math.max(2, w * 0.003);
  ctx.beginPath(); ctx.moveTo(left, lineY); ctx.lineTo(right, lineY); ctx.stroke();
  const progressX = left + (right - left) * ((time * 0.18) % 1);
  const sweep = ctx.createRadialGradient(progressX, lineY, 0, progressX, lineY, w * 0.075);
  sweep.addColorStop(0, "rgba(" + theme.glow + ",.4)");
  sweep.addColorStop(1, "rgba(" + theme.glow + ",0)");
  ctx.fillStyle = sweep; ctx.fillRect(left, lineY - h * 0.3, right - left, h * 0.6);
  items.forEach((item, i) => {
    const px = left + (right - left) * (count === 1 ? 0.5 : i / (count - 1));
    ctx.fillStyle = "rgba(8,28,45,.98)";
    ctx.strokeStyle = theme.accent;
    ctx.lineWidth = Math.max(2, w * 0.003);
    ctx.beginPath(); ctx.arc(px, lineY, w * 0.025, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = theme.secondary;
    ctx.font = "800 " + Math.round(9 * Math.min(1.8, w / 720)) + "px Arial";
    ctx.textAlign = "center";
    ctx.fillText(String(i + 1).padStart(2, "0"), px, lineY + 3 * Math.min(1.8, w / 720));
    const labelY = timeline ? lineY + h * 0.20 : lineY - h * 0.18;
    ctx.textAlign = "center";
    drawText(ctx, item, px - w * 0.075, labelY, 8.5 * Math.min(1.8, w / 720), "#EAF4FA", 700, w * 0.15);
    if (!timeline) {
      ctx.strokeStyle = "rgba(190,217,233,.35)";
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(px, lineY - h * 0.035); ctx.lineTo(px, lineY - h * 0.12); ctx.stroke();
    }
  });
}

function drawComparison(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, plan: SceneVisualPlan, theme: Theme) {
  const labels = (plan.labels?.length ? plan.labels : ["Option A", "Option B"]).slice(0, 4);
  const steps = (plan.steps?.length ? plan.steps : ["Different roles", "Different outcomes"]).slice(0, 4);
  const gap = w * 0.035;
  const cardW = (w * 0.84 - gap) / 2;
  for (let i = 0; i < 2; i += 1) {
    const cx = x + w * 0.08 + i * (cardW + gap);
    const cy = y + h * 0.20;
    panel(ctx, cx, cy, cardW, h * 0.58, i === 0 ? theme.accent : theme.secondary);
    ctx.fillStyle = i === 0 ? theme.accent : theme.secondary;
    ctx.beginPath(); ctx.roundRect(cx + cardW * 0.08, cy + h * 0.07, cardW * 0.84, h * 0.075, 7); ctx.fill();
    drawText(ctx, labels[i] || "Side " + (i + 1), cx + cardW * 0.12, cy + h * 0.125, 10 * Math.min(1.8, w / 720), "#081826", 800, cardW * 0.75);
    drawText(ctx, steps[i] || plan.subject, cx + cardW * 0.10, cy + h * 0.29, 8.5 * Math.min(1.8, w / 720), "#EAF4FA", 600, cardW * 0.78);
    ctx.strokeStyle = "rgba(205,230,244,.22)";
    ctx.beginPath(); ctx.moveTo(cx + cardW * 0.10, cy + h * 0.39); ctx.lineTo(cx + cardW * 0.90, cy + h * 0.39); ctx.stroke();
    drawText(ctx, i === 0 ? "PRIMARY FLOW" : "SECONDARY FLOW", cx + cardW * 0.10, cy + h * 0.50, 7 * Math.min(1.8, w / 720), i === 0 ? theme.accent : theme.secondary, 800, cardW * 0.78);
  }
}

function drawDiagram(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, plan: SceneVisualPlan, theme: Theme, time: number) {
  const labels = (plan.labels?.length ? plan.labels : ["Concept", "Input", "Action", "Outcome"]).slice(0, 4);
  const cx = x + w * 0.5;
  const cy = y + h * 0.51;
  const radius = Math.min(w * 0.32, h * 0.34);
  const nodes = labels.map((label, i) => {
    const angle = -Math.PI / 2 + i * Math.PI * 2 / labels.length + time * 0.035;
    return { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius * 0.72, label };
  });
  ctx.strokeStyle = "rgba(" + theme.glow + ",.65)";
  ctx.lineWidth = 2.5;
  nodes.forEach((node) => {
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(node.x, node.y); ctx.stroke();
  });
  nodes.forEach((node, i) => {
    panel(ctx, node.x - w * 0.11, node.y - h * 0.075, w * 0.22, h * 0.15, theme.accent);
    ctx.fillStyle = i % 2 ? theme.secondary : theme.accent;
    ctx.font = "800 " + Math.round(8.3 * Math.min(1.8, w / 720)) + "px Arial";
    ctx.textAlign = "center";
    ctx.fillText(fitText(ctx, node.label, w * 0.19, 24), node.x, node.y + 3 * Math.min(1.8, w / 720));
  });
  ctx.fillStyle = "#0B2D3D"; ctx.strokeStyle = theme.accent; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(cx, cy, w * 0.075, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = "#F4FAFF"; ctx.font = "800 " + Math.round(8 * Math.min(1.8, w / 720)) + "px Arial";
  ctx.textAlign = "center"; ctx.fillText("CORE", cx, cy + 3 * Math.min(1.8, w / 720));
}

function drawInfographic(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, plan: SceneVisualPlan, theme: Theme, time: number) {
  const labels = (plan.labels?.length ? plan.labels : ["Key idea", "Second factor", "Final result"]).slice(0, 5);
  const values = plan.values?.length ? plan.values : [82, 64, 48, 71, 55];
  const top = y + h * 0.21;
  const barH = h * 0.075;
  labels.forEach((label, i) => {
    const yy = top + i * h * 0.125;
    drawText(ctx, label, x + w * 0.10, yy + barH * 0.7, 8 * Math.min(1.8, w / 720), "#DAE9F3", 700, w * 0.27);
    ctx.fillStyle = "rgba(150,190,210,.14)";
    ctx.beginPath(); ctx.roundRect(x + w * 0.39, yy, w * 0.48, barH, barH * 0.5); ctx.fill();
    const amount = clamp(values[i % values.length], 8, 100) / 100;
    const reveal = smooth((time - i * 0.16) / 1.1);
    ctx.fillStyle = i % 2 ? theme.secondary : theme.accent;
    ctx.beginPath(); ctx.roundRect(x + w * 0.39, yy, w * 0.48 * amount * reveal, barH, barH * 0.5); ctx.fill();
  });
  drawText(ctx, plan.note || "Conceptual comparison · not measured data", x + w * 0.10, y + h * 0.91, 7.8 * Math.min(1.8, w / 720), "#F0BE7B", 700, w * 0.82);
}

/** Draws the AI director's scene-specific art direction in the same preview and MP4 path. */
export function drawSceneVisualPlan(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  plan: SceneVisualPlan,
  elapsed: number,
  isFinance = false,
): void {
  if (plan.layout === "hero" || plan.layout === "illustration") return;
  const theme = isFinance ? FINANCE : GENERAL;
  const scale = Math.min(width / 720, height / 405);
  const x = width * 0.075;
  const y = height * 0.17;
  const w = width * 0.85;
  const h = height * 0.45;
  panel(ctx, x, y, w, h, theme.accent);
  header(ctx, x + w * 0.035, y + h * 0.12, w * 0.93, plan, theme, scale);
  const graphicY = y + h * 0.31;
  const graphicH = h * 0.62;
  switch (plan.layout) {
    case "chart":
      drawChart(ctx, x, graphicY, w, graphicH, plan, theme, elapsed);
      break;
    case "candlestick":
      drawCandlestick(ctx, x, graphicY, w, graphicH, plan, theme, elapsed);
      break;
    case "dashboard":
      drawDashboard(ctx, x, graphicY, w, graphicH, plan, theme, elapsed);
      break;
    case "process":
      drawSteps(ctx, x, graphicY, w, graphicH, plan, theme, elapsed);
      break;
    case "timeline":
      drawSteps(ctx, x, graphicY, w, graphicH, plan, theme, elapsed, true);
      break;
    case "comparison":
      drawComparison(ctx, x, graphicY, w, graphicH, plan, theme);
      break;
    case "diagram":
      drawDiagram(ctx, x, graphicY, w, graphicH, plan, theme, elapsed);
      break;
    case "infographic":
      drawInfographic(ctx, x, graphicY, w, graphicH, plan, theme, elapsed);
      break;
    default:
      break;
  }
}
