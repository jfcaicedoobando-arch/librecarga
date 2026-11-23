/**
 * Buscador de aeropuerto (catálogo IATA) para solicitudes aéreas.
 * Guarda la etiqueta "IATA — Nombre, Ciudad" como texto en POL/POD.
 */
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { buscarAeropuertos, etiquetaAeropuerto, type Aeropuerto } from "@/features/crm/services/pricing/aeropuertos";

interface Props {
  id: string; label: string; value: string | null | undefined; disabled?: boolean;
  onChange: (etiqueta: string | null, aeropuerto: Aeropuerto | null) => void;
}

export function CampoAeropuerto({ id, label, value, disabled, onChange }: Props) {
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState("");
  const [busqueda, setBusqueda] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setBusqueda(texto.trim()), 300);
    return () => clearTimeout(t);
  }, [texto]);
  const { data = [], isFetching } = useQuery({
    queryKey: ["aeropuertos", "buscar", busqueda],
    queryFn: () => buscarAeropuertos(busqueda),
    enabled: abierto && busqueda.length >= 2,
    staleTime: 3_600_000,
  });
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Popover open={abierto} onOpenChange={setAbierto}>
        <PopoverTrigger asChild>
          <Button id={id} type="button" variant="outline" role="combobox" disabled={disabled}
            className="w-full justify-between font-normal">
            <span className="truncate">{value || "Buscar aeropuerto…"}</span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput placeholder="Código IATA, ciudad o nombre" value={texto} onValueChange={setTexto} />
            <CommandList>
              <CommandEmpty>{busqueda.length < 2 ? "Escribe al menos 2 letras" : isFetching ? "Buscando…" : "Sin resultados"}</CommandEmpty>
              {data.map((a) => {
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
        </PopoverContent>
      </Popover>
    </div>
  );
}
