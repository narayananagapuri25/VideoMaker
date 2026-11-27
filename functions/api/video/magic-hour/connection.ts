import {
  checkSameOrigin,
  getMagicHourAccount,
  jsonNoStore,
  requireMagicHourKey,
} from "./_shared";

export async function onRequestPost({ request }: { request: Request }): Promise<Response> {
  const originError = checkSameOrigin(request);
  if (originError) return originError;
  const key = requireMagicHourKey(request);
  if (key instanceof Response) return key;
  const account = await getMagicHourAccount(key);
  if (account instanceof Response) return account;

  const freeTier = account.tier === "free" && account.subscription === null;
  const creditsPerSecond = 24;
  return jsonNoStore({
    connected: true,
    tier: account.tier,
    credits: account.credits,
    freeTier,
    freeModelAccess: ["ltx-2.5", "minimax-h3"],
    preferredModel: "ltx-2.5",
    resolution: "480p",
    creditsPerSecond,
    affordableSecondsAt480p: Math.floor(account.credits / creditsPerSecond),
    estimatedFiveSecondClipCredits: creditsPerSecond * 5,
    commercialUse: freeTier ? "personal-non-commercial-only" : "check-current-plan-terms",
    message: freeTier
      ? "Magic Hour API connected on the Free tier. LTX-2.5 at 480p is tried first; MiniMax H3 is the free-model fallback after a safe model rejection or refunded failed job. The live credit balance is checked before every clip."
      : "Magic Hour API connected. The account does not have a verified Free plan without an active subscription; no API video generation will be submitted.",
  });
}
