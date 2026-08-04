import type { DayPeriod, TemporalContext } from "../types";
import { DEFAULT_PROMPT_PACK, type PromptPack } from "../i18n/prompts";

export function getDayPeriod(hour: number): DayPeriod {
  if (hour < 6) return "night";
  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  if (hour < 22) return "evening";
  return "night";
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function elapsedLabel(
  elapsedMs: number | null,
  pack: PromptPack = DEFAULT_PROMPT_PACK,
): string {
  const t = pack.temporal;
  if (elapsedMs === null) return t.firstExchange;
  if (elapsedMs < 10 * MINUTE) return t.continuousConversation;
  if (elapsedMs < 2 * HOUR) return t.shortBreak;
  if (elapsedMs < 12 * HOUR) return t.fewHours;
  if (elapsedMs < 36 * HOUR) return t.aboutADay;
  if (elapsedMs < 7 * DAY) return t.fewDays;
  return t.longAbsence;
}

/** Durée arrondie lisible, jointe au libellé pour donner un ordre de grandeur. */
export function roundedDuration(
  elapsedMs: number,
  pack: PromptPack = DEFAULT_PROMPT_PACK,
): string {
  const t = pack.temporal;
  if (elapsedMs < HOUR) return t.minutes(Math.max(1, Math.round(elapsedMs / MINUTE)));
  if (elapsedMs < 2 * DAY) return t.hours(Math.round(elapsedMs / HOUR));
  return t.days(Math.round(elapsedMs / DAY));
}

export function buildTemporalContext(
  now: Date,
  lastInteractionAt: string | null,
  pack: PromptPack = DEFAULT_PROMPT_PACK,
): TemporalContext {
  const elapsedMs = lastInteractionAt
    ? Math.max(0, now.getTime() - new Date(lastInteractionAt).getTime())
    : null;
  const pad = (n: number) => String(n).padStart(2, "0");
  const localIso = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  return {
    localIso,
    localTime: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
    weekday: pack.temporal.weekdays[now.getDay()],
    dayPeriod: getDayPeriod(now.getHours()),
    elapsedMs,
    elapsedLabel:
      elapsedMs !== null && elapsedMs >= 10 * MINUTE
        ? pack.temporal.withApproximate(
            elapsedLabel(elapsedMs, pack),
            roundedDuration(elapsedMs, pack),
          )
        : elapsedLabel(elapsedMs, pack),
  };
}
