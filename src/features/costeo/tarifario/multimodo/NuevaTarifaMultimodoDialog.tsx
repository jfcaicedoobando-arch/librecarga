import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plane } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DatePickerMx } from "@/components/ui/date-picker-mx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormDialogShell } from "@/components/shared/FormDialogShell";
import { FormDialogSection } from "@/components/shared/FormDialogSection";
import { useOrganization } from "@/lib/contexts/OrganizationContext";
import { useToast } from "@/hooks/shared";
import { queryKeys } from "@/lib/query";
import { notifyError } from "@/lib/ui/appFeedback";
import { useCosteoAgentes } from "@/features/costeo/hooks/useCosteoAgentes";
import { crearTarifaMultimodo } from "@/features/costeo/services/tarifas/crearMultimodo";
import { MONEDAS_TARIFA_MULTIMODO, faltantesTarifaMultimodo, usaTramos, type TarifaMultimodoForm } from "@/features/costeo/domain/tarifaMultimodo";
import { CamposRutaMultimodo } from "./CamposRutaMultimodo";
import { TramosPesoEditor } from "./TramosPesoEditor";
import { TarifaRecargosEditor } from "@/features/costeo/components/TarifaRecargosEditor";
import type { TarifaRecargoInput } from "@/features/costeo/services/tarifas";

const VACIO: TarifaMultimodoForm = {
  modo: "Aéreo", agente_id: "", moneda: "USD", origen: "", destino: "", aerolinea: "",
  submodalidad: "", tipo_unidad: "", flete_base: 0, minimo: null,
  vigente_desde: "", vigente_hasta: "", transit_time_dias: null, tramos: [],
};

interface Props {
  open: boolean; onOpenChange: (o: boolean) => void;
  /** Valores iniciales (p. ej. respuesta aérea de una solicitud de Pricing). */
  inicial?: Partial<TarifaMultimodoForm>; onSaved?: () => void;
}

export function NuevaTarifaMultimodoDialog({ open, onOpenChange, inicial, onSaved }: Props) {
  const [base] = useState<TarifaMultimodoForm>(() => ({ ...VACIO, ...inicial }));
  const [f, setF] = useState<TarifaMultimodoForm>(base);
  const [recargos, setRecargos] = useState<TarifaRecargoInput[]>([]);
  const set = (p: Partial<TarifaMultimodoForm>) => setF((prev) => ({ ...prev, ...p }));
  const { organizationId } = useOrganization();
  const { data: agentes = [] } = useCosteoAgentes();
  const { toast } = useToast();
  const qc = useQueryClient();
  const faltan = faltantesTarifaMultimodo(f);
  const m = useMutation({
    mutationFn: () => crearTarifaMultimodo(organizationId!, f, recargos),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.costeo.tarifas.all });
      toast({ title: "Tarifa guardada" });
      onSaved?.(); setF(base); setRecargos([]); onOpenChange(false);
    },
    onError: (error: Error) => notifyError(undefined, {
      title: "No se pudo guardar", description: error.message, error, method: "crearTarifaMultimodo",
    }),
  });
  const porKg = usaTramos(f);
  return (
    <FormDialogShell open={open} onOpenChange={onOpenChange} icon={Plane} size="lg"
      title="Nueva tarifa aérea o terrestre" description="Precio en USD o MXN; los recargos usan la misma moneda. Las tarifas marítimas se capturan en «Nueva tarifa»."
      isDirty={f !== base || recargos.length > 0} busy={m.isPending} formId="tarifa-multimodo"
      onSubmit={(e) => { e.preventDefault(); if (faltan.length === 0) m.mutate(); }}
      footer={<>
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
        <Button type="submit" form="tarifa-multimodo" disabled={m.isPending || faltan.length > 0}>Guardar</Button>
      </>}>
      <FormDialogSection title="Ruta">
        <div><Label htmlFor="mm-modo">Modo *</Label>
          <Select value={f.modo} onValueChange={(v) => { setRecargos([]); setF({ ...base, agente_id: f.agente_id, moneda: f.moneda, modo: v as TarifaMultimodoForm["modo"] }); }}>
            <SelectTrigger id="mm-modo"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="Aéreo">Aéreo</SelectItem><SelectItem value="Terrestre">Terrestre</SelectItem></SelectContent>
          </Select></div>
        <div><Label htmlFor="mm-agente">Agente *</Label>
          <Select value={f.agente_id || undefined} onValueChange={(v) => set({ agente_id: v })}>
            <SelectTrigger id="mm-agente"><SelectValue placeholder="Selecciona" /></SelectTrigger>
            <SelectContent>{agentes.map((a) => <SelectItem key={a.id} value={a.id}>{a.nombre}</SelectItem>)}</SelectContent>
          </Select></div>
        <CamposRutaMultimodo f={f} set={set} />
      </FormDialogSection>
      <FormDialogSection title="Precio">
        <div><Label htmlFor="mm-moneda">Moneda *</Label>
          <Select value={f.moneda} onValueChange={(v) => set({ moneda: v as TarifaMultimodoForm["moneda"] })}>
            <SelectTrigger id="mm-moneda"><SelectValue /></SelectTrigger>
            <SelectContent>{MONEDAS_TARIFA_MULTIMODO.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
          </Select></div>
        <div><Label htmlFor="mm-flete">{porKg ? `Precio base por kg (${f.moneda}) *` : `Precio por viaje (${f.moneda}) *`}</Label>
          <Input id="mm-flete" type="number" min={0} step="0.01" value={f.flete_base} onChange={(e) => set({ flete_base: Number(e.target.value) })} /></div>
        <div><Label htmlFor="mm-min">Mínimo por embarque ({f.moneda})</Label>
          <Input id="mm-min" type="number" min={0} step="0.01" value={f.minimo ?? ""} onChange={(e) => set({ minimo: e.target.value === "" ? null : Number(e.target.value) })} /></div>
        <div><Label>Vigente desde *</Label><DatePickerMx value={f.vigente_desde} onChange={(v) => set({ vigente_desde: v ?? "" })} /></div>
        <div><Label>Vigente hasta *</Label><DatePickerMx value={f.vigente_hasta} onChange={(v) => set({ vigente_hasta: v ?? "" })} /></div>
        <div><Label htmlFor="mm-tt">Tiempo de tránsito (días)</Label>
          <Input id="mm-tt" type="number" min={0} value={f.transit_time_dias ?? ""} onChange={(e) => set({ transit_time_dias: e.target.value === "" ? null : Number(e.target.value) })} /></div>
      </FormDialogSection>
      {porKg && (
        <FormDialogSection title="Precios por rango de peso" description="Se aplica el rango más alto que no exceda el peso tasable." cols={1}>
          <TramosPesoEditor moneda={f.moneda} tramos={f.tramos} onChange={(tramos) => set({ tramos })} />
        </FormDialogSection>
      )}
      <FormDialogSection title="Recargos" description="Se suman al flete en el desglose de la cotización." cols={1}>
        <TarifaRecargosEditor value={recargos} onChange={(r) => setRecargos(r.map((x) => ({ ...x, moneda: f.moneda })))} modo={f.modo} />
      </FormDialogSection>
      {faltan.length > 0 && <p className="text-body-sm text-muted-foreground">Falta: {faltan.join(", ")}</p>}
    </FormDialogShell>
  );
}
