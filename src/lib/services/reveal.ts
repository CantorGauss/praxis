import type { RevealSpeed } from "../types";

/**
 * Affichage progressif des répliques, à vitesse de lecture.
 *
 * Un modèle hébergé écrit huit cents caractères en trois secondes : sans frein,
 * la scène défile plus vite qu'on ne la lit, et le personnage suivant enchaîne
 * avant qu'on ait compris le précédent. Le texte reçu est donc mis en réserve
 * et montré au rythme d'un lecteur, avec un temps d'arrêt aux fins de phrase.
 * Avec un modèle plus lent que la lecture, rien ne change : on montre ce qui
 * arrive, dès que ça arrive.
 */

/**
 * Caractères par seconde entre deux respirations ; 0 = tout de suite. Le texte
 * défile vite : c'est la ponctuation qui donne le temps de lire.
 */
export const REVEAL_CHARS_PER_SECOND: Record<RevealSpeed, number> = {
  slow: 26,
  normal: 40,
  fast: 65,
  instant: 0,
};

export const REVEAL_SPEED_OPTIONS: RevealSpeed[] = ["slow", "normal", "fast", "instant"];

const TICK_MS = 40;

/**
 * Respiration après un caractère, en millisecondes, quelle que soit la vitesse
 * de défilement : c'est elle qui laisse le temps de comprendre.
 *
 * Exporté pour les tests.
 */
export function revealPause(char: string, next: string | undefined): number {
  const ends = ".!?…";
  if (char === "\n") return next === "\n" ? 0 : 550;
  // « ... » et « ?! » : la pause tombe sur le dernier signe seulement, et
  // seulement en fin de phrase (pas dans « 3.5 » ni « M.Dupont »).
  if (ends.includes(char)) {
    if (next && ends.includes(next)) return 0;
    return next === undefined || /\s|["»”)*]/.test(next) ? 480 : 0;
  }
  if (char === "," || char === ";") return next === undefined || /\s/.test(next) ? 200 : 0;
  if (char === ":") return 260;
  // Fin d'une didascalie : le geste se lit avant la réplique.
  if (char === "*" && next !== undefined && /\s/.test(next)) return 180;
  return 0;
}

export type Revealer = {
  /** Texte reçu jusqu'ici ; il ne fait que s'allonger. */
  update(text: string): void;
  /** Se résout quand tout ce qui a été reçu est affiché. */
  drain(): Promise<void>;
  /** Montre tout de suite ce qui reste. */
  skip(): void;
  /** Libère la minuterie ; ce qui attendait la fin est relâché. */
  stop(): void;
};

export function createRevealer(
  publish: (text: string) => void,
  charsPerSecond: number,
  options: {
    now?: () => number;
    setTimer?: (callback: () => void, ms: number) => unknown;
    clearTimer?: (handle: unknown) => void;
  } = {},
): Revealer {
  const now = options.now ?? (() => Date.now());
  const setTimer = options.setTimer ?? ((callback, ms) => setTimeout(callback, ms));
  const clearTimer =
    options.clearTimer ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
  const instant = charsPerSecond <= 0;
  /** Le crédit de temps est compté en millisecondes. */
  const charMs = instant ? 0 : 1000 / charsPerSecond;

  let target = "";
  let shown = 0;
  let budget = 0;
  let last = 0;
  let timer: unknown = null;
  let waiters: (() => void)[] = [];

  const release = () => {
    const pending = waiters;
    waiters = [];
    for (const resolve of pending) resolve();
  };

  const show = (length: number) => {
    shown = Math.min(length, target.length);
    publish(target.slice(0, shown));
    if (shown >= target.length) release();
  };

  const tick = () => {
    timer = null;
    const t = now();
    budget += t - last;
    last = t;
    let next = shown;
    while (next < target.length) {
      // La respiration suit le signe qui l'appelle : on la paie avant le
      // caractère d'après, une fois le point déjà affiché.
      const cost = charMs + (next > 0 ? revealPause(target[next - 1], target[next]) : 0);
      if (budget < cost) break;
      budget -= cost;
      next++;
      // Ne jamais couper un caractère hors du plan de base (emoji…) en deux.
      const code = target.charCodeAt(next);
      if (next < target.length && code >= 0xdc00 && code <= 0xdfff) next++;
    }
    if (next > shown) show(next);
    if (shown < target.length) timer = setTimer(tick, TICK_MS);
    // En retard sur le texte reçu, le reste du crédit ne s'accumule pas : un
    // modèle lent ne doit pas provoquer de rafale quand il reprend.
    else budget = Math.min(budget, charMs);
  };

  const ensureRunning = () => {
    if (timer !== null || shown >= target.length) return;
    last = now();
    timer = setTimer(tick, TICK_MS);
  };

  return {
    update(text) {
      target = text;
      if (instant) show(target.length);
      else ensureRunning();
    },
    drain() {
      if (shown >= target.length) return Promise.resolve();
      return new Promise<void>((resolve) => {
        waiters.push(resolve);
        ensureRunning();
      });
    },
    skip() {
      if (timer !== null) {
        clearTimer(timer);
        timer = null;
      }
      show(target.length);
    },
    stop() {
      if (timer !== null) {
        clearTimer(timer);
        timer = null;
      }
      release();
    },
  };
}
