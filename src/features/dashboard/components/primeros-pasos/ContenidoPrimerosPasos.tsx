import { useId, useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ErrorState } from "@/components/shared/states/ErrorState";
import { EmptyStateInline } from "@/components/empty/EmptyStateInline";
import type { ResultadoPrimerosPasos, TareaPrimerosPasos } from "@/features/dashboard/domain/primerosPasos";

interface Props {
  resultado: ResultadoPrimerosPasos;
  onRetry: () => Promise<void>;
  tareaAbierta: string;
  onTareaAbiertaChange: (id: string) => void;
  resumirTareas?: boolean;
}

const AVISOS = {
  "sin-sesion": "Esta es una guía general del ERP. Consulta las preguntas frecuentes y el glosario. Inicia sesión para ver los puntos de partida disponibles para tu rol y tu organización.",
  "sin-rol": "Tu cuenta aún no tiene un rol disponible para esta guía. Pide al administrador de tu organización que revise tu acceso.",
  "sin-organizacion": "No hay una organización activa para mostrar tareas del ERP. Revisa tu acceso con el administrador de tu organización.",
} as const;

export function ContenidoPrimerosPasos({ resultado, onRetry, ...lista }: Props) {
  if (resultado.estado === "cargando") {
    return (
      <p role="status" className="flex items-center gap-2 text-body text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        Cargando las opciones de tu guía…
      </p>
    );
  }
  if (resultado.estado === "error-perfil" || resultado.estado === "error-organizaciones") {
    const esPerfil = resultado.estado === "error-perfil";
    return (
      <ErrorState
        title="No pudimos cargar el contexto de tu guía"
        description={esPerfil ? "No se pudo verificar tu cuenta y su rol. Reintenta la carga antes de elegir una tarea." : "No se pudo cargar la lista de organizaciones. Reintenta la carga antes de elegir una tarea."}
        retryLabel={esPerfil ? "Reintentar carga de cuenta" : "Reintentar carga de organizaciones"}
        onRetry={() => void onRetry()}
      />
    );
  }
  if (resultado.estado !== "disponible") {
    return (
      <div className="space-y-3 text-body text-muted-foreground">
        <p role="status">{AVISOS[resultado.estado]}</p>
        {resultado.estado === "sin-sesion" && (
          <Button variant="outline" size="sm" asChild><Link to="/login" state={{ from: { pathname: "/ayuda" } }}>Iniciar sesión</Link></Button>
        )}
      </div>
    );
  }
  if (resultado.tareas.length === 0) {
    return (
      <div role="status">
        <EmptyStateInline
          density="compact"
          message="No hay tareas de esta guía disponibles para tu acceso actual. Consulta las preguntas frecuentes de los módulos que puedes abrir."
        />
      </div>
    );
  }
  return <ListaTareas tareas={resultado.tareas} {...lista} />;
}

const TAREAS_INICIALES = 3;

type ListaProps = Omit<Props, "resultado" | "onRetry"> & {
  tareas: readonly TareaPrimerosPasos[];
};

function ListaTareas({ tareas, tareaAbierta, onTareaAbiertaChange, resumirTareas = false }: ListaProps) {
  const [listaAmpliada, setListaAmpliada] = useState(false);
  const idAdicionales = useId();
  const acordeon = useRef<HTMLDivElement>(null);
  const ancla = useRef<{ fila: HTMLButtonElement; top: number } | null>(null);
  const corte = resumirTareas ? TAREAS_INICIALES : tareas.length;
  const adicionales = tareas.slice(corte);
  const tareaAdicionalAbierta = adicionales.some((tarea) => tarea.id === tareaAbierta);
  const mostrarTodas = listaAmpliada || tareaAdicionalAbierta;

  function cambiarTarea(id: string) {
    const fila = resumirTareas && id
      ? acordeon.current?.querySelector<HTMLButtonElement>(`[data-tarea-id="${id}"]`)
      : null;
    ancla.current = fila ? { fila, top: fila.getBoundingClientRect().top } : null;
    onTareaAbiertaChange(id);
  }

  useLayoutEffect(() => {
    const pendiente = ancla.current;
    ancla.current = null;
    if (!pendiente) return;
    const { fila, top } = pendiente;

    function estabilizarFila() {
      if (!fila.isConnected) return;
      const rect = fila.getBoundingClientRect();
      const panel = document.getElementById(fila.getAttribute("aria-controls") ?? "");
      const fin = panel?.querySelector("a")?.getBoundingClientRect().bottom ?? rect.bottom;
      const margen = Number.parseFloat(getComputedStyle(fila).scrollMarginTop) || 0;
      const limite = document.documentElement.clientHeight - (fin - rect.top);
      const posicion = Math.max(margen, Math.min(top, limite));
      const ajuste = rect.top - posicion;
      if (Math.abs(ajuste) >= 1) window.scrollBy({ top: ajuste, behavior: "instant" });
    }

    // Espera a que el navegador aplique su propio anclaje tras cerrar la fila anterior.
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(estabilizarFila);
    });
    return () => cancelAnimationFrame(frame);
  }, [tareaAbierta]);

  function renderTarea(tarea: TareaPrimerosPasos) {
    return (
      <AccordionItem key={tarea.id} value={tarea.id}>
        <AccordionTrigger data-tarea-id={tarea.id} className="scroll-mt-14 cursor-pointer gap-2 text-left text-body">
          {tarea.titulo}
        </AccordionTrigger>
        <AccordionContent
          className="space-y-3 text-body text-muted-foreground"
          style={resumirTareas ? { animation: "none" } : undefined}
        >
          <p>{tarea.descripcion}</p>
          {tarea.requisito && <p>{tarea.requisito}</p>}
          <div className="flex flex-wrap gap-2">
            {tarea.enlaces.map((enlace) => (
              <Button key={enlace.href} variant="outline" size="sm" className="h-auto min-h-10 whitespace-normal py-2" asChild>
                <Link to={enlace.href}>{enlace.etiqueta}</Link>
              </Button>
            ))}
          </div>
        </AccordionContent>
      </AccordionItem>
    );
  }

  return (
    <div className="space-y-3">
      {!resumirTareas && (
        <p className="text-body-sm text-muted-foreground">
          Abre una tarea para revisar sus requisitos y elegir dónde empezar.
        </p>
      )}
      <Accordion ref={acordeon} type="single" collapsible value={tareaAbierta} onValueChange={cambiarTarea}>
        {tareas.slice(0, corte).map(renderTarea)}
        {adicionales.length > 0 && (
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="my-3 min-h-10 cursor-pointer"
              aria-controls={idAdicionales}
              aria-expanded={mostrarTodas}
              onClick={(evento) => {
                evento.currentTarget.focus({ preventScroll: true });
                if (mostrarTodas && tareaAdicionalAbierta) onTareaAbiertaChange("");
                setListaAmpliada(!mostrarTodas);
              }}
            >
              {mostrarTodas ? "Ver menos tareas" : "Ver todas las tareas"}
            </Button>
            <div id={idAdicionales} hidden={!mostrarTodas}>
              {mostrarTodas && adicionales.map(renderTarea)}
            </div>
          </>
        )}
      </Accordion>
    </div>
  );
}
