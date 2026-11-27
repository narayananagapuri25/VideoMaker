import { describe, expect, it } from "vitest";
import { getVideoFileExtension, shouldUseWebmFallback } from "./export-format";

describe("browser video export format selection", () => {
  it("keeps MP4 when all required MP4 encoders are available", () => {
    expect(shouldUseWebmFallback(true, true, true)).toBe(false);
    expect(shouldUseWebmFallback(true, false, false)).toBe(false);
  });

  it("falls back when the MP4 video encoder is unavailable", () => {
    expect(shouldUseWebmFallback(false, true, false)).toBe(true);
  });

  it("falls back when the local soundtrack is required but MP4 audio encoding is unavailable", () => {
    expect(shouldUseWebmFallback(true, false, true)).toBe(true);
  });

  it("uses the real MIME type to determine the downloaded file extension", () => {
    expect(getVideoFileExtension("video/mp4")).toBe("mp4");
    expect(getVideoFileExtension("video/webm;codecs=vp9,opus")).toBe("webm");
    expect(getVideoFileExtension("VIDEO/WEBM")).toBe("webm");
  });
});
