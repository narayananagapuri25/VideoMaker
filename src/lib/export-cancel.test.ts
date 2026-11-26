import { describe, expect, it } from "vitest";
import { createExportAbortError, isExportAbortError, throwIfExportAborted } from "./export-cancel";

describe("MP4 export cancellation helpers", () => {
  it("creates a standard abort error with a clear message", () => {
    const error = createExportAbortError();
    expect(error.name).toBe("AbortError");
    expect(error.message).toBe("MP4 export canceled.");
  });

  it("identifies abort errors without masking ordinary renderer failures", () => {
    expect(isExportAbortError(createExportAbortError())).toBe(true);
    expect(isExportAbortError(new Error("Encoder failed"))).toBe(false);
    expect(isExportAbortError("aborted")).toBe(false);
  });

  it("throws only after the supplied signal has been aborted", () => {
    const controller = new AbortController();
    expect(() => throwIfExportAborted(controller.signal)).not.toThrow();
    controller.abort();
    expect(() => throwIfExportAborted(controller.signal)).toThrow("MP4 export canceled.");
  });
});
