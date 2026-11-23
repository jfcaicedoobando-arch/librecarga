/** Alta/edición de un cargo FOB de agente o cargo local de naviera. */
import { useRef, useState } from "react";
import { Receipt } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { notifyError, notifySuccess } from "@/lib/ui/appFeedback";
import { costeo } from "../queryKeys";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormDialogShell } from "@/components/shared/FormDialogShell";
import { EmptyStateInline } from "@/components/empty/EmptyStateInline";
import { ErrorStateInline } from "@/components/empty/ErrorStateInline";
import { listarEntidadesCargo, guardarCargo, type CargoTarifario, type TipoCargo } from "./cargosService";
import { ConceptoNavieraSelect } from "./ConceptoNavieraSelect";

interface Props {
  tipo: TipoCargo;
  orgId: string;
  cargo: CargoTarifario | null;
  onClose: () => void;
  onSaved: () => void;
}

function valoresIniciales(tipo: TipoCargo, cargo: CargoTarifario | null) {
  const fob = tipo === "fob";
  return {
    entidad: cargo?.entidad_id ?? "",
    concepto: cargo?.concepto ?? (fob ? "Cargos FOB" : "Revalidación"),
    monto: cargo ? String(cargo.monto) : "",
    moneda: cargo?.moneda ?? (fob ? "USD" : "MXN"),
    unidad: cargo?.unidad ?? "",
    aplicaIva: cargo?.aplica_iva ?? false,
  };
}

export function CargoFormDialog({ tipo, orgId, cargo, onClose, onSaved }: Props) {
  const catalogo = useQuery({ queryKey: costeo.tarifario.entidades(tipo), queryFn: () => listarEntidadesCargo(tipo) });
  const entidades = catalogo.data ?? [];
  const sinOpciones = entidades.length === 0;
  const ini = valoresIniciales(tipo, cargo);
  const [entidad, setEntidad] = useState(ini.entidad);
  const [concepto, setConcepto] = useState(ini.concepto);
  const [monto, setMonto] = useState(ini.monto);
  const [montoVacio, setMontoVacio] = useState(false);
  const montoRef = useRef<HTMLInputElement>(null);
  const [moneda, setMoneda] = useState(ini.moneda);
  const [unidad, setUnidad] = useState(ini.unidad);
  const [aplicaIva, setAplicaIva] = useState(ini.aplicaIva);
  const [busy, setBusy] = useState(false);

  const guardar = async () => {
    if (!monto.trim()) {
      setMontoVacio(true);
      montoRef.current?.focus();
      return;
    }
    const n = Number(monto);
    if (!entidad || !concepto.trim() || !Number.isFinite(n) || n < 0) {
      notifyError(undefined, { title: "Revisa el cargo", description: "Completa el " + (tipo === "fob" ? "agente" : "naviera") + ", concepto y un monto válido.", method: "CargoFormDialog.validar" });
      return;
    }
    setBusy(true);
    try {
      await guardarCargo(tipo, orgId, { entidad_id: entidad, concepto: concepto.trim(), monto: n, moneda, unidad: unidad.trim() || null, aplica_iva: aplicaIva }, cargo?.id);
      notifySuccess(undefined, { title: "Cargo guardado" });
      onSaved();
      onClose();
    } catch (error) {
      notifyError(undefined, { title: "No se pudo guardar el cargo. Revisa que tengas permiso de Pricing.", error, method: "guardarCargo" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <FormDialogShell open onOpenChange={(o) => { if (!o) onClose(); }} icon={Receipt} busy={busy}
      title={cargo ? "Editar cargo" : "Nuevo cargo"}
      footer={<><Button variant="outline" onClick={onClose}>Cancelar</Button><Button onClick={() => void guardar()} disabled={busy || (sinOpciones && !entidad)}>Guardar</Button></>}>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1 md:col-span-2">
          <Label>{tipo === "fob" ? "Agente" : "Naviera"}</Label>
          <Select value={entidad} onValueChange={setEntidad} disabled={sinOpciones || busy}>
            <SelectTrigger><SelectValue placeholder="Selecciona" /></SelectTrigger>
            <SelectContent>{entidades.map((e) => <SelectItem key={e.id} value={e.id}>{e.nombre}</SelectItem>)}</SelectContent>
          </Select>
          <EstadoCatalogoCargo tipo={tipo} cargando={catalogo.isLoading} sinOpciones={sinOpciones}
            error={catalogo.isError} reintentando={catalogo.isFetching} onRetry={() => void catalogo.refetch()} />
        </div>
        {tipo === "fob"
          ? <div className="space-y-1 md:col-span-2"><Label htmlFor="cargo-concepto">Concepto</Label><Input id="cargo-concepto" value={concepto} onChange={(e) => setConcepto(e.target.value)} /></div>
          : <div className="md:col-span-2"><ConceptoNavieraSelect value={concepto} onChange={setConcepto} /></div>}
        <div className="space-y-1">
          <Label htmlFor="cargo-monto">Monto</Label>
          <Input
            id="cargo-monto"
            ref={montoRef}
            inputMode="decimal"
            value={monto}
            required
            aria-invalid={montoVacio || undefined}
            aria-describedby={montoVacio ? "cargo-monto-error" : undefined}
            onChange={(e) => { setMonto(e.target.value); setMontoVacio(false); }}
          />
          {montoVacio && <p id="cargo-monto-error" role="alert" className="text-body-sm text-destructive">
            Captura el monto. Escribe 0 si el cargo no tiene costo.
          </p>}
        </div>
        <div className="space-y-1">
          <Label>Currency</Label>
          <Select value={moneda} onValueChange={setMoneda}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{["USD", "MXN", "EUR"].map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1 md:col-span-2"><Label htmlFor="cargo-unidad">Unidad</Label><Input id="cargo-unidad" placeholder="Por contenedor, por BL…" value={unidad} onChange={(e) => setUnidad(e.target.value)} /></div>
        <div className="flex items-center gap-2 md:col-span-2">
          <Checkbox id="cargo-iva" checked={aplicaIva} onCheckedChange={(v) => setAplicaIva(v === true)} />
          <Label htmlFor="cargo-iva">Aplica IVA (se suma al monto en la lista)</Label>
        </div>
      </div>
    </FormDialogShell>
  );
}

function EstadoCatalogoCargo({ tipo, cargando, error, sinOpciones, reintentando, onRetry }: {
  tipo: TipoCargo;
  cargando: boolean;
  error: boolean;
  sinOpciones: boolean;
  reintentando: boolean;
  onRetry: () => void;
}) {
  if (cargando) {
    return <div role="status"><EmptyStateInline loading density="compact" message="Cargando opciones del catálogo…" /></div>;
  }
  if (error) {
    return <ErrorStateInline message="No se pudo consultar el catálogo del cargo." onRetry={onRetry} retrying={reintentando} />;
  }
  if (!sinOpciones) return null;

  const esFob = tipo === "fob";
  return <EmptyStateInline density="compact"
    message={esFob ? "No hay agentes activos." : "No hay navieras activas."}
    hint={esFob ? "Da de alta un agente en Costeo › Agentes." : "Da de alta una naviera en Costeo › Condiciones por naviera."}
  />;
}
