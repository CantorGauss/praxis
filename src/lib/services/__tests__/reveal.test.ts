import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRevealer, revealPause } from "../reveal";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function track() {
  const frames: string[] = [];
  return { frames, publish: (text: string) => frames.push(text), last: () => frames[frames.length - 1] ?? "" };
}

describe("revealPause", () => {
  it("respire aux fins de phrase et aux virgules, pas dans un nombre ni des points de suspension", () => {
    expect(revealPause("a", "b")).toBe(0);
    expect(revealPause(".", " ")).toBeGreaterThan(300);
    expect(revealPause(".", undefined)).toBeGreaterThan(300);
    expect(revealPause(".", ".")).toBe(0);
    expect(revealPause(".", "5")).toBe(0);
    expect(revealPause(",", " ")).toBeGreaterThan(100);
    expect(revealPause(",", " ")).toBeLessThan(revealPause(".", " "));
    expect(revealPause("\n", "A")).toBeGreaterThan(300);
  });
});

describe("createRevealer", () => {
  it("montre le texte au rythme demandé, même s'il est arrivé d'un coup", async () => {
    const out = track();
    const revealer = createRevealer(out.publish, 20);
    revealer.update("abcdefghijklmnopqrst"); // 20 caractères : une seconde
    await vi.advanceTimersByTimeAsync(500);
    expect(out.last().length).toBeGreaterThan(5);
    expect(out.last().length).toBeLessThan(15);
    await vi.advanceTimersByTimeAsync(600);
    expect(out.last()).toBe("abcdefghijklmnopqrst");
  });

  it("marque la respiration après le point, une fois celui-ci affiché", async () => {
    const out = track();
    const revealer = createRevealer(out.publish, 50); // 20 ms par caractère
    revealer.update("Oui. Non");
    await vi.advanceTimersByTimeAsync(200);
    expect(out.last()).toBe("Oui.");
    await vi.advanceTimersByTimeAsync(250);
    expect(out.last()).toBe("Oui.");
    await vi.advanceTimersByTimeAsync(400);
    expect(out.last()).toBe("Oui. Non");
  });

  it("drain attend la fin de l'affichage, skip la donne tout de suite", async () => {
    const out = track();
    const revealer = createRevealer(out.publish, 10);
    revealer.update("Une réplique assez longue pour prendre du temps.");
    let drained = false;
    void revealer.drain().then(() => (drained = true));
    await vi.advanceTimersByTimeAsync(1000);
    expect(drained).toBe(false);
    revealer.skip();
    await vi.advanceTimersByTimeAsync(0);
    expect(drained).toBe(true);
    expect(out.last()).toBe("Une réplique assez longue pour prendre du temps.");
  });

  it("un modèle plus lent que la lecture n'est pas freiné et ne provoque pas de rafale", async () => {
    const out = track();
    const revealer = createRevealer(out.publish, 20);
    revealer.update("ab");
    await vi.advanceTimersByTimeAsync(200);
    expect(out.last()).toBe("ab");
    // Longue attente du modèle : le crédit de lecture ne s'accumule pas.
    await vi.advanceTimersByTimeAsync(5000);
    revealer.update("abcdefghijklmnopqrstuvwxyz");
    await vi.advanceTimersByTimeAsync(80);
    expect(out.last().length).toBeLessThan(6);
  });

  it("ne coupe jamais un emoji en deux", async () => {
    const out = track();
    const revealer = createRevealer(out.publish, 25);
    revealer.update("a🎭b🎭c🎭d");
    for (let i = 0; i < 20; i++) await vi.advanceTimersByTimeAsync(40);
    for (const frame of out.frames) {
      const lastCode = frame.charCodeAt(frame.length - 1);
      expect(lastCode >= 0xd800 && lastCode <= 0xdbff).toBe(false);
    }
    expect(out.last()).toBe("a🎭b🎭c🎭d");
  });

  it("en vitesse instantanée, tout passe sans minuterie", async () => {
    const out = track();
    const revealer = createRevealer(out.publish, 0);
    revealer.update("tout de suite");
    expect(out.last()).toBe("tout de suite");
    await expect(revealer.drain()).resolves.toBeUndefined();
  });
});
