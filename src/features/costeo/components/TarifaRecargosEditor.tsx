/**
 * Editor de recargos de una tarifa (marítima, aérea o terrestre), separado en
 * locales (MXN, + IVA opcional) e internacionales (USD, + VAT opcional).
 */
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Plus } from "lucide-react";
import { EmptyStateInline } from "@/components/empty/EmptyStateInline";
import type { TarifaRecargoInput } from "@/features/costeo/services/tarifas";
import { conceptosRecargoPorModo, type ModoRecargo } from "@/features/costeo/domain/conceptosRecargo";
import { ambitoDeRecargo, monedaDeAmbito, type AmbitoRecargo } from "@/features/costeo/domain/ambitoRecargo";
import { TarifaRecargoFila } from "./TarifaRecargoFila";

interface Props {
  value: TarifaRecargoInput[];
  onChange: (next: TarifaRecargoInput[]) => void;
  /** P2-A8: pinta en rojo los recargos con monto <= 0 tras intentar guardar. */
  mostrarErrores?: boolean;
  /** Modo de la tarifa: define los conceptos sugeridos. */
  modo?: ModoRecargo;
  /** Moneda de la tarifa: decide el tipo de los recargos sin tipo guardado. */
  moneda?: string;
}

const BLOQUES: { ambito: AmbitoRecargo; titulo: string }[] = [
  { ambito: "local", titulo: "Recargos locales (MXN)" },
  { ambito: "internacional", titulo: "Recargos internacionales (USD)" },
];

export function TarifaRecargosEditor({ value, onChange, mostrarErrores = false, modo = "Marítimo", moneda = "USD" }: Props) {
  const filas = value.map((r) => {
    const ambito = ambitoDeRecargo(r, moneda);
    return { ...r, ambito, moneda: monedaDeAmbito(ambito) };
  });
  const update = (i: number, patch: Partial<TarifaRecargoInput>) =>
    onChange(filas.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const remove = (i: number) => onChange(filas.filter((_, idx) => idx !== i));
  const add = (ambito: AmbitoRecargo) =>
    onChange([...filas, {
      concepto: conceptosRecargoPorModo(modo)[0], monto: 0, lado: ambito === "local" ? "destino" : "origen",
      incluido_en_total: true, base: "por_unidad", ambito, moneda: monedaDeAmbito(ambito), aplica_impuesto: false,
    }]);

  return (
    <div className="space-y-4">
      {BLOQUES.map((b) => {
        const indices = filas.map((r, i) => (r.ambito === b.ambito ? i : -1)).filter((i) => i >= 0);
        return (
          <div key={b.ambito} className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>{b.titulo}</Label>
              <Button type="button" size="sm" variant="outline" onClick={() => add(b.ambito)}
                aria-label={`Agregar recargo ${b.ambito}`}>
                <Plus className="size-3.5 mr-1" /> Agregar recargo
              </Button>
            </div>
            {indices.length === 0 && (
              <EmptyStateInline message="Sin recargos en este bloque." className="py-3" />
            )}
            {indices.map((i) => (
              <TarifaRecargoFila key={i} r={filas[i]} i={i} modo={modo}
                mostrarErrores={mostrarErrores} update={update} remove={remove} />
            ))}
          </div>
        );
      })}
    </div>
  );
}
