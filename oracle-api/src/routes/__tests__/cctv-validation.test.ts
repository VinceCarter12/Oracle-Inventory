import { describe, expect, it } from "vitest";
import { hash, rejectSecrets, intervalsOverlap } from "../cctv";

describe("CCTV/NVR validation", () => {
  it("rejects secret-like keys, embedded credentials, and streaming URLs", () => {
    expect(rejectSecrets({ password: "x" })).toBe("password");
    expect(rejectSecrets({ notes: "rtsp://user:pass@example/cam" })).toBe("notes");
    expect(rejectSecrets({ notes: "physical entrance camera" })).toBeNull();
  });

  it("produces a stable payload hash for idempotency", () => {
    expect(hash({ cameraId: "cam-1", channelId: "ch-1" })).toBe(hash({ cameraId: "cam-1", channelId: "ch-1" }));
    expect(hash({ cameraId: "cam-1" })).not.toBe(hash({ cameraId: "cam-2" }));
  });

  it("detects open-ended and historical interval overlap", () => {
    expect(intervalsOverlap(new Date("2026-01-01"), null, new Date("2026-06-01"), null)).toBe(true);
    expect(intervalsOverlap(new Date("2026-01-01"), new Date("2026-02-01"), new Date("2026-02-01"), null)).toBe(false);
  });
});
