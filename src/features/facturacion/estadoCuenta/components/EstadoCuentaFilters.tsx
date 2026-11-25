import { Button } from "@/components/ui/button";
import SearchInput from "@/components/shared/SearchInput";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { PresetRango } from "../hooks/useEstadoCuentaDateRange";

import type { Moneda } from "../services/estadoCuentaTypes";

interface Props {
  presetActivo: PresetRango | null;
  onPreset: (p: PresetRango) => void;
  soloConSaldo: boolean;
  onSoloConSaldoChange: (v: boolean) => void;
  moneda: Moneda | "todas";
  onMonedaChange: (v: Moneda | "todas") => void;
  busqueda: string;
  onBusquedaChange: (v: string) => void;
}

const PRESETS: Array<{ id: PresetRango; label: string }> = [
  { id: "30d", label: "30 días" },
  { id: "mes", label: "Este mes" },
  { id: "trimestre", label: "Este trimestre" },
  { id: "anio", label: "Este año" },
  { id: "historico", label: "Histórico" },
];

export function EstadoCuentaFilters({
  presetActivo,
  onPreset,
  soloConSaldo,
  onSoloConSaldoChange,
  moneda,
  onMonedaChange,
  busqueda,
  onBusquedaChange,
}: Props) {
  return (
    <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
      <div className="flex flex-wrap items-center gap-1.5">
        {PRESETS.map((p) => (
          <Button
            key={p.id}
            size="sm"
            className="h-8"
            aria-pressed={presetActivo === p.id}
            variant={presetActivo === p.id ? "default" : "outline"}
            onClick={() => onPreset(p.id)}
          >
            {p.label}
          </Button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <SearchInput
          value={busqueda}
          onChange={onBusquedaChange}
          placeholder="Folio o expediente"
          aria-label="Buscar por folio o expediente"
          className="w-full sm:w-48"
          inputClassName="md:h-8"
        />

        <div className="flex items-center gap-2">
          <Label size="sm" htmlFor="ec-moneda" className="text-muted-foreground">
            Moneda
          </Label>
          <Select value={moneda} onValueChange={(v) => onMonedaChange(v as Moneda | "todas")}>
            <SelectTrigger id="ec-moneda" className="h-8 w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas</SelectItem>
              <SelectItem value="MXN">MXN</SelectItem>
              <SelectItem value="USD">USD</SelectItem>
              <SelectItem value="EUR">EUR</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <Switch
            id="ec-solo-saldo"
            checked={soloConSaldo}
            onCheckedChange={onSoloConSaldoChange}
          />
          <Label size="sm" htmlFor="ec-solo-saldo" className="cursor-pointer">
            Sólo con saldo
          </Label>
        </div>
      </div>
    </div>
  );
}
