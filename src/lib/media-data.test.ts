import { describe, expect, it } from "vitest";
import {
  getEmbeddedAudioSize,
  getEmbeddedImageSize,
  isSupportedImageMimeType,
  MAX_NARRATION_AUDIO_BYTES,
  MAX_SCENE_IMAGE_BYTES,
} from "./media-data";

describe("embedded project media validation", () => {
  it("accepts supported embedded raster image data URLs and measures their size", () => {
    expect(getEmbeddedImageSize("data:image/png;base64,iVBORw0KGgo=")).toBe(8);
    expect(getEmbeddedImageSize("data:image/jpeg;base64,/9j/4AA=")).toBe(5);
  });

  it("rejects remote URLs, SVGs, invalid base64 and non-image payloads", () => {
    expect(getEmbeddedImageSize("https://example.com/tracker.png")).toBeNull();
    expect(getEmbeddedImageSize("data:image/svg+xml;base64,PHN2Zz4=")).toBeNull();
    expect(getEmbeddedImageSize("data:image/png,not-base64")).toBeNull();
    expect(getEmbeddedImageSize("data:audio/wav;base64,YWJj")).toBeNull();
    expect(isSupportedImageMimeType("image/svg+xml")).toBe(false);
  });

  it("accepts embedded audio (including codec parameters) and rejects remote URLs", () => {
    expect(getEmbeddedAudioSize("data:audio/webm;codecs=opus;base64,YWJj")).toBe(3);
    expect(getEmbeddedAudioSize("https://example.com/audio.wav")).toBeNull();
    expect(getEmbeddedAudioSize("data:text/html;base64,YWJj")).toBeNull();
  });

  it("defines caps that match the upload controls", () => {
    expect(MAX_SCENE_IMAGE_BYTES).toBe(12 * 1024 * 1024);
    expect(MAX_NARRATION_AUDIO_BYTES).toBe(30 * 1024 * 1024);
  });
});
