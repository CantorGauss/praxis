export type FrameScheduler = (callback: FrameRequestCallback) => number;
export type FrameCanceller = (handle: number) => void;

/**
 * Regroupe une rafale de notifications en une seule publication par frame.
 * `flush` publie immédiatement la dernière valeur avant une fin de flux.
 */
export function createFrameBatcher(
  publish: () => void,
  schedule: FrameScheduler = (callback) => requestAnimationFrame(callback),
  cancel: FrameCanceller = (handle) => cancelAnimationFrame(handle),
) {
  let scheduledFrame: number | null = null;

  return {
    schedule(): void {
      if (scheduledFrame !== null) return;
      scheduledFrame = schedule(() => {
        scheduledFrame = null;
        publish();
      });
    },

    flush(): void {
      if (scheduledFrame !== null) {
        cancel(scheduledFrame);
        scheduledFrame = null;
      }
      publish();
    },

    cancel(): void {
      if (scheduledFrame === null) return;
      cancel(scheduledFrame);
      scheduledFrame = null;
    },
  };
}
