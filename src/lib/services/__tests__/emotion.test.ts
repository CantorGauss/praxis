import { describe, expect, it } from "vitest";
import {
  applyDecay,
  applyUpdate,
  decayToward,
  inferMood,
  neutralState,
  parseEmotionalUpdate,
} from "../emotion";
import { NEUTRAL_STATE } from "../../types";
import type { EmotionalState } from "../../types";

function state(overrides: Partial<EmotionalState>): EmotionalState {
  return {
    personaId: "p1",
    mood: "calm",
    valence: 0.2,
    energy: 0.55,
    warmth: 0.65,
    closeness: 0.5,
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("decayToward", () => {
  it("revient de moitié vers le neutre après une demi-vie", () => {
    expect(decayToward(1, 0, 12, 12)).toBeCloseTo(0.5);
    expect(decayToward(0.8, 0.2, 12, 12)).toBeCloseTo(0.5);
  });

  it("ne bouge pas quand aucun temps ne passe", () => {
    expect(decayToward(0.9, 0.2, 0, 12)).toBeCloseTo(0.9);
  });
});

describe("applyDecay", () => {
  it("rapproche l'état du neutre après une longue absence", () => {
    const old = new Date(Date.now() - 30 * 24 * 3_600_000).toISOString();
    const s = state({ valence: 1, energy: 0.05, warmth: 0.1, updatedAt: old, mood: "annoyed" });
    const decayed = applyDecay(s, new Date(), "afternoon");
    expect(Math.abs(decayed.valence - NEUTRAL_STATE.valence)).toBeLessThan(0.05);
    expect(Math.abs(decayed.energy - NEUTRAL_STATE.energy)).toBeLessThan(0.05);
    expect(decayed.warmth).toBeGreaterThan(0.4);
  });

  it("reste dans les bornes", () => {
    const decayed = applyDecay(state({ valence: 1, energy: 1 }), new Date(), "morning");
    expect(decayed.valence).toBeLessThanOrEqual(1);
    expect(decayed.energy).toBeLessThanOrEqual(1);
    expect(decayed.energy).toBeGreaterThanOrEqual(0);
  });
});

describe("applyUpdate", () => {
  it("écrête les deltas hors bornes", () => {
    const s = state({});
    const next = applyUpdate(
      s,
      {
        mood: "joyful",
        intensity: 0,
        impulse: "sourit",
        valenceDelta: 5,
        energyDelta: -5,
        warmthDelta: 1,
        closenessDelta: 1,
      },
      new Date(),
    );
    expect(next.valence).toBeCloseTo(s.valence + 0.12);
    expect(next.energy).toBeCloseTo(s.energy - 0.1);
    expect(next.warmth).toBeCloseTo(s.warmth + 0.05);
    expect(next.closeness).toBeCloseTo(s.closeness + 0.01);
  });

  it("autorise une réaction nettement plus forte quand l'événement est intense", () => {
    const s = state({});
    const next = applyUpdate(
      s,
      {
        mood: "shocked",
        intensity: 1,
        impulse: "se fige, le souffle coupé",
        valenceDelta: -5,
        energyDelta: 5,
        warmthDelta: -1,
        closenessDelta: -1,
      },
      new Date(),
    );
    expect(next.mood).toBe("shocked");
    expect(next.valence).toBeCloseTo(s.valence - 0.55);
    expect(next.energy).toBeCloseTo(1);
    expect(next.warmth).toBeCloseTo(s.warmth - 0.2);
    expect(next.closeness).toBeCloseTo(s.closeness - 0.05);
  });

  it("ne dépasse jamais les bornes globales", () => {
    const s = state({ valence: 0.99, closeness: 0.999 });
    const next = applyUpdate(
      s,
      {
        mood: "joyful",
        intensity: 0,
        impulse: "sourit",
        valenceDelta: 0.12,
        energyDelta: 0,
        warmthDelta: 0,
        closenessDelta: 0.01,
      },
      new Date(),
    );
    expect(next.valence).toBeLessThanOrEqual(1);
    expect(next.closeness).toBeLessThanOrEqual(1);
  });
});

describe("inferMood", () => {
  it("suit la table de détermination", () => {
    expect(inferMood({ valence: 0, energy: 0.1, warmth: 0.5 })).toBe("tired");
    expect(inferMood({ valence: 0.7, energy: 0.6, warmth: 0.5 })).toBe("joyful");
    expect(inferMood({ valence: -0.5, energy: 0.5, warmth: 0.5 })).toBe("annoyed");
    expect(inferMood({ valence: -0.2, energy: 0.5, warmth: 0.7 })).toBe("concerned");
    expect(inferMood({ valence: 0.1, energy: 0.8, warmth: 0.5 })).toBe("curious");
    expect(inferMood({ valence: 0.2, energy: 0.5, warmth: 0.5 })).toBe("calm");
  });
});

describe("parseEmotionalUpdate", () => {
  it("accepte un JSON valide, même entouré de texte", () => {
    const update = parseEmotionalUpdate(
      'Voici : {"mood":"surprised","intensity":0.78,"impulse":"recule d’un pas","valenceDelta":0.1,"energyDelta":0.3,"warmthDelta":0.02,"closenessDelta":0.005} merci',
    );
    expect(update?.mood).toBe("surprised");
    expect(update?.intensity).toBeCloseTo(0.78);
    expect(update?.impulse).toBe("recule d’un pas");
    expect(update?.valenceDelta).toBeCloseTo(0.1);
  });

  it("rejette les formats invalides sans lever d'exception", () => {
    expect(parseEmotionalUpdate("pas de json")).toBeNull();
    expect(parseEmotionalUpdate('{"mood":"furious","valenceDelta":0,"energyDelta":0,"warmthDelta":0,"closenessDelta":0}')).toBeNull();
    expect(parseEmotionalUpdate('{"mood":"calm","valenceDelta":"beaucoup"}')).toBeNull();
  });
});

describe("neutralState", () => {
  it("reprend les valeurs neutres recommandées", () => {
    const s = neutralState("p1", new Date());
    expect(s.mood).toBe(NEUTRAL_STATE.mood);
    expect(s.valence).toBe(NEUTRAL_STATE.valence);
    expect(s.closeness).toBe(NEUTRAL_STATE.closeness);
  });
});
