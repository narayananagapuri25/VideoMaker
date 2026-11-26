import { describe, expect, it } from "vitest";
import {
  getEmbeddedAudioSize,
  getEmbeddedImageSize,
  getEmbeddedVideoSize,
  getProjectMediaSize,
  isSupportedImageMimeType,
  MAX_NARRATION_AUDIO_BYTES,
  MAX_PROJECT_MEDIA_BYTES,
  MAX_SCENE_IMAGE_BYTES,
} from "./media-data";

describe("embedded project media validation", () => {
  it("accepts supported embedded image data URLs with matching file signatures", () => {
    expect(getEmbeddedImageSize("data:image/png;base64,iVBORw0KGgo=")).toBe(8);
    expect(getEmbeddedImageSize("data:image/jpeg;base64,/9j/4AA=")).toBe(5);
  });

  it("rejects remote URLs, SVGs, spoofed MIME types, invalid base64 and non-image payloads", () => {
    expect(getEmbeddedImageSize("https://example.com/tracker.png")).toBeNull();
    expect(getEmbeddedImageSize("data:image/svg+xml;base64,PHN2Zz4=")).toBeNull();
    expect(getEmbeddedImageSize("data:image/png,not-base64")).toBeNull();
    expect(getEmbeddedImageSize("data:image/png;base64,SGVsbG8=")).toBeNull();
    expect(getEmbeddedImageSize("data:audio/wav;base64,YWJj")).toBeNull();
    expect(isSupportedImageMimeType("image/svg+xml")).toBe(false);
  });

  it("accepts embedded audio (including codec parameters) and rejects remote URLs", () => {
    expect(getEmbeddedAudioSize("data:audio/webm;codecs=opus;base64,YWJj")).toBe(3);
    expect(getEmbeddedAudioSize("https://example.com/audio.wav")).toBeNull();
    expect(getEmbeddedAudioSize("data:text/html;base64,YWJj")).toBeNull();
  });

  it("accepts valid embedded MP4 and WebM containers and rejects spoofed media", () => {
    const mp4Header = String.fromCharCode(0, 0, 0, 24, 102, 116, 121, 112, 105, 115, 111, 109);
    const webmHeader = String.fromCharCode(26, 69, 223, 163, 159);
    expect(getEmbeddedVideoSize("data:video/mp4;base64," + btoa(mp4Header))).toBe(mp4Header.length);
    expect(getEmbeddedVideoSize("data:video/webm;base64," + btoa(webmHeader))).toBe(webmHeader.length);
    expect(getEmbeddedVideoSize("data:video/mp4;base64,SGVsbG8=")).toBeNull();
    expect(getEmbeddedVideoSize("https://example.com/video.mp4")).toBeNull();
  });

  it("tracks the aggregate size of embedded media and supports replacement accounting", () => {
    const images = [{
      id: "scene-1", title: "A", narration: "", caption: "", visualPrompt: "", duration: 5,
      imageDataUrl: "data:image/png;base64,iVBORw0KGgo=",
    }];
    const audio = "data:audio/wav;base64,YWJj";
    expect(getProjectMediaSize(images, audio)).toBe(11);
    expect(getProjectMediaSize(images, audio, "scene-1", true)).toBe(0);
    const videoScene = {
      ...images[0],
      videoDataUrl: "data:video/mp4;base64," + btoa(String.fromCharCode(0, 0, 0, 24, 102, 116, 121, 112, 105, 115, 111, 109)),
    };
    const videoBytes = 12;
    expect(getProjectMediaSize([videoScene], audio)).toBe(videoScene.imageDataUrl.length > 0 ? 8 + videoBytes + 3 : videoBytes + 3);
    expect(getProjectMediaSize([videoScene], audio, undefined, false, "scene-1")).toBe(11);
    expect(MAX_PROJECT_MEDIA_BYTES).toBe(64 * 1024 * 1024);
  });

  it("defines upload caps", () => {
    expect(MAX_SCENE_IMAGE_BYTES).toBe(12 * 1024 * 1024);
    expect(MAX_NARRATION_AUDIO_BYTES).toBe(30 * 1024 * 1024);
  });
});
