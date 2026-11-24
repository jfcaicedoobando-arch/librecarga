/**
 * Buscador de aeropuerto (catálogo IATA) para solicitudes aéreas.
 * Guarda la etiqueta "IATA — Nombre, Ciudad" como texto en POL/POD.
 */
import { useEffect, useRef, useState } from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { ErrorStateInline } from "@/components/empty/ErrorStateInline";
import { useBuscarAeropuertos } from "@/features/crm/hooks/useBuscarAeropuertos";
import { etiquetaAeropuerto, type Aeropuerto } from "@/features/crm/services/pricing/aeropuertos";

interface Props {
  id: string; label: string; value: string | null | undefined; disabled?: boolean;
  descripcionId?: string;
  invalido?: boolean;
  onChange: (etiqueta: string | null, aeropuerto: Aeropuerto | null) => void;
}

export function CampoAeropuerto({ id, label, value, disabled, descripcionId, invalido, onChange }: Props) {
  const control = useRef<HTMLButtonElement>(null);
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState("");
  const [busqueda, setBusqueda] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setBusqueda(texto.trim()), 300);
    return () => clearTimeout(t);
  }, [texto]);
  const { data = [], isFetching, isError, refetch } = useBuscarAeropuertos(busqueda, abierto);
  const termino = texto.trim();
  const esperandoBusqueda = termino !== busqueda;
  const errorActual = !esperandoBusqueda && termino.length >= 2 && isError;
  const resultados = !esperandoBusqueda && termino.length >= 2 && !errorActual ? data : [];
  const mensajeVacio = termino.length < 2 ? "Escribe al menos 2 letras"
    : esperandoBusqueda || isFetching ? "Buscando aeropuertos…" : "Sin resultados";
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-1">
        <Popover open={abierto} onOpenChange={setAbierto}>
          <PopoverTrigger asChild>
            <Button id={id} ref={control} type="button" variant="outline" role="combobox" disabled={disabled}
              aria-describedby={descripcionId} aria-invalid={invalido}
              className="min-w-0 flex-1 justify-between font-normal">
              <span className="truncate">{value || "Buscar aeropuerto…"}</span>
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
            <Command shouldFilter={false}>
              <CommandInput placeholder="Código IATA, ciudad o nombre" value={texto} onValueChange={setTexto} />
              <CommandList>
                {!errorActual && <CommandEmpty>{mensajeVacio}</CommandEmpty>}
                {resultados.map((a) => {
                  const et = etiquetaAeropuerto(a);
                  return (
                    <CommandItem key={a.iata} value={a.iata} onSelect={() => { onChange(et, a); setAbierto(false); }}>
                      <Check className={`mr-2 h-4 w-4 ${value === et ? "opacity-100" : "opacity-0"}`} />
                      <span className="truncate">{et}{a.pais ? ` · ${a.pais}` : ""}</span>
                    </CommandItem>
                  );
                })}
              </CommandList>
            </Command>
            {errorActual && <div className="p-3">
              <ErrorStateInline title="No pudimos consultar aeropuertos" message="Reintenta la búsqueda actual."
                onRetry={() => void refetch()} retrying={isFetching} />
            </div>}
          </PopoverContent>
        </Popover>
        {value && !disabled && (
          <Button type="button" size="icon" variant="ghost" aria-label={`Quitar ${label.toLowerCase()}`}
            onClick={() => {
              onChange(null, null);
              setTexto("");
              setAbierto(false);
              control.current?.focus();
            }}>
            <X className="size-4" aria-hidden />
          </Button>
        )}
      </div>
    </div>
  );
}
