import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAsignacionCoordinador } from "../hooks/useAsignacionCoordinador";

const SIN_ASIGNAR = "sin_asignar";

interface Props {
  value: string | null;
  label: string;
  editable: boolean;
  permitirVacio?: boolean;
  /** La ficha del cliente sólo admite coordinadores; el handover también gerentes. */
  soloCoordinadores?: boolean;
  onGuardar: (coordinadorId: string | null) => Promise<void>;
  onGuardado: () => void;
}

/** Muestra el coordinador; si el rol puede, permite cambiarlo con un RPC validado en la base. */
export function CoordinadorSelect({ value, label, editable, permitirVacio, soloCoordinadores, onGuardar, onGuardado }: Props) {
  const { opciones, mutation } = useAsignacionCoordinador(onGuardar, onGuardado);
  const nombre = nombreDe(opciones.data, value);
  const opcionesVisibles = (opciones.data?.opciones ?? [])
    .filter((o) => !soloCoordinadores || o.role === "coordinador_logistico");

  if (!editable) {
    return <div className="min-w-0"><dt className="text-muted-foreground">{label}</dt><dd className="font-medium">{nombre}</dd></div>;
  }
  return (
    <div className="min-w-0 space-y-1">
      <label className="text-muted-foreground block" htmlFor={`coord-${label}`}>{label}</label>
      <Select
        value={value ?? SIN_ASIGNAR}
        disabled={mutation.isPending || opciones.isLoading}
        onValueChange={(v) => mutation.mutate(v === SIN_ASIGNAR ? null : v)}
      >
        <SelectTrigger id={`coord-${label}`} aria-label={label}><SelectValue placeholder="Sin asignar" /></SelectTrigger>
        <SelectContent>
          {(permitirVacio || !value) && <SelectItem value={SIN_ASIGNAR} disabled={!permitirVacio}>Sin asignar</SelectItem>}
          {value && !opcionesVisibles.some((o) => o.id === value) && <SelectItem value={value}>{nombre}</SelectItem>}
          {opcionesVisibles.map((o) => <SelectItem key={o.id} value={o.id}>{o.nombre}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

function nombreDe(data: { nombres: Map<string, string> } | undefined, id: string | null): string {
  if (!id) return "Sin asignar";
  return data?.nombres.get(id) ?? "—";
}
