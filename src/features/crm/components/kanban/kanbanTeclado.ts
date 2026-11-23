import type { Announcements, KeyboardCoordinateGetter } from "@dnd-kit/core";

/** Cada flecha horizontal elige la siguiente etapa habilitada, aunque esté vacía. */
export const coordenadasEtapaTeclado: KeyboardCoordinateGetter = (event, { context, currentCoordinates }) => {
  if (event.code !== "ArrowRight" && event.code !== "ArrowLeft") return;
  const { collisionRect, droppableContainers, droppableRects } = context;
  if (!collisionRect) return;
  event.preventDefault();
  const centroActual = collisionRect.left + collisionRect.width / 2;
  const direccion = event.code === "ArrowRight" ? 1 : -1;
  const destino = droppableContainers.getEnabled().flatMap(({ id }) => {
    const rect = droppableRects.get(id);
    if (!rect) return [];
    const distancia = rect.left + rect.width / 2 - centroActual;
    return distancia * direccion > 1 ? [{ rect, distancia: Math.abs(distancia) }] : [];
  }).sort((a, b) => a.distancia - b.distancia)[0]?.rect;
  if (!destino) return;
  return {
    x: currentCoordinates.x + destino.left + destino.width / 2 - centroActual,
    y: currentCoordinates.y + destino.top + 8 - collisionRect.top,
  };
};

const announcements: Announcements = {
  onDragStart: ({ active }) => `Moviendo ${active.data.current?.nombre ?? "oportunidad"}. Elige una etapa con las flechas izquierda y derecha.`,
  onDragOver: ({ over }) => over ? `Etapa de destino: ${over.data.current?.nombre ?? "sin nombre"}.` : "Fuera de una etapa de destino.",
  onDragEnd: ({ over }) => over ? `Destino elegido: ${over.data.current?.nombre ?? "etapa"}. Revisa el resultado del cambio.` : "Movimiento cancelado. Elige una etapa para mover la oportunidad.",
  onDragCancel: () => "Movimiento cancelado. La oportunidad conserva su etapa.",
};

export const accesibilidadKanban = {
  announcements,
  screenReaderInstructions: {
    draggable: "Pulsa Espacio o Enter para mover la oportunidad. Elige una etapa con las flechas izquierda y derecha. Pulsa Espacio o Enter para soltar, o Escape para cancelar.",
  },
};
