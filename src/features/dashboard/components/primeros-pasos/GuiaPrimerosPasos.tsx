import { useCallback, useId, useLayoutEffect, useRef, useState } from "react";
import { BookOpen, ChevronDown } from "lucide-react";
import { useLocation, useNavigationType } from "react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { usePrimerosPasos } from "@/features/dashboard/hooks/usePrimerosPasos";
import type { ResultadoPrimerosPasos } from "@/features/dashboard/domain/primerosPasos";
import { safeLocalStorage, safeSessionStorage } from "@/lib/browserStorage";
import { ContenidoPrimerosPasos } from "./ContenidoPrimerosPasos";

interface Props {
  ubicacion?: "inicio" | "ayuda";
  abrirEnPrimeraVisita?: boolean;
}

const CLAVE_TAREA_RECIENTE = "lc:guia-primeros-pasos:tarea-reciente";

export function GuiaPrimerosPasos({ ubicacion = "inicio", abrirEnPrimeraVisita = false }: Props) {
  const { resultado, claveContexto, clavePreferencia, reintentar } = usePrimerosPasos();
  const { key: entrada, pathname } = useLocation();
  const navegacion = useNavigationType();
  const prefijoTarea = ubicacion === "inicio"
    ? JSON.stringify([pathname, entrada, claveContexto]) + "\n"
    : undefined;
  const restaurarFoco = useRef(false);
  const registrarFocoPrevio = useCallback((dentro: boolean) => {
    restaurarFoco.current = dentro;
  }, []);
  const consumirFocoPrevio = useCallback(() => {
    const pendiente = restaurarFoco.current;
    restaurarFoco.current = false;
    return pendiente;
  }, []);
  return (
    <PanelPrimerosPasos
      key={prefijoTarea ?? claveContexto}
      resultado={resultado}
      ubicacion={ubicacion}
      clavePreferencia={abrirEnPrimeraVisita ? clavePreferencia : undefined}
      prefijoTarea={prefijoTarea}
      volverPorHistorial={navegacion === "POP"}
      onRetry={reintentar}
      registrarFocoPrevio={registrarFocoPrevio}
      consumirFocoPrevio={consumirFocoPrevio}
    />
  );
}

interface PanelProps extends Props {
  clavePreferencia?: string;
  prefijoTarea?: string;
  volverPorHistorial: boolean;
  resultado: ResultadoPrimerosPasos;
  onRetry: () => Promise<void>;
  registrarFocoPrevio: (dentro: boolean) => void;
  consumirFocoPrevio: () => boolean;
}

function PanelPrimerosPasos({
  resultado, ubicacion, clavePreferencia, prefijoTarea, volverPorHistorial, onRetry, registrarFocoPrevio, consumirFocoPrevio,
}: PanelProps) {
  const [tareaRetomada] = useState(() => {
    if (!volverPorHistorial || !prefijoTarea) return "";
    const reciente = safeSessionStorage.getItem(CLAVE_TAREA_RECIENTE);
    return reciente?.startsWith(prefijoTarea) ? reciente.slice(prefijoTarea.length) : "";
  });
  const [tareaAbierta, setTareaAbierta] = useState(tareaRetomada);
  const [open, setOpen] = useState(() => clavePreferencia
    ? safeLocalStorage.getItem(clavePreferencia) !== "cerrada"
    : tareaRetomada !== "");
  const disponible = resultado.estado === "disponible";
  const [disponibilidadAnterior, setDisponibilidadAnterior] = useState(disponible);
  if (disponible !== disponibilidadAnterior) {
    setDisponibilidadAnterior(disponible);
    if (!disponible) setTareaAbierta("");
  }
  const tareaVisible = disponible && resultado.tareas.some((tarea) => tarea.id === tareaAbierta)
    ? tareaAbierta
    : "";

  const cambiarTarea = (id: string) => {
    setTareaAbierta(id);
    if (!prefijoTarea) return;
    if (id) safeSessionStorage.setItem(CLAVE_TAREA_RECIENTE, prefijoTarea + id);
    else safeSessionStorage.removeItem(CLAVE_TAREA_RECIENTE);
  };
  const cambiarApertura = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) cambiarTarea("");
    if (clavePreferencia) safeLocalStorage.setItem(clavePreferencia, nextOpen ? "abierta" : "cerrada");
  };
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const focoTareaPendiente = useRef(Boolean(tareaRetomada));
  const tituloId = useId();
  const titulo = ubicacion === "ayuda" ? "Ver guía de primeros pasos" : "Empieza por tu tarea";

  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (consumirFocoPrevio()) triggerRef.current?.focus();
    return () => {
      // Capturar antes de retirar el nodo; el foco externo debe permanecer fuera.
      registrarFocoPrevio(panel?.contains(document.activeElement) ?? false);
    };
  }, [registrarFocoPrevio, consumirFocoPrevio]);

  useLayoutEffect(() => {
    if (!prefijoTarea) return;
    const reciente = safeSessionStorage.getItem(CLAVE_TAREA_RECIENTE);
    if (reciente && !tareaAbierta && (reciente.startsWith(prefijoTarea) || resultado.estado !== "cargando")) {
      safeSessionStorage.removeItem(CLAVE_TAREA_RECIENTE);
    }
    if (open && focoTareaPendiente.current && tareaVisible === tareaRetomada && tareaVisible) {
      focoTareaPendiente.current = false;
      const fila = panelRef.current?.querySelector<HTMLButtonElement>(`[data-tarea-id="${tareaVisible}"]`);
      fila?.focus();
      // El layout reinicia el scroll al cambiar de pantalla.
      requestAnimationFrame(() => {
        if (fila && document.activeElement === fila) fila.scrollIntoView?.({ block: "nearest", behavior: "instant" });
      });
    }
  }, [open, prefijoTarea, resultado.estado, tareaAbierta, tareaRetomada, tareaVisible]);

  const reintentar = () => {
    if (panelRef.current?.contains(document.activeElement)) triggerRef.current?.focus();
    return onRetry();
  };

  return (
    <Card ref={panelRef}>
      <Collapsible open={open} onOpenChange={cambiarApertura}>
        <CardHeader className="p-4">
          <h2 id={tituloId}>
            <CollapsibleTrigger asChild>
              <Button
                ref={triggerRef}
                variant="ghost"
                className="h-auto min-h-11 w-full cursor-pointer justify-between whitespace-normal p-0 text-left hover:bg-transparent hover:text-foreground active:scale-100"
              >
                <span className="flex min-w-0 items-center gap-2 text-section">
                  <BookOpen className="h-5 w-5 shrink-0" aria-hidden />
                  {titulo}
                </span>
                <ChevronDown className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
              </Button>
            </CollapsibleTrigger>
          </h2>
          {ubicacion === "ayuda" && (
            <p className="text-body text-muted-foreground">
              Elige qué necesitas hacer. Aquí encontrarás el punto de partida y el siguiente paso de cada tarea.
              {" "}Las opciones disponibles dependen de tu acceso en la organización activa.
            </p>
          )}
        </CardHeader>
        <CollapsibleContent>
          <CardContent role="region" aria-labelledby={tituloId} className="space-y-3 px-4 pb-4 pt-0">
            {ubicacion === "inicio" && resultado.estado === "disponible" && resultado.tareas.length > 0 && (
              <p className="text-body-sm text-muted-foreground">Elige una tarea según tu acceso en la organización activa.</p>
            )}
            <ContenidoPrimerosPasos
              resultado={resultado}
              onRetry={reintentar}
              resumirTareas={ubicacion === "inicio"}
              tareaAbierta={tareaVisible}
              onTareaAbiertaChange={cambiarTarea}
            />
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
