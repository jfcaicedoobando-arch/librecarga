import { useId } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2 } from "lucide-react";
import type { TramoPeso } from "@/features/costeo/domain/tarifaPorPeso";
import { TRAMOS_AEREOS_SUGERIDOS } from "@/features/costeo/domain/tarifaMultimodo";

interface Props { moneda?: string; tramos: TramoPeso[]; onChange: (t: TramoPeso[]) => void }

export function TramosPesoEditor({ moneda = "USD", tramos, onChange }: Props) {
  const uid = useId();
  const umbrales = new Set<number>();
  const repetidos = new Set<number>();
  for (const { desde_kg } of tramos) {
    if (umbrales.has(desde_kg)) repetidos.add(desde_kg);
    umbrales.add(desde_kg);
  }
  const set = (i: number, k: keyof TramoPeso, v: string) =>
    onChange(tramos.map((t, j) => (j === i ? { ...t, [k]: Number(v) || 0 } : t)));
  return (
    <div className="space-y-2">
      {tramos.length === 0 && (
        <Button type="button" variant="outline" size="sm"
          onClick={() => onChange(TRAMOS_AEREOS_SUGERIDOS.map((d) => ({ desde_kg: d, precio: 0 })))}>
          Usar rangos estándar (+45, +100, +300, +500, +1000 kg)
        </Button>
      )}
      {tramos.length > 0 && (
        <div className="grid grid-cols-2 gap-2 pr-11 text-body-sm font-medium">
          <span>Desde (kg)</span>
          <span>Precio por kg ({moneda})</span>
        </div>
      )}
      {tramos.map((t, i) => {
        const repetido = repetidos.has(t.desde_kg);
        const errorId = `${uid}-tramo-${i}-error`;
        return (
          <div key={i} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-start gap-2">
            <div className="space-y-1">
              <Input type="number" min={0} aria-label={`Desde kg, rango ${i + 1}`} value={t.desde_kg}
                aria-invalid={repetido || undefined} aria-describedby={repetido ? errorId : undefined}
                onChange={(e) => set(i, "desde_kg", e.target.value)} placeholder="Desde (kg)" />
              {repetido && <p id={errorId} className="text-body-sm text-destructive">Ya existe otro rango desde {t.desde_kg} kg.</p>}
            </div>
            <Input type="number" min={0} step="0.01" aria-label={`Precio por kg, rango ${i + 1}`} value={t.precio}
              onChange={(e) => set(i, "precio", e.target.value)} placeholder={`${moneda} por kg`} />
            <Button type="button" variant="ghost" size="icon" aria-label={`Quitar rango ${i + 1} (desde ${t.desde_kg} kg)`}
              onClick={() => onChange(tramos.filter((_, j) => j !== i))}><Trash2 className="size-4" /></Button>
          </div>
        );
      })}
      <Button type="button" variant="ghost" size="sm"
        onClick={() => onChange([...tramos, { desde_kg: 0, precio: 0 }])}>
        <Plus className="mr-1 size-4" /> Agregar rango
      </Button>
    </div>
  );
}
