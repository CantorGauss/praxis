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
