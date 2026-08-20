import { describe, expect, it, vi } from "vitest";
import { createFrameBatcher, type FrameScheduler } from "../frameBatcher";

describe("createFrameBatcher", () => {
  it("publishes a burst only once on the next frame", () => {
    const callbacks: FrameRequestCallback[] = [];
    const publish = vi.fn();
    const schedule: FrameScheduler = (callback) => {
      callbacks.push(callback);
      return callbacks.length;
    };
    const batcher = createFrameBatcher(publish, schedule, vi.fn());

    batcher.schedule();
    batcher.schedule();
    batcher.schedule();

    expect(callbacks).toHaveLength(1);
    expect(publish).not.toHaveBeenCalled();
    callbacks[0](0);
    expect(publish).toHaveBeenCalledTimes(1);
  });

  it("flushes immediately and cancels the pending frame", () => {
    const publish = vi.fn();
    const cancel = vi.fn();
    const batcher = createFrameBatcher(publish, () => 42, cancel);

    batcher.schedule();
    batcher.flush();

    expect(cancel).toHaveBeenCalledWith(42);
    expect(publish).toHaveBeenCalledTimes(1);
  });
});
