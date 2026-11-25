import { useId, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import SearchInput from "@/components/shared/SearchInput";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Search, Ship } from "lucide-react";
import { EmptyStateInline } from "@/components/empty/EmptyStateInline";

import { nombreDesdeEmail } from "@/lib/formatters";
import { FormDialogShell } from "@/components/shared/FormDialogShell";
import type { EmbarquesPorEstadoBucket, EstadoUiKey } from "@/features/operaciones/hooks";
import { ESTADO_ICON, ESTADO_LABEL, ESTADO_TOOLTIP } from "./desempenoVisuals";
import { EmbarqueEstadoListItem } from "./embarquesEstadoDialog/EmbarqueEstadoListItem";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCloseAutoFocus?: (event: Event) => void;
  operador: string;
  estado: EstadoUiKey;
  bucket: EmbarquesPorEstadoBucket | undefined;
}

export function EmbarquesEstadoDialog({ open, onOpenChange, onCloseAutoFocus, operador, estado, bucket }: Props) {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const buscador = useRef<HTMLInputElement>(null);
  const alcanceId = useId();
  const limpiarBusqueda = () => {
    setSearch("");
    buscador.current?.focus();
  };
  const Icon = ESTADO_ICON[estado];
  const esFinalizado = estado === "Cerrado";
  const destinoLabel = esFinalizado ? "Ver embarques del operador" : "Ver todos en Embarques";

  const items = useMemo(() => bucket?.items ?? [], [bucket?.items]);
  const total = bucket?.total ?? items.length;
  const truncated = bucket?.truncated ?? false;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (e) =>
        e.expediente.toLowerCase().includes(q) ||
        (e.clienteNombre ?? "").toLowerCase().includes(q),
    );
  }, [items, search]);

  const irAEmbarques = () => {
    const params = new URLSearchParams();
    params.set("operador", operador);
    if (!esFinalizado) params.set("estado", estado);
    navigate(`/embarques?${params.toString()}`);
    onOpenChange(false);
  };

  const footer = (
    <>
      <Button variant="outline" onClick={irAEmbarques}>{destinoLabel}</Button>
      <Button onClick={() => onOpenChange(false)}>Cerrar</Button>
    </>
  );

  return (
    <FormDialogShell
      open={open}
      onOpenChange={onOpenChange}
      onCloseAutoFocus={onCloseAutoFocus}
      icon={Icon}
      title={
        <span className="flex items-center gap-2">
          <span>{nombreDesdeEmail(operador)}</span>
          <span className="text-muted-foreground font-normal">·</span>
          <span>{ESTADO_LABEL[estado]}</span>
        </span>
      }
      description={ESTADO_TOOLTIP[estado] ?? "Consulta los embarques del operador en este estado."}
      headerAside={<Badge variant="secondary" className="tabular-nums">{total}</Badge>}
      size="3xl"
      footer={footer}
    >
      <SearchInput
        ref={buscador}
        aria-label="Buscar por expediente o cliente"
        aria-describedby={truncated ? alcanceId : undefined}
        value={search}
        onChange={setSearch}
        placeholder="Buscar por expediente o cliente…"
        autoFocus
      />

      {truncated && (
        <div id={alcanceId} className="flex items-start gap-2 text-xs text-warning bg-warning/10 border border-warning/30 rounded-md p-2">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>
            Busca en los {items.length} embarques mostrados de {total}. {esFinalizado
              ? "En Embarques podrás consultar todos los estados de este operador."
              : `Usa “${destinoLabel}” para la lista completa.`}
          </span>
        </div>
      )}

      {filtered.length === 0 ? (
        <EmptyStateInline
          icon={items.length === 0 ? Ship : Search}
          message={items.length === 0 ? "Sin embarques en este estado." : "No hay coincidencias."}
          hint={items.length === 0 ? undefined : "Prueba con otro expediente o cliente."}
          action={items.length > 0 ? { label: "Limpiar búsqueda", onClick: limpiarBusqueda } : undefined}
        />

      ) : (
        <ul className="divide-y divide-border">
          {filtered.map((e) => (
            <EmbarqueEstadoListItem
              key={e.id}
              e={e}
              estado={estado}
              onNavigate={() => onOpenChange(false)}
            />
          ))}
        </ul>
      )}
    </FormDialogShell>
  );
}
