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

  const freeTier = account.tier === "free";
  const creditsPerSecond = 24;
  return jsonNoStore({
    connected: true,
    tier: account.tier,
    credits: account.credits,
    freeTier,
    freeModelAccess: ["default (LTX-2.5 on Free)", "minimax-h3"],
    preferredModel: "default",
    resolution: "480p",
    creditsPerSecond,
    affordableSecondsAt480p: Math.floor(account.credits / creditsPerSecond),
    estimatedFiveSecondClipCredits: creditsPerSecond * 5,
    commercialUse: freeTier ? "personal-non-commercial-only" : "check-current-plan-terms",
    message: freeTier
      ? "Magic Hour API connected on the Free tier. The API selects LTX-2.5 automatically at 480p; MiniMax H3 is tried only as a fallback. The live credit balance is checked before every clip."
      : "Magic Hour API connected. The account is not on the Free tier; VideoMaker will still use only the free-plan models at 480p.",
  });
}
