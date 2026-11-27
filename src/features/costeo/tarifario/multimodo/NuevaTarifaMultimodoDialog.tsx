import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plane } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DatePickerMx } from "@/components/ui/date-picker-mx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormDialogShell } from "@/components/shared/FormDialogShell";
import { FormDialogCancelarBoton } from "@/components/shared/FormDialogCancelarBoton";
import { FormDialogSection } from "@/components/shared/FormDialogSection";
import { ConfirmActionDialog } from "@/components/shared/dialogs/ConfirmActionDialog";
import { ErrorStateInline } from "@/components/empty/ErrorStateInline";
import { EmptyStateInline } from "@/components/empty/EmptyStateInline";
import { useOrganization } from "@/lib/contexts/OrganizationContext";
import { useToast } from "@/hooks/shared";
import { queryKeys } from "@/lib/query";
import { notifyError } from "@/lib/ui/appFeedback";
import { useCosteoAgentes } from "@/features/costeo/hooks/useCosteoAgentes";
import { crearTarifaMultimodo } from "@/features/costeo/services/tarifas/crearMultimodo";
import { MONEDAS_TARIFA_MULTIMODO, faltantesTarifaMultimodo, usaTramos, type TarifaMultimodoForm } from "@/features/costeo/domain/tarifaMultimodo";
import { AgenteProvisionalDialog } from "@/features/costeo/components/AgenteProvisionalDialog";
import { CamposRutaMultimodo } from "./CamposRutaMultimodo";
import { TramosPesoEditor } from "./TramosPesoEditor";
import { TarifaRecargosEditor } from "@/features/costeo/components/TarifaRecargosEditor";
import type { TarifaRecargoInput } from "@/features/costeo/services/tarifas";

const VACIO: TarifaMultimodoForm = {
  modo: "Aéreo", agente_id: "", moneda: "USD", origen: "", destino: "", aerolinea: "",
  submodalidad: "", tipo_unidad: "", flete_base: 0, minimo: null,
  vigente_desde: "", vigente_hasta: "", transit_time_dias: null, tramos: [],
};
const CAMPOS_REINICIADOS = [
  "origen", "destino", "aerolinea", "submodalidad", "tipo_unidad", "escalas", "tipo_aeronave",
  "flete_base", "minimo", "vigente_desde", "vigente_hasta", "transit_time_dias", "tramos",
] as const;

interface Props {
  open: boolean; onOpenChange: (o: boolean) => void;
  /** Valores iniciales (p. ej. respuesta aérea de una solicitud de Pricing). */
  inicial?: Partial<TarifaMultimodoForm>; onSaved?: () => void;
}

function EstadoAgentes({ consulta }: { consulta: ReturnType<typeof useCosteoAgentes> }) {
  if (consulta.isError) return <ErrorStateInline title="No se pudieron consultar los agentes"
    message="Reintenta para consultar el catálogo." onRetry={() => void consulta.refetch()} retrying={consulta.isFetching} />;
  if (consulta.isLoading) return <p role="status" className="text-body-sm text-muted-foreground">Cargando agentes…</p>;
  if (!consulta.data?.length) return <EmptyStateInline message="No hay agentes disponibles." density="compact" />;
  return null;
}

export function NuevaTarifaMultimodoDialog({ open, onOpenChange, inicial, onSaved }: Props) {
  const [base] = useState<TarifaMultimodoForm>(() => ({ ...VACIO, ...inicial }));
  const [f, setF] = useState<TarifaMultimodoForm>(base);
  const [recargos, setRecargos] = useState<TarifaRecargoInput[]>([]);
  const [modoPendiente, setModoPendiente] = useState<TarifaMultimodoForm["modo"] | null>(null);
  const set = (p: Partial<TarifaMultimodoForm>) => setF((prev) => ({ ...prev, ...p }));
  const { organizationId } = useOrganization();
  const consultaAgentes = useCosteoAgentes();
  const agentes = consultaAgentes.data ?? [];
  const { toast } = useToast();
  const qc = useQueryClient();
  const faltan = faltantesTarifaMultimodo(f);
  const m = useMutation({
    mutationFn: () => {
      if (!organizationId) throw new Error("Selecciona una empresa antes de guardar.");
      return crearTarifaMultimodo(organizationId, f, recargos);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.costeo.tarifas.all });
      toast({ title: "Tarifa guardada" });
      onSaved?.(); setF(base); setRecargos([]); onOpenChange(false);
    },
    onError: (error: Error) => notifyError(undefined, {
      title: "No se pudo guardar", description: error.message, error, method: "crearTarifaMultimodo",
    }),
  });
  const aplicarModo = (modo: TarifaMultimodoForm["modo"]) => {
    setRecargos([]);
    setF({ ...base, agente_id: f.agente_id, moneda: f.moneda, modo, tipo_aeronave: null });
  };
  const cambiarModo = (modo: TarifaMultimodoForm["modo"]) => {
    if (recargos.length > 0 || CAMPOS_REINICIADOS.some((campo) => f[campo] !== base[campo])) {
      setModoPendiente(modo);
    } else {
      aplicarModo(modo);
    }
  };
  const porKg = usaTramos(f);
  return (
    <FormDialogShell open={open} onOpenChange={onOpenChange} icon={Plane} size="lg"
      title="Nueva tarifa aérea o terrestre" description="Elige la moneda de la tarifa base. Los recargos locales se capturan en MXN y los internacionales en USD."
      isDirty={f !== base || recargos.length > 0} busy={m.isPending} formId="tarifa-multimodo"
      onSubmit={(e) => { e.preventDefault(); if (faltan.length === 0) m.mutate(); }}
      footer={<>
        <FormDialogCancelarBoton onCancelar={() => onOpenChange(false)} disabled={m.isPending} />
        <Button type="submit" form="tarifa-multimodo" disabled={m.isPending || faltan.length > 0}>Guardar</Button>
      </>}>
      <FormDialogSection title="Ruta">
        <div><Label htmlFor="mm-modo">Modo *</Label>
          <Select value={f.modo} disabled={m.isPending} onValueChange={(v) => cambiarModo(v as TarifaMultimodoForm["modo"])}>
            <SelectTrigger id="mm-modo"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="Aéreo">Aéreo</SelectItem><SelectItem value="Terrestre">Terrestre</SelectItem></SelectContent>
          </Select></div>
        <div><Label htmlFor="mm-agente">Agente *</Label>
          <Select value={f.agente_id || undefined} disabled={agentes.length === 0} onValueChange={(v) => set({ agente_id: v })}>
            <SelectTrigger id="mm-agente"><SelectValue placeholder="Selecciona" /></SelectTrigger>
            <SelectContent>{agentes.map((a) => <SelectItem key={a.id} value={a.id}>{a.nombre}</SelectItem>)}</SelectContent>
          </Select>
          <EstadoAgentes consulta={consultaAgentes} />
          {!m.isPending && <AgenteProvisionalDialog onCreado={(id) => set({ agente_id: id })} />}
        </div>
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
        <div><Label htmlFor="mm-vigente-desde">Vigente desde *</Label>
          <DatePickerMx id="mm-vigente-desde" aria-label="Vigente desde" calendarLabel="Abrir calendario de vigencia desde"
            value={f.vigente_desde} onChange={(v) => set({ vigente_desde: v ?? "" })} /></div>
        <div><Label htmlFor="mm-vigente-hasta">Vigente hasta *</Label>
          <DatePickerMx id="mm-vigente-hasta" aria-label="Vigente hasta" calendarLabel="Abrir calendario de vigencia hasta"
            value={f.vigente_hasta} onChange={(v) => set({ vigente_hasta: v ?? "" })} /></div>
        <div><Label htmlFor="mm-tt">Tiempo de tránsito (días)</Label>
          <Input id="mm-tt" type="number" min={0} value={f.transit_time_dias ?? ""} onChange={(e) => set({ transit_time_dias: e.target.value === "" ? null : Number(e.target.value) })} /></div>
      </FormDialogSection>
      {porKg && (
        <FormDialogSection title="Precios por rango de peso" description="Se aplica el rango más alto que no exceda el peso tasable." cols={1}>
          <TramosPesoEditor moneda={f.moneda} tramos={f.tramos} onChange={(tramos) => set({ tramos })} />
        </FormDialogSection>
      )}
      <FormDialogSection title="Recargos" description="Se suman al flete en el desglose de la cotización." cols={1}>
        <TarifaRecargosEditor value={recargos} onChange={setRecargos} modo={f.modo} moneda={f.moneda} />
      </FormDialogSection>
      {faltan.length > 0 && <p className="text-body-sm text-muted-foreground">Falta: {faltan.join(", ")}</p>}
      <ConfirmActionDialog
        open={open && modoPendiente !== null}
        onOpenChange={(sigueAbierto) => { if (!sigueAbierto) setModoPendiente(null); }}
        title={`¿Cambiar el modo a ${modoPendiente ?? ""}?`}
        description="Se descartarán los cambios de ruta, vigencia, precios, tramos y recargos. El agente y la moneda se conservan."
        cancelLabel="Conservar captura"
        confirmLabel="Cambiar modo"
        variant="destructive"
        onConfirm={() => {
          if (modoPendiente) aplicarModo(modoPendiente);
          setModoPendiente(null);
        }}
      />
    </FormDialogShell>
  );
}
