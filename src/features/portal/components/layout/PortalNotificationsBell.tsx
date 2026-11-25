import { useId, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { Bell, CheckCheck } from "lucide-react";
import { SectionHeading } from "@/components/shared/SectionHeading";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import {
  useNotificacionesCliente,
  useMarcarNotificacionLeida,
  useMarcarTodasLeidas,
  type NotificacionCliente,
} from "@/features/portal/hooks";
import { formatDateTimeShort } from "@/lib/formatters";
import { cn } from "@/lib/utils";

export function PortalNotificationsBell() {
  const { data: items = [] } = useNotificacionesCliente();
  const marcar = useMarcarNotificacionLeida();
  const marcarTodas = useMarcarTodasLeidas();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const headingId = useId();
  const headerRef = useRef<HTMLDivElement>(null);
  const marcasEnviadas = useRef(new Set<string>());
  const noLeidas = items.filter((n) => !n.leida_at).length;

  const abrirNotificacion = (n: NotificacionCliente) => {
    if (!n.leida_at && !marcasEnviadas.current.has(n.id)) {
      marcasEnviadas.current.add(n.id);
      void marcar.mutateAsync(n.id).catch(() => {
        marcasEnviadas.current.delete(n.id);
      });
    }
    if (n.url) {
      setOpen(false);
      navigate(n.url);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={noLeidas ? `Notificaciones, ${noLeidas} sin leer` : "Notificaciones"}
        >
          <Bell className="h-5 w-5" aria-hidden />
          {noLeidas > 0 && (
            <Badge
              variant="destructive"
              aria-hidden="true"
              className="absolute -top-1 -right-1 h-4 min-w-4 px-1 text-label tabular-nums rounded-full"
            >
              {noLeidas > 99 ? "99+" : noLeidas}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        aria-labelledby={headingId}
        className="w-[min(350px,calc(100vw-24px))] p-0"
        onOpenAutoFocus={(event) => {
          if (!headerRef.current) return;
          event.preventDefault();
          headerRef.current.focus();
        }}
      >
        <div ref={headerRef} tabIndex={-1} className="flex items-center justify-between border-b px-3 py-2">
          <SectionHeading id={headingId} as="h3">Notificaciones</SectionHeading>
          {noLeidas > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 text-body-sm"
              onClick={() => marcarTodas.mutate()}
              loading={marcarTodas.isPending}
            >
              <CheckCheck className="h-3.5 w-3.5" aria-hidden />
              Marcar todas como leídas
            </Button>
          )}
        </div>
        <div className="max-h-80 overflow-y-auto">
          {items.length === 0 ? (
            <p className="px-3 py-8 text-center text-body-sm text-muted-foreground">
              Sin notificaciones por ahora.
            </p>
          ) : (
            <ul className="divide-y">
              {items.map((n) => (
                <li key={n.id}>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => abrirNotificacion(n)}
                    aria-label={n.leida_at ? n.titulo : `No leída. ${n.titulo}`}
                    aria-describedby={`${headingId}-detalle-${n.id}`}
                    className={cn(
                      "h-auto w-full justify-start whitespace-normal rounded-none px-3 py-2.5 text-left md:h-auto",
                      !n.leida_at && "bg-accent/5",
                    )}
                  >
                    <span className="flex w-full items-start gap-2">
                      {!n.leida_at && (
                        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent" aria-hidden />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-body-sm font-medium">
                          {n.titulo}
                        </span>
                        <span id={`${headingId}-detalle-${n.id}`}>
                          {n.mensaje && (
                            <span className="line-clamp-2 text-label text-muted-foreground">{n.mensaje}</span>
                          )}
                          <span className="mt-0.5 block text-label tabular-nums text-muted-foreground">
                            {formatDateTimeShort(n.created_at)}
                          </span>
                        </span>
                      </span>
                    </span>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
