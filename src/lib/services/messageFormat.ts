/**
 * Découpe un message en segments « paroles » et « actions ».
 * Les actions suivent la convention d'écriture *entre astérisques*
 * (ex. *sourit doucement*). Un astérisque non refermé sur la même ligne
 * reste du texte normal — important pendant le streaming.
 */

export type MessageSegment = {
  kind: "speech" | "action";
  text: string;
};

const ACTION_PATTERN = /\*([^*\n]+?)\*/g;

export function splitActions(content: string): MessageSegment[] {
  const segments: MessageSegment[] = [];
  let lastIndex = 0;
  for (const match of content.matchAll(ACTION_PATTERN)) {
    if (match.index > lastIndex) {
      segments.push({ kind: "speech", text: content.slice(lastIndex, match.index) });
    }
    segments.push({ kind: "action", text: match[1] });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < content.length) {
    segments.push({ kind: "speech", text: content.slice(lastIndex) });
  }
  return segments;
}

/**
 * Apartés : une phrase dite au public, que personne en scène n'entend.
 *
 * Forme reconnue : « (aparté : …) », « [aside: …] », « (à part, au public — …) ».
 * Le séparateur est obligatoire : « (à part ça, tout va bien) » reste une
 * parenthèse ordinaire. Comme pour les actions, un aparté non refermé reste du
 * texte normal pendant le streaming.
 */
const ASIDE_PATTERN =
  /[(\[]\s*(?:en\s+)?(?:apart[ée]|[àa]\s+part|aside)(?!\p{L})(?:\s*,[^:：—–\-()[\]\n]{0,30})?\s*[:：—–-]\s*([^()[\]\n]+?)\s*[)\]]/giu;

export type AsideSegment = {
  kind: "public" | "aside";
  text: string;
};

export function splitAsides(content: string): AsideSegment[] {
  const segments: AsideSegment[] = [];
  let lastIndex = 0;
  for (const match of content.matchAll(ASIDE_PATTERN)) {
    if (match.index > lastIndex) {
      segments.push({ kind: "public", text: content.slice(lastIndex, match.index) });
    }
    segments.push({ kind: "aside", text: match[1] });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < content.length) {
    segments.push({ kind: "public", text: content.slice(lastIndex) });
  }
  return segments;
}

/** Nombre d'apartés d'une réplique. */
export function countAsides(content: string): number {
  return [...content.matchAll(ASIDE_PATTERN)].length;
}

/**
 * Ce que la scène entend d'une réplique : tout sauf les apartés. Une réplique
 * faite d'un seul aparté donne une chaîne vide — les autres n'ont rien entendu.
 */
export function publicText(content: string): string {
  if (!countAsides(content)) return content;
  return content
    .replace(ASIDE_PATTERN, " ")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

export type RenderedSegment = {
  kind: "speech" | "action" | "aside";
  text: string;
};

/** Découpage complet pour l'affichage : apartés, puis actions dans le reste. */
export function splitMessage(content: string): RenderedSegment[] {
  return splitAsides(content).flatMap((segment): RenderedSegment[] =>
    segment.kind === "aside"
      ? [{ kind: "aside", text: segment.text }]
      : splitActions(segment.text),
  );
}
