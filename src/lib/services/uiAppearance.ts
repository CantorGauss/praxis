import type {
  ChatTextSize,
  InterfaceDensity,
  InterfaceTheme,
} from "../types";

export type ResolvedTheme = "dark" | "light";

export function resolveInterfaceTheme(
  preference: InterfaceTheme,
  systemPrefersDark: boolean,
): ResolvedTheme {
  if (preference === "system") return systemPrefersDark ? "dark" : "light";
  return preference;
}

/** Applique immédiatement les préférences, sans recharger l'application. */
export function applyUiAppearance(
  preference: InterfaceTheme,
  chatTextSize: ChatTextSize,
  density: InterfaceDensity,
  systemPrefersDark: boolean,
): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.dataset.theme = resolveInterfaceTheme(preference, systemPrefersDark);
  root.dataset.chatTextSize = chatTextSize;
  root.dataset.density = density;
}

