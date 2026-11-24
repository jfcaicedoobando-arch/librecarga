/** Renglón de un recargo (concepto, monto, lado, base, impuesto, mínimo y proveedor). */
import { Button } from "@/components/ui/button";
import { MoneyInput } from "@/components/shared/MoneyInput";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectGroup, SelectLabel, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Trash2 } from "lucide-react";
import type { TarifaRecargoInput } from "@/features/costeo/services/tarifas";
import {
  ETIQUETA_BASE_RECARGO, baseSugerida, conceptosRecargoPorModo, gruposConceptosRecargo, type ModoRecargo,
} from "@/features/costeo/domain/conceptosRecargo";
import { etiquetaImpuesto, monedaDeAmbito } from "@/features/costeo/domain/ambitoRecargo";

interface Props {
  r: TarifaRecargoInput;
  i: number;
  modo: ModoRecargo;
  mostrarErrores: boolean;
  update: (i: number, patch: Partial<TarifaRecargoInput>) => void;
  remove: (i: number) => void;
}

export function TarifaRecargoFila({ r, i, modo, mostrarErrores, update, remove }: Props) {
  const moneda = monedaDeAmbito(r.ambito);
  return (
        <div className="space-y-2 rounded-md border border-border p-2">
        <div className="grid grid-cols-12 gap-2 items-end">
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
              currency={moneda}
              aria-label={`Monto del recargo ${i + 1} en ${moneda}`}
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
        <div className="grid grid-cols-12 gap-2">
          <div className="col-span-4">
            <Label htmlFor={`recargo-minimo-${i}`} className="text-body-sm text-muted-foreground">Mínimo (opcional)</Label>
            <MoneyInput id={`recargo-minimo-${i}`} value={r.minimo ?? 0} currency={moneda}
              onChange={(n: number) => update(i, { minimo: n > 0 ? n : null })}
              aria-label={`Mínimo del recargo ${i + 1} en ${moneda}`} />
          </div>
          <div className="col-span-3 flex items-end gap-2 pb-2">
            <Checkbox id={`recargo-impuesto-${i}`} checked={r.aplica_impuesto === true}
              onCheckedChange={(v) => update(i, { aplica_impuesto: v === true })} />
            <Label htmlFor={`recargo-impuesto-${i}`} className="text-body-sm">{etiquetaImpuesto(r.ambito)}</Label>
          </div>
          <div className="col-span-5">
            <Label htmlFor={`recargo-proveedor-${i}`} className="text-body-sm text-muted-foreground">Proveedor (vacío = el de la tarifa)</Label>
            <Input id={`recargo-proveedor-${i}`} value={r.proveedor ?? ""} maxLength={200}
              onChange={(e) => update(i, { proveedor: e.target.value })}
              aria-label={`Proveedor del recargo ${i + 1}`} />
          </div>
        </div>
        </div>
  );
}
