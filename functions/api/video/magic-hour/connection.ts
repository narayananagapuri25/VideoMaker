import {
  checkSameOrigin,
  getMagicHourAccount,
  jsonNoStore,
  requireMagicHourKey,
  type MagicHourAccount,
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
      ? "Magic Hour API connected on the Free tier. LTX 2.5 and MiniMax H3 are available at 480p; credit balance is checked before every clip."
      : "Magic Hour API connected. The account is not on the Free tier; VideoMaker will still use only the free-plan models at 480p.",
  });
}
