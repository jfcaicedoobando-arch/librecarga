import { useState } from "react";
import { Plus, Save, Users, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { formatDate } from "@/lib/formatters";
import { useOrganization } from "@/lib/contexts/OrganizationContext";
import {
  useVendedorasConfig, useUpsertVendedoraConfig, useUpdateVendedoraConfig,
  useEmbarquesSinVendedora, useAsignarVendedoraEmbarque,
} from "@/features/comisiones/hooks";
import { EmptyStateInline } from "@/components/empty/EmptyStateInline";
import { ErrorStateInline } from "@/components/empty/ErrorStateInline";

interface VendedoraOpt { id: string; nombre: string }

const ERROR_PORCENTAJE = "Ingresa un porcentaje entre 0 y 100.";

function leerPorcentaje(captura: string | undefined): number | null {
  if (!captura?.trim()) return null;
  const porcentaje = Number(captura);
  return Number.isFinite(porcentaje) && porcentaje >= 0 && porcentaje <= 100 ? porcentaje : null;
}

interface PropsConfig {
  vendedoras: VendedoraOpt[];
  estadoUsuarios?: { cargando: boolean; error: boolean; consultando: boolean; reintentar: () => void };
}

export function TabVendedorasConfig({ vendedoras, estadoUsuarios }: PropsConfig) {
  return (
    <div className="space-y-4">
      <SeccionConfig vendedoras={vendedoras} estadoUsuarios={estadoUsuarios} />
      <SeccionEmbarquesSinAsignar vendedoras={vendedoras} />
    </div>
  );
}

function EstadoSinCandidatas({ bloqueadas, sinCandidatas, hayVendedoras }: {
  bloqueadas?: boolean;
  sinCandidatas: boolean;
  hayVendedoras: boolean;
}) {
  if (bloqueadas || !sinCandidatas) return null;
  return (
    <p className="text-body-sm text-muted-foreground">
      {hayVendedoras ? "Todas las vendedoras disponibles ya están configuradas." : "No hay usuarias elegibles para configurar."}
    </p>
  );
}

function AgregarVendedoraConfig({ vendedoras, estadoUsuarios, configs, cargandoConfiguracion, errorConfiguracion }: PropsConfig & {
  configs: { user_id: string }[];
  cargandoConfiguracion: boolean;
  errorConfiguracion: boolean;
}) {
  const { organizationId } = useOrganization();
  const upsert = useUpsertVendedoraConfig();

  const [nuevaVendedora, setNuevaVendedora] = useState("");
  const [nuevoPct, setNuevoPct] = useState("5");

  const nuevoPorcentaje = leerPorcentaje(nuevoPct);
  const disponibles = vendedoras.filter((v) => !configs.some((c) => c.user_id === v.id));
  const opcionesCargando = cargandoConfiguracion || estadoUsuarios?.cargando;
  const opcionesBloqueadas = opcionesCargando || errorConfiguracion || estadoUsuarios?.error;
  const vendedoraDisponible = disponibles.some((v) => v.id === nuevaVendedora);
  const agregarBloqueado = !vendedoraDisponible || nuevoPorcentaje === null || opcionesBloqueadas || upsert.isPending;
  const agregar = () => {
    if (agregarBloqueado || !organizationId || nuevoPorcentaje === null) return;
    upsert.mutate({
      organization_id: organizationId,
      user_id: nuevaVendedora,
      porcentaje_default: nuevoPorcentaje,
      activa: true,
    }, {
      onSuccess: () => {
        setNuevaVendedora(""); setNuevoPct("5");
      },
    });
  };

  return (
    <>
  <div className="flex flex-wrap gap-2 items-end">
  <div className="space-y-1 flex-1 min-w-[200px]">
  <Label htmlFor="vendedora-nueva">Agregar vendedora</Label>
  <Select value={nuevaVendedora} onValueChange={setNuevaVendedora} disabled={opcionesBloqueadas || disponibles.length === 0}>
  <SelectTrigger id="vendedora-nueva"><SelectValue placeholder={opcionesCargando ? "Consultando usuarios…" : "Selecciona usuario"} /></SelectTrigger>
  <SelectContent>
  {disponibles.map((v) => <SelectItem key={v.id} value={v.id}>{v.nombre}</SelectItem>)}
  </SelectContent>
  </Select>
  </div>
  <div className="space-y-1 w-24">
  <Label htmlFor="vendedora-nuevo-pct">%</Label>
  <Input id="vendedora-nuevo-pct" type="number" step="0.1" min="0" max="100" value={nuevoPct} onChange={(e) => setNuevoPct(e.target.value)}
  aria-invalid={nuevoPorcentaje === null} aria-describedby={nuevoPorcentaje === null ? "vendedora-nuevo-pct-error" : undefined} />
  </div>
  <Button onClick={agregar} disabled={agregarBloqueado}>
  <Plus className="h-4 w-4 mr-1" /> Agregar
  </Button>
  </div>

  {estadoUsuarios?.error && (
  <ErrorStateInline title="No se pudieron consultar los usuarios" message="Reintenta para ver las vendedoras disponibles."
  onRetry={estadoUsuarios.reintentar} retrying={estadoUsuarios.consultando} />
  )}
  <EstadoSinCandidatas bloqueadas={opcionesBloqueadas} sinCandidatas={disponibles.length === 0} hayVendedoras={vendedoras.length > 0} />
  {nuevoPorcentaje === null && <p id="vendedora-nuevo-pct-error" className="text-body-sm text-destructive">{ERROR_PORCENTAJE}</p>}
    </>
  );
}

function SeccionConfig({ vendedoras, estadoUsuarios }: PropsConfig) {
  const { data: configs = [], isLoading, isError, isFetching, refetch } = useVendedorasConfig();
  const update = useUpdateVendedoraConfig();
  const [pcts, setPcts] = useState<Record<string, string>>({});

  const guardarPct = (id: string) => {
    const v = leerPorcentaje(pcts[id]);
    if (v === null) return;
    update.mutate({ id, changes: { porcentaje_default: v } });
  };

  const toggleActiva = (id: string, activa: boolean) => {
    update.mutate({ id, changes: { activa } });
  };

  return (
    <Card>
      <CardHeader><CardTitle>Porcentaje por vendedora</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <AgregarVendedoraConfig vendedoras={vendedoras} estadoUsuarios={estadoUsuarios} configs={configs}
          cargandoConfiguracion={isLoading} errorConfiguracion={isError} />
        {isError ? (
          <ErrorStateInline title="No se pudieron consultar los porcentajes" message="Reintenta para ver la configuración de comisiones." onRetry={() => void refetch()} retrying={isFetching} />
        ) : isLoading ? (
          <EmptyStateInline loading message="Cargando porcentajes…" />
        ) : configs.length === 0 ? (
          <EmptyStateInline icon={Users} message="Sin vendedoras configuradas." />
        ) : (
          <div className="space-y-2">
            {configs.map((c) => {
              const v = vendedoras.find((x) => x.id === c.user_id);
              const pct = pcts[c.id] ?? String(c.porcentaje_default);
              const invalido = leerPorcentaje(pct) === null;
              const errorId = `vendedora-pct-error-${c.id}`;
              return (
                <div key={c.id} className="flex flex-wrap items-center gap-3 border rounded p-2">
                  <div className="flex-1">
                    <p className={`text-sm font-medium ${v?.nombre ? "" : "text-muted-foreground italic"}`}>
                      {v?.nombre ?? "No disponible"}
                    </p>
                    <p className="text-xs text-muted-foreground">Alta: {formatDate(c.fecha_alta.slice(0, 10))}</p>
                  </div>
                  <Input
                    type="number" step="0.1" min="0" max="100"
                    value={pct}
                    onChange={(e) => setPcts((p) => ({ ...p, [c.id]: e.target.value }))}
                    className="w-24"
                    aria-label={`Porcentaje de comisión de ${v?.nombre ?? "vendedora"}`}
                    aria-invalid={invalido} aria-describedby={invalido ? errorId : undefined}
                  />
                  <Button size="sm" variant="outline" onClick={() => guardarPct(c.id)} disabled={invalido || pcts[c.id] === undefined || update.isPending} aria-label={`Guardar porcentaje de comisión de ${v?.nombre || "vendedora sin identificar"}`}>
                    <Save className="h-4 w-4" />
                  </Button>
                  <div className="flex items-center gap-2">
                    <Switch checked={c.activa} onCheckedChange={(v) => toggleActiva(c.id, v)} aria-label={`Comisión activa de ${v?.nombre || "vendedora sin identificar"}`} />
                    <span className="text-xs text-muted-foreground">Activa</span>
                  </div>
                  {invalido && <p id={errorId} className="w-full text-body-sm text-destructive">{ERROR_PORCENTAJE}</p>}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SeccionEmbarquesSinAsignar({ vendedoras }: { vendedoras: VendedoraOpt[] }) {
  const { data: embarques = [], isLoading, isError, isFetching, refetch } = useEmbarquesSinVendedora();
  const asignar = useAsignarVendedoraEmbarque();
  const [sel, setSel] = useState<Record<string, string>>({});

  return (
    <Card>
      <CardHeader>
        <CardTitle>Embarques sin vendedora asignada{!isLoading && !isError && ` (${embarques.length})`}</CardTitle>
      </CardHeader>
      <CardContent>
        {isError ? (
          <ErrorStateInline title="No se pudieron cargar los embarques" message="Reintenta para consultar cuáles necesitan asignación." onRetry={() => void refetch()} retrying={isFetching} />
        ) : isLoading ? (
          <EmptyStateInline loading message="Cargando embarques…" />
        ) : embarques.length === 0 ? (
          <EmptyStateInline icon={CheckCircle2} message="Todos los embarques tienen vendedora asignada." />
        ) : (
          <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
            {embarques.map((e) => (
              <div key={e.id} className="flex items-center gap-2 border rounded p-2 text-sm">
                <div className="flex-1">
                  <p className="font-mono text-xs">{e.expediente}</p>
                  <p className="text-xs text-muted-foreground">{e.cliente_nombre}</p>
                </div>
                <Select value={sel[e.id] ?? ""} onValueChange={(v) => setSel((s) => ({ ...s, [e.id]: v }))}>
                  <SelectTrigger className="w-[200px]"><SelectValue placeholder="Vendedora" /></SelectTrigger>
                  <SelectContent>
                    {vendedoras.map((v) => <SelectItem key={v.id} value={v.id}>{v.nombre}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button
                  size="sm" variant="outline"
                  disabled={!sel[e.id] || asignar.isPending}
                  onClick={() => asignar.mutate({
                    embarqueId: e.id,
                    vendedoraId: sel[e.id],
                    etiqueta: `${e.expediente} → ${vendedoras.find((v) => v.id === sel[e.id])?.nombre ?? "vendedora"}`,
                  })}
                >

                  Asignar
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
