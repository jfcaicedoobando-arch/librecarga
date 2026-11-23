import { useId, useRef, useState } from "react";
import { Bell, Check } from "lucide-react";
import { SectionHeading } from "@/components/shared/SectionHeading";
import { EmptyStateInline } from "@/components/empty/EmptyStateInline";
import { ErrorStateInline } from "@/components/empty/ErrorStateInline";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatDate } from "@/lib/formatters";
import {
  useNotificacionesInternas,
  type NotificacionInterna,
} from "@/features/notificaciones/hooks/useNotificacionesInternas";

export function NotificacionesPopover() {
  const navigate = useNavigate();
  const headingId = useId();
  const headerRef = useRef<HTMLDivElement>(null);
  const [avisoAbierto, setAvisoAbierto] = useState<string | null>(null);
  const { notificaciones, isSuccess, isError, isFetching, refetch, noLeidas, marcarLeida, marcarTodasLeidas } =
    useNotificacionesInternas();

  const handleClick = (n: NotificacionInterna) => {
    if (!n.leida) marcarLeida(n.id);
    if (n.enlace) navigate(n.enlace);
    else setAvisoAbierto((prev) => prev === n.id ? null : n.id);
  };

  return (
    <Popover>
      <Tooltip delayDuration={300}>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="relative min-h-11 min-w-11 md:h-8 md:w-8 md:min-h-0 md:min-w-0"
              aria-label={noLeidas > 0 ? `Notificaciones, ${noLeidas} sin leer` : "Notificaciones"}
            >
              <Bell className="h-4 w-4" />
              {noLeidas > 0 && (
                <Badge
                  variant="destructive"
                  aria-hidden="true"
                  className="absolute -top-1 -right-1 h-4 min-w-4 px-1 text-2xs font-semibold leading-none flex items-center justify-center rounded-full"
                >
                  {noLeidas > 9 ? "9+" : noLeidas}
                </Badge>
              )}
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">
          Notificaciones
        </TooltipContent>
      </Tooltip>

      <PopoverContent
        align="end"
        className="w-80 p-0"
        aria-labelledby={headingId}
        onOpenAutoFocus={(event) => {
          if (!headerRef.current) return;
          event.preventDefault();
          headerRef.current.focus();
        }}
      >
        <div ref={headerRef} tabIndex={-1} className="border-b px-3 py-2">
          <SectionHeading
            as="h3"
            id={headingId}
            variant="subsection"
            actions={
              noLeidas > 0 ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={() => marcarTodasLeidas()}
                >
                  <Check className="mr-1 h-3 w-3" /> Marcar todas como leídas
                </Button>
              ) : undefined
            }
          >
            Notificaciones
          </SectionHeading>
        </div>
        <div className="max-h-96 overflow-y-auto">
          {isError && (
            <ErrorStateInline
              title="No pudimos cargar las notificaciones"
              message="Reintenta para actualizar la bandeja."
              onRetry={() => void refetch()}
              retrying={isFetching}
            />
          )}
          {!isSuccess && !isError && (
            <div role="status"><EmptyStateInline loading message="Cargando notificaciones…" /></div>
          )}
          {isSuccess && notificaciones.length === 0 && (
            <EmptyStateInline icon={Bell} message="Sin notificaciones" className="py-8" />
          )}
          {notificaciones.length > 0 && (
            <ul className="divide-y">
              {notificaciones.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => handleClick(n)}
                    aria-expanded={n.enlace ? undefined : avisoAbierto === n.id}
                    aria-controls={n.enlace ? undefined : `${headingId}-aviso-${n.id}`}
                    className={`w-full text-left px-3 py-2 hover:bg-muted/60 transition-colors ${
                      !n.leida ? "bg-accent/10" : ""
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      {!n.leida && (
                        <span aria-hidden="true" className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium truncate">
                          {!n.leida && <span className="sr-only">No leída. </span>}
                          {n.titulo}
                        </div>
                        <div id={`${headingId}-aviso-${n.id}`}
                          className={`text-xs text-muted-foreground whitespace-pre-line ${avisoAbierto === n.id ? "" : "line-clamp-2"}`}>
                          {n.mensaje}
                        </div>
                        {!n.enlace && (
                          <span className="text-label text-primary">
                            {avisoAbierto === n.id ? "Contraer mensaje" : "Leer mensaje completo"}
                          </span>
                        )}
                        <div className="text-2xs text-muted-foreground mt-0.5">
                          {formatDate(n.created_at, "dd/MM/yyyy HH:mm")}
                        </div>
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
