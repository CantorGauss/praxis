import { describe, expect, it, vi } from "vitest";
import { backdrop } from "../backdrop";

// Le helper ne lit que `target` et `currentTarget` : des objets suffisent.
const FOND = { id: "fond" };
const CHAMP = { id: "champ" };

function event(target: unknown): MouseEvent {
  return { target, currentTarget: FOND } as unknown as MouseEvent;
}

describe("backdrop", () => {
  it("ferme quand le clic commence et finit sur le fond", () => {
    const close = vi.fn();
    const h = backdrop(close);
    h.onmousedown(event(FOND));
    h.onclick(event(FOND));
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("ne ferme pas quand une sélection démarre dans un champ et se termine sur le fond", () => {
    // Le geste signalé : le `click` cible alors l'ancêtre commun, c'est-à-dire
    // le fond lui-même, alors que l'utilisateur sélectionnait du texte.
    const close = vi.fn();
    const h = backdrop(close);
    h.onmousedown(event(CHAMP));
    h.onclick(event(FOND));
    expect(close).not.toHaveBeenCalled();
  });

  it("ne ferme pas sur un clic à l'intérieur de la boîte", () => {
    const close = vi.fn();
    const h = backdrop(close);
    h.onmousedown(event(CHAMP));
    h.onclick(event(CHAMP));
    expect(close).not.toHaveBeenCalled();
  });

  it("réarme après un geste refusé", () => {
    const close = vi.fn();
    const h = backdrop(close);
    h.onmousedown(event(CHAMP));
    h.onclick(event(FOND));
    h.onmousedown(event(FOND));
    h.onclick(event(FOND));
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("ne ferme pas sur un clic sans appui préalable sur le fond", () => {
    const close = vi.fn();
    const h = backdrop(close);
    h.onclick(event(FOND));
    expect(close).not.toHaveBeenCalled();
  });
});
