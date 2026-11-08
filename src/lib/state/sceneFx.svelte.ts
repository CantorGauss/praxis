/**
 * Moteur des effets de scène : confettis, gerbes, rires, projecteur, secousse.
 *
 * Un petit singleton plutôt qu'un composant : la scène, la critique et
 * n'importe quel panneau peuvent lancer un effet, et un seul calque
 * (`SceneEffects.svelte`) dessine les particules par-dessus toute la fenêtre.
 * Les coordonnées sont celles de la fenêtre (clientX/clientY).
 */

export type ParticleKind = "fall" | "fly" | "rise" | "flash" | "banner";

export type Particle = {
  id: number;
  kind: ParticleKind;
  /** Point de départ, en pixels de fenêtre. */
  x: number;
  y: number;
  /** Déplacement total pendant l'animation. */
  dx: number;
  dy: number;
  rotate: number;
  /** Texte (emoji, « ha ») ou null pour un confetti de papier. */
  text: string | null;
  color: string;
  size: number;
  delay: number;
  duration: number;
  /** Confetti rond plutôt que rectangulaire. */
  round: boolean;
};

const CONFETTI_COLORS = ["#f2c14e", "#f78154", "#e85d9a", "#8f6bff", "#4fc3f7", "#5fd38d"];
/** Au-delà, on ne lance plus rien : la fête ne doit pas figer l'interface. */
const MAX_PARTICLES = 320;

const random = (min: number, max: number) => min + Math.random() * (max - min);
const pick = <T>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)];

class SceneFx {
  particles = $state<Particle[]>([]);
  /** Coupé dans les réglages, ou quand le système demande moins de mouvement. */
  enabled = $state(true);
  private nextId = 1;

  private get active(): boolean {
    if (!this.enabled || typeof window === "undefined") return false;
    return !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  }

  private spawn(batch: Omit<Particle, "id">[]): void {
    if (!this.active || batch.length === 0) return;
    const room = MAX_PARTICLES - this.particles.length;
    if (room <= 0) return;
    const added = batch.slice(0, room).map((p) => ({ ...p, id: this.nextId++ }));
    this.particles = [...this.particles, ...added];
    const ids = new Set(added.map((p) => p.id));
    const lifetime = Math.max(...added.map((p) => p.delay + p.duration));
    setTimeout(() => {
      this.particles = this.particles.filter((p) => !ids.has(p.id));
    }, lifetime + 100);
  }

  /** Pluie de confettis sur toute la largeur ; `emoji` en fait une pluie d'objets. */
  rain(options: { colors?: string[]; emoji?: string; count?: number } = {}): void {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const colors = options.colors?.length ? options.colors : CONFETTI_COLORS;
    const count = options.count ?? (options.emoji ? 34 : 110);
    this.spawn(
      Array.from({ length: count }, () => ({
        kind: "fall" as const,
        x: random(0, width),
        y: random(-60, -10),
        dx: random(-140, 140),
        dy: height + 80,
        rotate: random(-900, 900),
        text: options.emoji ?? null,
        color: pick(colors),
        size: options.emoji ? random(18, 30) : random(7, 12),
        delay: random(0, 700),
        duration: random(2200, 3600),
        round: Math.random() < 0.3,
      })),
    );
  }

  /** Gerbe de pictogrammes autour d'un point. */
  burst(x: number, y: number, emoji: string, count = 8): void {
    this.spawn(
      Array.from({ length: count }, (_, i) => {
        const angle = (i / count) * Math.PI * 2 + random(-0.3, 0.3);
        const distance = random(48, 96);
        return {
          kind: "fly" as const,
          x,
          y,
          dx: Math.cos(angle) * distance,
          dy: Math.sin(angle) * distance - 18,
          rotate: random(-60, 60),
          text: emoji,
          color: "",
          size: random(16, 24),
          delay: random(0, 90),
          duration: random(900, 1250),
          round: false,
        };
      }),
    );
  }

  /** Des « ha ha » qui s'envolent en zigzag. */
  laugh(x: number, y: number): void {
    const words = ["ha", "HA", "ha ha", "😂", "hi hi", "😆"];
    this.spawn(
      Array.from({ length: 6 }, (_, i) => ({
        kind: "rise" as const,
        x: x + random(-40, 40),
        y,
        dx: random(-36, 36),
        dy: -random(70, 120),
        rotate: random(-25, 25),
        text: pick(words),
        color: "#f2c14e",
        size: random(13, 19),
        delay: i * 110,
        duration: random(1300, 1700),
        round: false,
      })),
    );
  }

  /** Coup de projecteur sur un point, et quelques étincelles. */
  spotlight(x: number, y: number): void {
    this.spawn([
      {
        kind: "flash",
        x,
        y,
        dx: 0,
        dy: 0,
        rotate: 0,
        text: null,
        color: "",
        size: 0,
        delay: 0,
        duration: 1300,
        round: true,
      },
    ]);
    this.burst(x, y, "✦", 12);
  }

  /** Un bandeau festif au centre, en haut de l'écran. */
  banner(text: string): void {
    this.spawn([
      {
        kind: "banner",
        x: window.innerWidth / 2,
        y: 84,
        dx: 0,
        dy: 0,
        rotate: 0,
        text,
        color: "",
        size: 0,
        delay: 150,
        duration: 3000,
        round: false,
      },
    ]);
  }

  /** La scène tremble : on secoue l'élément marqué `data-stage`. */
  shake(strength: number): void {
    if (!this.active) return;
    const stage = document.querySelector<HTMLElement>("[data-stage]");
    if (!stage?.animate) return;
    const a = 3 + 9 * Math.min(1, Math.max(0, strength));
    stage.animate(
      [
        { transform: "translate(0, 0)" },
        { transform: `translate(${-a}px, ${a * 0.3}px) rotate(-0.25deg)` },
        { transform: `translate(${a * 0.9}px, ${-a * 0.25}px) rotate(0.25deg)` },
        { transform: `translate(${-a * 0.6}px, 0)` },
        { transform: `translate(${a * 0.35}px, ${a * 0.15}px)` },
        { transform: "translate(0, 0)" },
      ],
      { duration: 420 + 180 * strength, easing: "ease-out" },
    );
  }
}

export const sceneFx = new SceneFx();
