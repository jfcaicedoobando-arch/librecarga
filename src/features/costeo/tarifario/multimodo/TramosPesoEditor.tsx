import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2 } from "lucide-react";
import type { TramoPeso } from "@/features/costeo/domain/tarifaPorPeso";
import { TRAMOS_AEREOS_SUGERIDOS } from "@/features/costeo/domain/tarifaMultimodo";

interface Props { moneda?: string; tramos: TramoPeso[]; onChange: (t: TramoPeso[]) => void }

export function TramosPesoEditor({ moneda = "USD", tramos, onChange }: Props) {
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
      {tramos.map((t, i) => (
        <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center">
          <Input type="number" min={0} aria-label={`Desde kg, rango ${i + 1}`} value={t.desde_kg}
            onChange={(e) => set(i, "desde_kg", e.target.value)} placeholder="Desde (kg)" />
          <Input type="number" min={0} step="0.01" aria-label={`Precio por kg, rango ${i + 1}`} value={t.precio}
            onChange={(e) => set(i, "precio", e.target.value)} placeholder={`${moneda} por kg`} />
          <Button type="button" variant="ghost" size="icon" aria-label="Quitar rango"
            onClick={() => onChange(tramos.filter((_, j) => j !== i))}><Trash2 className="size-4" /></Button>
        </div>
      ))}
      <Button type="button" variant="ghost" size="sm"
        onClick={() => onChange([...tramos, { desde_kg: 0, precio: 0 }])}>
        <Plus className="mr-1 size-4" /> Agregar rango
      </Button>
    </div>
  );
}
