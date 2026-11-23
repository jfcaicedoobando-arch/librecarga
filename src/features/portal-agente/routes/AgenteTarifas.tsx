/**
 * Listado de tarifas del agente. Permite crear, editar (sólo borradores/rechazadas)
 * y duplicar (cualquier estado). La aprobación a 'vigente' la hace operaciones.
 * v13.172.17: migrado de `<Table>` crudo a `DataTable` (Fase 4 homologación).
 * v13.182.0: columnas + `EstadoBadge` extraídos a `_sections/agenteTarifasColumns.tsx`.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/shared/PageHeader";
import { ResponsiveDataTable } from "@/components/shared/dataTable/ResponsiveDataTable";
import { useAgenteTarifas } from "@/features/portal-agente/hooks";
import { AgenteTarifaForm } from "@/features/portal-agente/components/AgenteTarifaForm";
import { Plus, FileSpreadsheet } from "lucide-react";
import type { TarifaInput, TarifaRecargoInput } from "@/features/costeo/services/tarifas";
import { fetchRecargosDeTarifa } from "@/features/costeo/services/topTarifas";
import type { AgenteTarifaRow } from "@/features/portal-agente/services";
import {
  buildAgenteTarifasColumns,
  toInitial,
} from "./_sections/agenteTarifasColumns";
import { AgenteTarifaCard } from "./_sections/AgenteTarifaCard";
import { todayLocalISO } from "@/lib/date/today";
import { ErrorState } from "@/components/shared/states/ErrorState";
import { EmptyStateInline } from "@/components/empty/EmptyStateInline";
import { FILTROS_TARIFAS_AGENTE, filtroDeTarifaAgente, type FiltroTarifasAgente } from "./_sections/agenteTarifasFiltros";
import { notifyError } from "@/lib/ui/appFeedback";
import { getErrorMessage } from "@/lib/errors";

interface EditorState {
  open: boolean;
  modo: "crear" | "editar" | "duplicar";
  tarifaId?: string;
  initial?: Partial<TarifaInput>;
}

function recargosIniciales(
  rows: Awaited<ReturnType<typeof fetchRecargosDeTarifa>>,
  conservarId: boolean,
): TarifaRecargoInput[] {
  return rows.map((r) => ({
    ...(conservarId ? { id: r.id } : {}),
    concepto: r.concepto,
    lado: r.lado === "origen" || r.lado === "destino" ? r.lado : undefined,
    monto: Number(r.monto),
    moneda: r.moneda ?? "USD",
    incluido_en_total: r.incluido_en_total ?? true,
    base: r.base === "por_embarque" ? "por_embarque" : "por_unidad",
  }));
}

export default function AgenteTarifas() {
  const { data: tarifas = [], isLoading, isError, refetch } = useAgenteTarifas();
  const [searchParams, setSearchParams] = useSearchParams();
  const estado = searchParams.get("estado");
  const filtro = estado === "rechazadas" ? "rechazada" : FILTROS_TARIFAS_AGENTE.find(({ value }) => value === estado)?.value ?? "todas";
  const setFiltro = (value: FiltroTarifasAgente) => {
    setSearchParams((prev) => {
      const siguiente = new URLSearchParams(prev);
      if (value === "todas") siguiente.delete("estado");
      else siguiente.set("estado", value === "rechazada" ? "rechazadas" : value);
      return siguiente;
    }, { replace: true });
  };
  const [editor, setEditor] = useState<EditorState>({ open: false, modo: "crear" });
  const [tarifaEnCarga, setTarifaEnCarga] = useState<string | null>(null);
  const solicitud = useRef(0);
  useEffect(() => () => { solicitud.current += 1; }, []);

  const hoy = todayLocalISO();
  const clasificadas = useMemo(
    () => tarifas.map((tarifa) => ({ tarifa, filtro: filtroDeTarifaAgente(tarifa, hoy) })),
    [tarifas, hoy],
  );

  const filtradas = useMemo(() => {
    if (filtro === "todas") return tarifas;
    return clasificadas.filter((t) => t.filtro === filtro).map((t) => t.tarifa);
  }, [tarifas, filtro, clasificadas]);

  const abrirTarifa = useCallback(async function cargarTarifa(t: AgenteTarifaRow, modo: "editar" | "duplicar") {
    const pedido = ++solicitud.current;
    setTarifaEnCarga(t.id);
    const editar = modo === "editar";
    try {
      const rows = await fetchRecargosDeTarifa(t.id);
      if (solicitud.current !== pedido) return;
      setEditor({
        open: true, modo, tarifaId: editar ? t.id : undefined,
        initial: toInitial(t, recargosIniciales(rows, editar)),
      });
    } catch (error: unknown) {
      if (solicitud.current !== pedido) return;
      notifyError(undefined, editar ? {
        title: "No se pudo abrir la tarifa para editar",
        description: getErrorMessage(error), error, method: "AGENTE_EDITAR_TARIFA",
      } : {
        title: "No se pudieron cargar los recargos de la tarifa",
        description: "Reintenta para duplicar la tarifa con sus recargos.",
        error, method: "AGENTE_DUPLICAR_TARIFA", context: { tarifaId: t.id },
        action: { label: "Reintentar", onClick: () => { void cargarTarifa(t, modo); } },
      });
    } finally {
      if (solicitud.current === pedido) setTarifaEnCarga(null);
    }
  }, []);

  const nuevaTarifa = () => {
    solicitud.current += 1;
    setTarifaEnCarga(null);
    setEditor({ open: true, modo: "crear" });
  };

  const columns = useMemo(
    () => buildAgenteTarifasColumns({
      onEditar: (t) => { void abrirTarifa(t, "editar"); },
      onDuplicar: (t) => { void abrirTarifa(t, "duplicar"); },
      tarifaEnCarga,
    }),
    [abrirTarifa, tarifaEnCarga],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<FileSpreadsheet className="h-6 w-6 text-accent" />}
        title="Mis tarifas marítimas"
        description="Tarifas que has subido para tus rutas marítimas. Las nuevas tarifas quedan en borrador hasta que operaciones las aprueba."
        actions={
          <Button onClick={nuevaTarifa}>
            <Plus className="h-4 w-4 mr-1" /> Nueva tarifa
          </Button>
        }
      />

      <Card className="p-3">
        <p className="text-xs text-muted-foreground">
          <strong>¿Cómo funciona?</strong> Captura o actualiza una tarifa y queda en <em>borrador</em>.
          Operaciones la revisa y la pasa a <em>vigente</em> — entonces aparece como opción en las
          cotizaciones que envían los vendedores. Si la <em>rechazan</em>, edítala y vuelve a guardarla.
          Las tarifas <em>vigentes</em> no se pueden editar: usa <strong>Duplicar</strong> para crear una versión nueva.
        </p>
      </Card>

      <Tabs value={filtro} onValueChange={(v) => setFiltro(v as FiltroTarifasAgente)}>
        <TabsList className="h-auto flex flex-wrap justify-start gap-1">
          {FILTROS_TARIFAS_AGENTE.map(({ value, label }) => (
            <TabsTrigger key={value} value={value}>
              {label} ({value === "todas" ? tarifas.length : clasificadas.filter((t) => t.filtro === value).length})
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {isError ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : (
      <ResponsiveDataTable<AgenteTarifaRow>
        columns={columns}
        data={filtradas}
        rowKey={(t) => t.id}
        isLoading={isLoading}
        emptyState={tarifas.length === 0
          ? <EmptyStateInline message="Aún no has registrado tarifas."
              action={{ label: "Nueva tarifa", onClick: nuevaTarifa }} />
          : <EmptyStateInline message="No hay tarifas en este estado."
              action={{ label: "Ver todas las tarifas", onClick: () => setFiltro("todas") }} />}
        mobileCard={(t) => (
          <AgenteTarifaCard
            t={t}
            onEditar={(x) => { void abrirTarifa(x, "editar"); }}
            onDuplicar={(x) => { void abrirTarifa(x, "duplicar"); }}
            tarifaEnCarga={tarifaEnCarga}
          />
        )}
      />
      )}


      <AgenteTarifaForm
        open={editor.open}
        onOpenChange={(o) => setEditor((s) => ({ ...s, open: o }))}
        modo={editor.modo}
        tarifaId={editor.tarifaId}
        initial={editor.initial}
      />
    </div>
  );
}
