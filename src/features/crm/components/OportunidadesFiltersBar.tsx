/**
 * Filtros avanzados para Oportunidades (cliente-side sobre el dataset ya cargado).
 */
import { FormField } from "@/components/shared/FormField";
import { FiltroLetraSelect } from "@/features/crm/components/scoring/FiltroLetraSelect";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { DatePickerMx } from "@/components/ui/date-picker-mx";
import type { CrmEtapaRow } from "@/features/crm/hooks";
import { type OportunidadesFiltros } from "./oportunidadesFiltersTypes";
import { rangoLabel } from "@/lib/ui/rangoFechasCopy";

interface Props {
  etapas: CrmEtapaRow[];
  vendedores: Array<{ id: string; email: string }>;
  value: OportunidadesFiltros;
  onChange: (next: OportunidadesFiltros) => void;
}

export default function OportunidadesFiltersBar({ etapas, vendedores, value, onChange }: Props) {
  const set = <K extends keyof OportunidadesFiltros>(k: K, v: OportunidadesFiltros[K]) =>
    onChange({ ...value, [k]: v });

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 items-end">
      <FormField label="Etapa" className="min-w-0">
        <Select value={value.etapaId} onValueChange={(v) => set("etapaId", v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas</SelectItem>
            {etapas.map((e) => <SelectItem key={e.id} value={e.id}>{e.nombre}</SelectItem>)}
          </SelectContent>
        </Select>
      </FormField>
      <FormField label="Vendedor" className="min-w-0">
        <Select value={value.vendedorId} onValueChange={(v) => set("vendedorId", v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            {vendedores.map((v) => <SelectItem key={v.id} value={v.id}>{v.email}</SelectItem>)}
          </SelectContent>
        </Select>
      </FormField>
      <FormField label={rangoLabel("Cierre", "desde")} className="min-w-0">
        <DatePickerMx calendarLabel="Abrir calendario de cierre desde" value={value.cierreDesde} onChange={(v) => set("cierreDesde", v)} className="w-full" />
      </FormField>
      <FormField label={rangoLabel("Cierre", "hasta")} className="min-w-0">
        <DatePickerMx calendarLabel="Abrir calendario de cierre hasta" value={value.cierreHasta} onChange={(v) => set("cierreHasta", v)} className="w-full" />
      </FormField>
      <FormField label="Monto mínimo" className="min-w-0">
        <Input
          id="filtro-monto-minimo"
          type="number" min={0} inputMode="numeric"
          value={value.montoMin}
          onChange={(e) => set("montoMin", e.target.value)}
          placeholder="0"
        />
      </FormField>
      <FormField label="Puntaje" className="min-w-0">
        <FiltroLetraSelect fullWidth value={value.letra} onChange={(v) => set("letra", v)} />
      </FormField>
    </div>
  );
}
