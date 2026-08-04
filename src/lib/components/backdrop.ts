/**
 * Fermeture d'une modale par clic sur le fond.
 *
 * Un `click` se déclenche sur l'ancêtre commun du `mousedown` et du `mouseup` :
 * sélectionner du texte dans un champ puis relâcher au-dessus du fond produit
 * donc un clic dont la cible *est* le fond, et la modale se fermait au milieu
 * d'une sélection. On n'accepte la fermeture que si le geste a aussi *commencé*
 * sur le fond.
 *
 * L'état est au niveau du module, pas dans la closure : une seule modale est
 * ouverte à la fois, et un rendu intercalé entre l'appui et le relâchement ne
 * doit pas faire perdre l'information.
 */
let pressedOn: EventTarget | null = null;

export function backdrop(onDismiss: () => void) {
  return {
    onmousedown(event: MouseEvent) {
      pressedOn = event.target === event.currentTarget ? event.currentTarget : null;
    },
    onclick(event: MouseEvent) {
      const startedOnBackdrop = pressedOn === event.currentTarget;
      pressedOn = null;
      if (startedOnBackdrop && event.target === event.currentTarget) onDismiss();
    },
  };
}
