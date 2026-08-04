import { describe, expect, it } from "vitest";
import {
  buildTemporalContext,
  elapsedLabel,
  getDayPeriod,
} from "../temporal";
import { enPrompts, frPrompts } from "../../i18n/prompts";

describe("getDayPeriod", () => {
  it("suit les bornes recommandées", () => {
    expect(getDayPeriod(0)).toBe("night");
    expect(getDayPeriod(5)).toBe("night");
    expect(getDayPeriod(6)).toBe("morning");
    expect(getDayPeriod(11)).toBe("morning");
    expect(getDayPeriod(12)).toBe("afternoon");
    expect(getDayPeriod(17)).toBe("afternoon");
    expect(getDayPeriod(18)).toBe("evening");
    expect(getDayPeriod(21)).toBe("evening");
    expect(getDayPeriod(22)).toBe("night");
    expect(getDayPeriod(23)).toBe("night");
  });
});

describe("elapsedLabel", () => {
  const MIN = 60_000;
  const H = 60 * MIN;

  it("catégorise le temps écoulé, en anglais par défaut", () => {
    const t = enPrompts.temporal;
    expect(elapsedLabel(null)).toBe(t.firstExchange);
    expect(elapsedLabel(5 * MIN)).toBe(t.continuousConversation);
    expect(elapsedLabel(30 * MIN)).toBe(t.shortBreak);
    expect(elapsedLabel(5 * H)).toBe(t.fewHours);
    expect(elapsedLabel(20 * H)).toBe(t.aboutADay);
    expect(elapsedLabel(3 * 24 * H)).toBe(t.fewDays);
    expect(elapsedLabel(10 * 24 * H)).toBe(t.longAbsence);
  });

  it("catégorise le temps écoulé en français quand le pack le demande", () => {
    expect(elapsedLabel(null, frPrompts)).toBe("premier échange");
    expect(elapsedLabel(5 * MIN, frPrompts)).toBe("conversation continue");
    expect(elapsedLabel(30 * MIN, frPrompts)).toBe("courte interruption");
    expect(elapsedLabel(5 * H, frPrompts)).toBe("quelques heures");
    expect(elapsedLabel(20 * H, frPrompts)).toBe("environ une journée");
    expect(elapsedLabel(3 * 24 * H, frPrompts)).toBe("quelques jours");
    expect(elapsedLabel(10 * 24 * H, frPrompts)).toBe("longue absence");
  });

  it("respecte les frontières exactes, quelle que soit la langue", () => {
    for (const pack of [enPrompts, frPrompts]) {
      const t = pack.temporal;
      expect(elapsedLabel(10 * MIN, pack)).toBe(t.shortBreak);
      expect(elapsedLabel(2 * H, pack)).toBe(t.fewHours);
      expect(elapsedLabel(12 * H, pack)).toBe(t.aboutADay);
      expect(elapsedLabel(36 * H, pack)).toBe(t.fewDays);
      expect(elapsedLabel(7 * 24 * H, pack)).toBe(t.longAbsence);
    }
  });
});

describe("buildTemporalContext", () => {
  it("produit heure locale, jour et période cohérents", () => {
    const now = new Date(2026, 6, 23, 16, 5, 0); // jeudi après-midi
    const ctx = buildTemporalContext(now, null);
    expect(ctx.localTime).toBe("16:05");
    expect(ctx.weekday).toBe("Thursday");
    expect(ctx.dayPeriod).toBe("afternoon");
    expect(ctx.elapsedMs).toBeNull();
    expect(ctx.elapsedLabel).toBe(enPrompts.temporal.firstExchange);
  });

  it("nomme le jour dans la langue de conversation", () => {
    const now = new Date(2026, 6, 23, 16, 5, 0);
    expect(buildTemporalContext(now, null, frPrompts).weekday).toBe("jeudi");
  });

  it("calcule le temps écoulé depuis le dernier échange", () => {
    const now = new Date(2026, 6, 23, 16, 0, 0);
    const before = new Date(2026, 6, 23, 12, 0, 0).toISOString();
    const ctx = buildTemporalContext(now, before);
    expect(ctx.elapsedMs).toBe(4 * 3_600_000);
    expect(ctx.elapsedLabel).toContain(enPrompts.temporal.fewHours);

    const fr = buildTemporalContext(now, before, frPrompts);
    expect(fr.elapsedLabel).toContain("quelques heures");
    expect(fr.elapsedLabel).toContain("environ 4 h");
  });
});
