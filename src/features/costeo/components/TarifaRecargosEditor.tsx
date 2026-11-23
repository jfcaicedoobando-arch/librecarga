/**
 * Editor de filas dinámicas para recargos de una tarifa (marítima, aérea o terrestre).
 * Conceptos sugeridos por modo (`conceptosRecargoPorModo`) y base de cobro por recargo.
 */
import { Button } from "@/components/ui/button";
import { MoneyInput } from "@/components/shared/MoneyInput";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectGroup, SelectLabel, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
import { EmptyStateInline } from "@/components/empty/EmptyStateInline";
import type { TarifaRecargoInput } from "@/features/costeo/services/tarifas";

import {
  ETIQUETA_BASE_RECARGO, baseSugerida, conceptosRecargoPorModo, gruposConceptosRecargo, type ModoRecargo,
} from "@/features/costeo/domain/conceptosRecargo";

interface Props {
  value: TarifaRecargoInput[];
  onChange: (next: TarifaRecargoInput[]) => void;
  /** P2-A8: pinta en rojo los recargos con monto <= 0 tras intentar guardar. */
  mostrarErrores?: boolean;
  /** Modo de la tarifa: define los conceptos sugeridos. */
  modo?: ModoRecargo;
}

export function TarifaRecargosEditor({ value, onChange, mostrarErrores = false, modo = "Marítimo" }: Props) {
  const update = (i: number, patch: Partial<TarifaRecargoInput>) => {
    onChange(value.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  };
  const add = () =>
    onChange([
      ...value,
      { concepto: conceptosRecargoPorModo(modo)[0], monto: 0, lado: "origen", incluido_en_total: true, base: "por_unidad" },
    ]);
  const remove = (i: number) => onChange(value.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>Recargos (USD)</Label>
        <Button type="button" size="sm" variant="outline" onClick={add}>
          <Plus className="size-3.5 mr-1" /> Agregar recargo
        </Button>
      </div>

      {value.length === 0 && (
        <EmptyStateInline message="Sin recargos. Sólo se cobrará el flete base." className="py-3" />
      )}

      {value.map((r, i) => (
        <div key={i} className="grid grid-cols-12 gap-2 items-end">
          <div className="col-span-3">
            <Label htmlFor={`recargo-concepto-${i}`} className="sr-only">{`Concepto del recargo ${i + 1}`}</Label>
            <Select value={r.concepto} onValueChange={(v) => update(i, { concepto: v, base: baseSugerida(v) })}>
              <SelectTrigger
                id={`recargo-concepto-${i}`}
                aria-label={`Concepto del recargo ${i + 1}`}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {r.concepto && !conceptosRecargoPorModo(modo).includes(r.concepto) && (
                  <SelectItem value={r.concepto}>{r.concepto}</SelectItem>
                )}
                {gruposConceptosRecargo(modo).map((g) => (
                  <SelectGroup key={g.grupo}>
                    <SelectLabel>{g.nombre}</SelectLabel>
                    {g.conceptos.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-3">
            <Label htmlFor={`recargo-monto-${i}`} className="sr-only">{`Monto del recargo ${i + 1}`}</Label>
            <MoneyInput
              id={`recargo-monto-${i}`}
              value={r.monto}
              onChange={(n: number) => update(i, { monto: n })}
              currency="USD"
              aria-label={`Monto del recargo ${i + 1} en USD`}
              aria-invalid={mostrarErrores && !(Number(r.monto) > 0) ? true : undefined}
              aria-describedby={mostrarErrores && !(Number(r.monto) > 0) ? `recargo-monto-err-${i}` : undefined}
            />
            {mostrarErrores && !(Number(r.monto) > 0) && (
              <p id={`recargo-monto-err-${i}`} className="mt-1 text-body-sm text-destructive">
                Captura un monto mayor a 0 o quita el recargo.
              </p>
            )}
          </div>
          <div className="col-span-2">
            <Label htmlFor={`recargo-lado-${i}`} className="sr-only">{`Lado del recargo ${i + 1}`}</Label>
            <Select value={r.lado ?? "origen"} onValueChange={(v) => update(i, { lado: v as "origen" | "destino" })}>
              <SelectTrigger
                id={`recargo-lado-${i}`}
                aria-label={`Lado del recargo ${i + 1}`}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="origen">Origen</SelectItem>
                <SelectItem value="destino">Destino</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-3">
            <Label htmlFor={`recargo-base-${i}`} className="sr-only">{`Base del recargo ${i + 1}`}</Label>
            <Select value={r.base ?? "por_unidad"} onValueChange={(v) => update(i, { base: v as "por_unidad" | "por_embarque" })}>
              <SelectTrigger id={`recargo-base-${i}`} aria-label={`Base del recargo ${i + 1}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="por_unidad">{ETIQUETA_BASE_RECARGO.por_unidad}</SelectItem>
                <SelectItem value="por_embarque">{ETIQUETA_BASE_RECARGO.por_embarque}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-1 flex justify-end">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={() => remove(i)}
              aria-label={`Quitar recargo ${i + 1}`}
            >
              <Trash2 className="size-4 text-destructive" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
