/**
 * v13.89.3 — Hook para enfocar/scrollear/resaltar una sección dentro de un tab
 * cuando llega un deep-link con `?focus=<key>` (opcionalmente `&ids=a,b,c`).
 *
 * Uso:
 *   const { focus, ids, registerRef, clearFocus } = useFocusSection();
 *   <section ref={registerRef("cxc")} data-focus="cxc"> …
 *
 * Cuando `focus === key`, el ref hace scroll suave y aplica un ring pulsante
 * por 2.5s. Si el parámetro también filtra el contenido, la sección puede
 * conservarlo hasta que el usuario decida limpiar el filtro.
 */
import { useCallback, useMemo, useRef } from "react";
import { useSearchParams } from "react-router";

const HIGHLIGHT_CLASSES = [
  "ring-2",
  "ring-primary",
  "ring-offset-2",
  "animate-pulse",
  "rounded-md",
];
const HIGHLIGHT_MS = 2500;

export function useFocusSection(conservarFiltro = false) {
  const [params, setParams] = useSearchParams();
  const focus = params.get("focus");
  const idsParam = params.get("ids");

  const ids = useMemo(
    () => (idsParam ? idsParam.split(",").map((s) => s.trim()).filter(Boolean) : []),
    [idsParam],
  );

  const handledRef = useRef<Set<string>>(new Set());

  const clearFocus = useCallback(() => {
    if (focus) handledRef.current.delete(focus);
    const next = new URLSearchParams(params);
    next.delete("focus");
    next.delete("ids");
    setParams(next, { replace: true });
  }, [focus, params, setParams]);

  const registerRef = useCallback(
    (key: string) => (node: HTMLElement | null) => {
      if (!node || focus !== key || handledRef.current.has(key)) return;
      handledRef.current.add(key);
      const ubicacion = window.location.pathname;

      // Defer al siguiente frame: asegura que el tab ya renderizó.
      requestAnimationFrame(() => {
        try {
          node.scrollIntoView({ behavior: "smooth", block: "start" });
        } catch {
          node.scrollIntoView();
        }
        node.classList.add(...HIGHLIGHT_CLASSES);
        window.setTimeout(() => {
          node.classList.remove(...HIGHLIGHT_CLASSES);
          if (conservarFiltro || window.location.pathname !== ubicacion) return;
          const next = new URLSearchParams(window.location.search);
          if (next.get("focus") !== key || next.get("ids") !== idsParam) return;
          next.delete("focus");
          next.delete("ids");
          const url = `${window.location.pathname}${
            next.toString() ? `?${next.toString()}` : ""
          }${window.location.hash}`;
          window.history.replaceState(window.history.state, "", url);
        }, HIGHLIGHT_MS);
      });
    },
    [conservarFiltro, focus, idsParam],
  );

  return { focus, ids, registerRef, clearFocus };
}
