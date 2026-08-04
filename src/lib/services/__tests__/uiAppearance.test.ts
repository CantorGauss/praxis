import { describe, expect, it } from "vitest";
import { resolveInterfaceTheme } from "../uiAppearance";

describe("apparence de l'interface", () => {
  it("respecte un thème explicitement choisi", () => {
    expect(resolveInterfaceTheme("dark", false)).toBe("dark");
    expect(resolveInterfaceTheme("light", true)).toBe("light");
  });

  it("suit le système en mode automatique", () => {
    expect(resolveInterfaceTheme("system", true)).toBe("dark");
    expect(resolveInterfaceTheme("system", false)).toBe("light");
  });
});
