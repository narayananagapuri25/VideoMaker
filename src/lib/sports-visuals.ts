import type { Scene } from "../types";

export type SportsVisualKind = "stadium-action" | "captain-return" | "trophy-legacy" | "squad-moves" | "season-milestone" | "match-question";

const GOLD = "#F6BE62";
const TEAL = "#5DE0C0";
const WHITE = "#F4F8FC";
const MUTED = "rgba(226,239,247,.72)";

function sceneText(scene: Scene): string {
  return [scene.title, scene.narration, scene.caption, scene.visualPrompt, scene.visualPlan?.subject, scene.visualPlan?.headline, ...(scene.visualPlan?.labels || []), ...(scene.visualPlan?.steps || [])]
    .filter(Boolean).join(" ").toLowerCase();
}

export function getSportsVisualKind(scene: Scene, sceneIndex: number): SportsVisualKind {
  const text = sceneText(scene);
  if (sceneIndex === 0 && /hook|breaking news|opening|announcement/.test(text)) return "stadium-action";
  if (/five titles|five trophies|trophy|champion|championship|legacy|five unforgettable|five seasons|title wins/.test(text)) return "trophy-legacy";
  if (/arshdeep|hardik|trade|transfer|roster|squad|player move|joins|leaves|bowler joins/.test(text)) return "squad-moves";
  if (/20th|twentieth|landmark season|anniversary|milestone/.test(text)) return "season-milestone";
  if (/prediction|your prediction|final question|can .* bring|will .* win|comments/.test(text)) return "match-question";
  if (/captain|captaincy|leadership|return|back in charge|three years|comeback/.test(text)) return "captain-return";
  return sceneIndex === 0 ? "stadium-action" : sceneIndex % 2 ? "captain-return" : "match-question";
}

function stadium(ctx: CanvasRenderingContext2D, width: number, height: number, time: number) {
  const sky = ctx.createLinearGradient(0, 0, 0, height * 0.78);
  sky.addColorStop(0, "#071323");
  sky.addColorStop(0.45, "#102A3B");
  sky.addColorStop(1, "#08191F");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);

  const horizon = height * 0.49;
  ctx.fillStyle = "#0B1D2A";
  ctx.beginPath();
  ctx.moveTo(0, horizon + height * 0.02);
  ctx.quadraticCurveTo(width * 0.5, height * 0.22, width, horizon + height * 0.02);
  ctx.lineTo(width, height * 0.67);
  ctx.lineTo(0, height * 0.67);
  ctx.closePath();
  ctx.fill();

  // Stadium tiers and a crowd made from small, irregular light points.
  for (let row = 0; row < 5; row += 1) {
    const y = horizon + row * height * 0.027;
    ctx.strokeStyle = row % 2 ? "rgba(99,179,191,.28)" : "rgba(244,190,98,.22)";
    ctx.lineWidth = Math.max(2, width * 0.0025);
    ctx.beginPath();
    ctx.quadraticCurveTo(width * 0.5, y - height * 0.15, width, y + height * 0.018);
    ctx.stroke();
    for (let i = 0; i < 118; i += 1) {
      const x = (i / 117) * width + Math.sin(i * 12.7 + row * 4) * width * 0.004;
      const yy = y + Math.sin(i * 6.31 + row) * height * 0.008;
      ctx.fillStyle = i % 7 === 0 ? "rgba(246,190,98,.7)" : "rgba(195,224,232,.34)";
      ctx.beginPath();
      ctx.arc(x, yy, Math.max(1.2, width * 0.0018), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Four banks of floodlights with visible beams.
  const lights = [[width * 0.12, height * 0.16], [width * 0.88, height * 0.16]];
  lights.forEach(([x, y], index) => {
    const beam = ctx.createLinearGradient(x, y, width * (index ? 0.73 : 0.27), height * 0.62);
    beam.addColorStop(0, "rgba(228,247,255,.17)");
    beam.addColorStop(1, "rgba(228,247,255,0)");
    ctx.fillStyle = beam;
    ctx.beginPath();
    ctx.moveTo(x - width * 0.018, y);
    ctx.lineTo(x + width * 0.018, y);
    ctx.lineTo(width * (index ? 0.77 : 0.23), height * 0.62);
    ctx.lineTo(width * (index ? 0.55 : 0.45), height * 0.62);
    ctx.closePath();
    ctx.fill();
    ctx.shadowColor = "#E7F8FF";
    ctx.shadowBlur = width * 0.045;
    ctx.fillStyle = "#F5FCFF";
    for (let i = 0; i < 6; i += 1) {
      ctx.beginPath();
      ctx.arc(x + (i - 2.5) * width * 0.008, y, width * 0.004, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
  });

  // Oval outfield and central pitch.
  ctx.fillStyle = "#153F3A";
  ctx.beginPath();
  ctx.ellipse(width * 0.5, height * 0.78, width * 0.66, height * 0.29, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(133,220,184,.6)";
  ctx.lineWidth = Math.max(2, width * 0.003);
  ctx.beginPath();
  ctx.ellipse(width * 0.5, height * 0.78, width * 0.60, height * 0.25, 0, Math.PI, Math.PI * 2);
  ctx.stroke();
  const pitch = ctx.createLinearGradient(0, height * 0.55, 0, height * 0.92);
  pitch.addColorStop(0, "#BCA47A");
  pitch.addColorStop(1, "#6E6149");
  ctx.fillStyle = pitch;
  ctx.beginPath();
  ctx.moveTo(width * 0.455, height * 0.56);
  ctx.lineTo(width * 0.545, height * 0.56);
  ctx.lineTo(width * 0.59, height * 0.93);
  ctx.lineTo(width * 0.41, height * 0.93);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(255,246,218,.8)";
  ctx.lineWidth = Math.max(2, width * 0.002);
  ctx.beginPath();
  ctx.moveTo(width * 0.44, height * 0.61); ctx.lineTo(width * 0.56, height * 0.61);
  ctx.moveTo(width * 0.42, height * 0.88); ctx.lineTo(width * 0.58, height * 0.88);
  ctx.stroke();

  // Subtle moving boundary sweep.
  ctx.strokeStyle = "rgba(93,224,192,.4)";
  ctx.lineWidth = Math.max(2, width * 0.002);
  ctx.beginPath();
  ctx.ellipse(width * 0.5, height * 0.78, width * (0.58 + 0.012 * Math.sin(time * 0.35)), height * 0.235, 0, Math.PI * 1.04, Math.PI * 1.96);
  ctx.stroke();
}

function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, color = WHITE, align: CanvasTextAlign = "center") {
  ctx.save();
  ctx.font = "800 " + Math.round(size) + "px Arial";
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(0,0,0,.55)";
  ctx.shadowBlur = size * 0.25;
  ctx.fillStyle = color;
  ctx.fillText(text.toUpperCase().slice(0, 48), x, y, size * 14);
  ctx.restore();
}

function drawWickets(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number) {
  ctx.save();
  ctx.strokeStyle = "#F0E4C7";
  ctx.lineWidth = Math.max(3, scale * 0.055);
  for (let i = -1; i <= 1; i += 1) {
    ctx.beginPath(); ctx.moveTo(x + i * scale * 0.12, y); ctx.lineTo(x + i * scale * 0.12, y - scale * 0.88); ctx.stroke();
  }
  ctx.lineWidth = Math.max(3, scale * 0.045);
  ctx.beginPath(); ctx.moveTo(x - scale * 0.18, y - scale * 0.9); ctx.lineTo(x + scale * 0.18, y - scale * 0.9); ctx.stroke();
  ctx.restore();
}

function drawBattingSilhouette(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number, swing: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = "#07111A";
  ctx.strokeStyle = "#07111A";
  ctx.lineWidth = scale * 0.16;
  ctx.lineCap = "round";
  // helmet and head
  ctx.beginPath(); ctx.arc(0, -scale * 1.8, scale * 0.26, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(0, -scale * 1.91, scale * 0.31, Math.PI, Math.PI * 2); ctx.fill();
  // torso and legs
  ctx.lineWidth = scale * 0.34;
  ctx.beginPath(); ctx.moveTo(0, -scale * 1.5); ctx.lineTo(-scale * 0.08, -scale * 0.76); ctx.stroke();
  ctx.lineWidth = scale * 0.24;
  ctx.beginPath(); ctx.moveTo(-scale * 0.08, -scale * 0.8); ctx.lineTo(-scale * 0.38, 0); ctx.moveTo(-scale * 0.08, -scale * 0.8); ctx.lineTo(scale * 0.38, 0); ctx.stroke();
  // arms and bat in a follow-through position
  const shoulderX = -scale * 0.02, shoulderY = -scale * 1.38;
  ctx.lineWidth = scale * 0.19;
  ctx.beginPath();
  ctx.moveTo(shoulderX, shoulderY);
  ctx.lineTo(scale * 0.46, -scale * 1.53);
  ctx.lineTo(scale * (0.62 + swing * 0.08), -scale * 1.84);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(shoulderX, shoulderY + scale * 0.08);
  ctx.lineTo(-scale * 0.36, -scale * 1.06);
  ctx.stroke();
  ctx.save();
  ctx.translate(scale * (0.64 + swing * 0.08), -scale * 1.9);
  ctx.rotate(-0.66 + swing * 0.08);
  ctx.fillStyle = "#DABF8C";
  ctx.beginPath();
  ctx.roundRect(-scale * 0.055, -scale * 1.05, scale * 0.11, scale * 1.26, scale * 0.05);
  ctx.fill();
  ctx.restore();
  ctx.restore();
}

function drawBall(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, time: number) {
  ctx.save();
  ctx.shadowColor = "#FF8C68";
  ctx.shadowBlur = radius * 1.4;
  const gradient = ctx.createRadialGradient(x - radius * 0.32, y - radius * 0.35, radius * 0.05, x, y, radius);
  gradient.addColorStop(0, "#FFD0B3");
  gradient.addColorStop(0.45, "#E95848");
  gradient.addColorStop(1, "#7D1E28");
  ctx.fillStyle = gradient;
  ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "rgba(255,247,225,.9)";
  ctx.lineWidth = Math.max(1.5, radius * 0.07);
  ctx.beginPath();
  ctx.ellipse(x, y, radius * 0.42, radius * 0.92, Math.sin(time) * 0.5, -0.75, 0.75);
  ctx.stroke();
  ctx.restore();
}

function drawCaptain(ctx: CanvasRenderingContext2D, width: number, height: number, time: number, scene: Scene) {
  const x = width * 0.51, y = height * 0.69;
  const scale = width * 0.15;
  // Walk-out silhouette: intentionally generic, not a fabricated likeness of the real player.
  ctx.save();
  ctx.fillStyle = "#07121B";
  ctx.strokeStyle = "#07121B";
  ctx.lineCap = "round";
  ctx.beginPath(); ctx.arc(x, y - scale * 2.0, scale * 0.28, 0, Math.PI * 2); ctx.fill();
  ctx.fillRect(x - scale * 0.27, y - scale * 1.78, scale * 0.54, scale * 0.9);
  ctx.lineWidth = scale * 0.2;
  const stride = Math.sin(time * 1.8) * scale * 0.1;
  ctx.beginPath();
  ctx.moveTo(x - scale * 0.08, y - scale * 0.95); ctx.lineTo(x - scale * 0.22 + stride, y);
  ctx.moveTo(x + scale * 0.08, y - scale * 0.95); ctx.lineTo(x + scale * 0.24 - stride, y);
  ctx.moveTo(x - scale * 0.18, y - scale * 1.55); ctx.lineTo(x - scale * 0.48, y - scale * 0.88);
  ctx.moveTo(x + scale * 0.18, y - scale * 1.55); ctx.lineTo(x + scale * 0.52, y - scale * 1.14);
  ctx.stroke();
  // Bat carried beside the player.
  ctx.strokeStyle = "#D9BB82"; ctx.lineWidth = scale * 0.075;
  ctx.beginPath(); ctx.moveTo(x + scale * 0.54, y - scale * 1.08); ctx.lineTo(x + scale * 0.77, y - scale * 0.05); ctx.stroke();
  ctx.restore();
  label(ctx, "THE CAPTAIN RETURNS", width * 0.5, height * 0.21, width * 0.042, GOLD);
  const name = /rohit/.test(sceneText(scene)) ? "ROHIT SHARMA" : "THE CAPTAIN";
  label(ctx, name, width * 0.5, height * 0.28, width * 0.07, WHITE);
  // A field-entry light flare.
  const flareX = width * (0.18 + 0.64 * ((time * 0.05) % 1));
  const flare = ctx.createRadialGradient(flareX, height * 0.42, 0, flareX, height * 0.42, width * 0.18);
  flare.addColorStop(0, "rgba(246,190,98,.24)");
  flare.addColorStop(1, "rgba(246,190,98,0)");
  ctx.fillStyle = flare;
  ctx.fillRect(flareX - width * 0.2, height * 0.22, width * 0.4, height * 0.42);
}

function drawTrophies(ctx: CanvasRenderingContext2D, width: number, height: number, scene: Scene, time: number) {
  label(ctx, "FIVE CHAMPIONSHIP SEASONS", width * 0.5, height * 0.20, width * 0.038, GOLD);
  const labels = scene.visualPlan?.labels?.filter(Boolean).slice(0, 5) || [];
  const count = 5;
  const start = width * 0.16;
  const gap = width * 0.17;
  for (let i = 0; i < count; i += 1) {
    const x = start + gap * i;
    const scale = width * (i === 2 ? 0.12 : 0.105);
    const rise = Math.sin(time * 1.2 + i * 0.7) * width * 0.006;
    ctx.save();
    ctx.translate(x, height * 0.56 - rise);
    ctx.shadowColor = GOLD; ctx.shadowBlur = width * 0.028;
    const gold = ctx.createLinearGradient(-scale * 0.4, 0, scale * 0.4, 0);
    gold.addColorStop(0, "#9C6A28"); gold.addColorStop(0.5, "#FFF0B0"); gold.addColorStop(1, "#B77B31");
    ctx.fillStyle = gold;
    ctx.beginPath();
    ctx.moveTo(-scale * 0.33, -scale * 0.68);
    ctx.quadraticCurveTo(-scale * 0.55, -scale * 0.26, -scale * 0.22, -scale * 0.13);
    ctx.lineTo(-scale * 0.14, scale * 0.1);
    ctx.lineTo(scale * 0.14, scale * 0.1);
    ctx.lineTo(scale * 0.22, -scale * 0.13);
    ctx.quadraticCurveTo(scale * 0.55, -scale * 0.26, scale * 0.33, -scale * 0.68);
    ctx.quadraticCurveTo(0, -scale * 0.5, -scale * 0.33, -scale * 0.68);
    ctx.closePath(); ctx.fill();
    ctx.fillRect(-scale * 0.08, scale * 0.08, scale * 0.16, scale * 0.24);
    ctx.fillRect(-scale * 0.29, scale * 0.31, scale * 0.58, scale * 0.09);
    ctx.restore();
    if (labels[i]) label(ctx, labels[i], x, height * 0.72, width * 0.025, MUTED);
    else label(ctx, String(i + 1).padStart(2, "0"), x, height * 0.72, width * 0.026, MUTED);
  }
  label(ctx, "ONE ERA · FIVE TITLES", width * 0.5, height * 0.82, width * 0.031, WHITE);
}

function drawSquadMoves(ctx: CanvasRenderingContext2D, width: number, height: number, scene: Scene, time: number) {
  label(ctx, "THE SQUAD SHIFTS", width * 0.5, height * 0.20, width * 0.043, GOLD);
  const full = sceneText(scene);
  const hasHardik = full.includes("hardik pandya");
  const hasArshdeep = full.includes("arshdeep singh");
  const cards = hasHardik && hasArshdeep
    ? [
        { x: width * 0.27, name: "HARDIK PANDYA", team: "PUNJAB KINGS", color: "#D7A0A0" },
        { x: width * 0.73, name: "ARSHDEEP SINGH", team: "MUMBAI INDIANS", color: TEAL },
      ]
    : hasArshdeep
      ? [
          { x: width * 0.27, name: "NEW BOWLING OPTION", team: "MUMBAI INDIANS", color: TEAL },
          { x: width * 0.73, name: "ARSHDEEP SINGH", team: "JOINS THE SQUAD", color: GOLD },
        ]
      : [
          { x: width * 0.27, name: "SQUAD UPDATE", team: "OUTGOING", color: "#D7A0A0" },
          { x: width * 0.73, name: "NEW ARRIVAL", team: "INCOMING", color: TEAL },
        ];
  cards.forEach((card) => {
    const x = card.x, y = height * 0.53;
    ctx.save();
    ctx.fillStyle = "rgba(6,19,31,.86)";
    ctx.strokeStyle = card.color;
    ctx.lineWidth = Math.max(2, width * 0.003);
    ctx.beginPath(); ctx.roundRect(x - width * 0.20, y - height * 0.15, width * 0.40, height * 0.31, width * 0.025); ctx.fill(); ctx.stroke();
    // Original jersey-shaped icon, not a copied club logo or kit.
    ctx.fillStyle = card.color;
    ctx.beginPath();
    ctx.moveTo(x - width * 0.065, y - height * 0.10);
    ctx.lineTo(x - width * 0.13, y - height * 0.04);
    ctx.lineTo(x - width * 0.09, y + height * 0.07);
    ctx.lineTo(x - width * 0.055, y + height * 0.045);
    ctx.lineTo(x - width * 0.055, y + height * 0.11);
    ctx.lineTo(x + width * 0.055, y + height * 0.11);
    ctx.lineTo(x + width * 0.055, y + height * 0.045);
    ctx.lineTo(x + width * 0.09, y + height * 0.07);
    ctx.lineTo(x + width * 0.13, y - height * 0.04);
    ctx.lineTo(x + width * 0.065, y - height * 0.10);
    ctx.closePath(); ctx.fill();
    label(ctx, card.name, x, y + height * 0.205, width * 0.024, WHITE);
    label(ctx, card.team, x, y + height * 0.245, width * 0.018, MUTED);
    ctx.restore();
  });
  const midX = width * 0.5, midY = height * 0.54;
  ctx.save();
  ctx.strokeStyle = GOLD; ctx.lineWidth = Math.max(4, width * 0.009);
  ctx.beginPath(); ctx.moveTo(width * 0.40, midY); ctx.lineTo(width * 0.60, midY); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(width * 0.565, midY - width * 0.04); ctx.lineTo(width * 0.61, midY); ctx.lineTo(width * 0.565, midY + width * 0.04); ctx.stroke();
  const pulse = 0.65 + Math.sin(time * 3) * 0.25;
  ctx.globalAlpha = pulse;
  ctx.fillStyle = GOLD; ctx.beginPath(); ctx.arc(midX, midY, width * 0.014, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawMilestone(ctx: CanvasRenderingContext2D, width: number, height: number, time: number) {
  label(ctx, "A LANDMARK CAMPAIGN", width * 0.5, height * 0.20, width * 0.04, GOLD);
  ctx.save();
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.font = "900 " + Math.round(width * 0.46) + "px Arial";
  ctx.shadowColor = TEAL; ctx.shadowBlur = width * 0.07;
  ctx.lineWidth = width * 0.009; ctx.strokeStyle = "rgba(93,224,192,.92)";
  ctx.strokeText("20", width * 0.5, height * 0.55);
  ctx.fillStyle = "rgba(93,224,192,.09)"; ctx.fillText("20", width * 0.5, height * 0.55);
  ctx.restore();
  label(ctx, "IPL SEASON", width * 0.5, height * 0.73, width * 0.045, WHITE);
  label(ctx, "ONE FRANCHISE · TWO DECADES OF CRICKET", width * 0.5, height * 0.80, width * 0.022, MUTED);
  // The pitch and wickets provide cricket context behind the number.
  drawWickets(ctx, width * 0.5, height * 0.92, width * 0.055);
}

function drawQuestion(ctx: CanvasRenderingContext2D, width: number, height: number, scene: Scene, time: number) {
  label(ctx, "THE NEXT CHAPTER", width * 0.5, height * 0.20, width * 0.04, GOLD);
  drawWickets(ctx, width * 0.74, height * 0.75, width * 0.12);
  drawBattingSilhouette(ctx, width * 0.31, height * 0.79, width * 0.14, time);
  const startX = width * 0.28, startY = height * 0.42;
  const endX = width * (0.56 + 0.05 * Math.sin(time * 0.8)), endY = height * 0.32;
  ctx.save();
  ctx.strokeStyle = "rgba(255,232,196,.72)"; ctx.lineWidth = width * 0.003;
  ctx.setLineDash([width * 0.012, width * 0.012]);
  ctx.beginPath(); ctx.moveTo(startX, startY); ctx.quadraticCurveTo(width * 0.42, height * 0.18, endX, endY); ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
  drawBall(ctx, endX, endY, width * 0.035, time);
  label(ctx, "CAN THEY MAKE HISTORY AGAIN?", width * 0.5, height * 0.88, width * 0.032, WHITE);
}

function drawAction(ctx: CanvasRenderingContext2D, width: number, height: number, time: number) {
  label(ctx, "THE GAME CHANGES HERE", width * 0.5, height * 0.20, width * 0.042, GOLD);
  drawBattingSilhouette(ctx, width * 0.49, height * 0.76, width * 0.19, time);
  const ballX = width * (0.2 + 0.56 * ((time * 0.13) % 1));
  const ballY = height * (0.33 + Math.sin(time * 1.8) * 0.035);
  drawBall(ctx, ballX, ballY, width * 0.028, time);
  drawWickets(ctx, width * 0.75, height * 0.87, width * 0.075);
  label(ctx, "UNDER THE LIGHTS", width * 0.5, height * 0.94, width * 0.023, MUTED);
}

export function drawSportsScene(ctx: CanvasRenderingContext2D, width: number, height: number, scene: Scene, elapsed: number, sceneIndex: number): void {
  stadium(ctx, width, height, elapsed);
  const kind = getSportsVisualKind(scene, sceneIndex);
  switch (kind) {
    case "captain-return": drawCaptain(ctx, width, height, elapsed, scene); break;
    case "trophy-legacy": drawTrophies(ctx, width, height, scene, elapsed); break;
    case "squad-moves": drawSquadMoves(ctx, width, height, scene, elapsed); break;
    case "season-milestone": drawMilestone(ctx, width, height, elapsed); break;
    case "match-question": drawQuestion(ctx, width, height, scene, elapsed); break;
    default: drawAction(ctx, width, height, elapsed); break;
  }
}
