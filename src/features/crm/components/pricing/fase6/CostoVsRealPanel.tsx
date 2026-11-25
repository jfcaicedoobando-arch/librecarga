/** Pestaña «Cotizado vs real»: solicitudes respondidas con su comparación de costos. */
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/PageHeader";
import PaginationControls from "@/components/shared/PaginationControls";
import { EmptyStateInline } from "@/components/empty/EmptyStateInline";
import { ErrorStateInline } from "@/components/empty/ErrorStateInline";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TabsModoPricing } from "@/features/crm/components/pricing/TabsModoPricing";
import { useUsuariosOrgCrm } from "@/features/crm/hooks/usePricingCrm";
import { useCostoVsReal, useListaCostoReal } from "@/features/crm/hooks/useRecotizarPricing";
import { PAGINA_COSTO_REAL } from "@/features/crm/services/pricing/recotizarPricing";
import { ETIQUETA_ESTADO_COSTO } from "@/features/crm/services/pricing/costoVsRealPricing";
import { TablaCostoReal } from "./CostoVsRealPricing";

const ROLES = new Set(["ejecutivo_pricing", "gerente_operaciones"]);

export function CostoVsRealPanel() {
  const [modo, setModo] = useState("todos");
  const [ejecutivo, setEjecutivo] = useState("todos");
  const [pagina, setPagina] = useState(0);
  const lista = useListaCostoReal(pagina, modo, ejecutivo);
  const filas = lista.data?.filas ?? [];
  const costos = useCostoVsReal(filas.map((f) => f.id));
  const usuarios = (useUsuariosOrgCrm().data ?? []).filter((u) => ROLES.has(u.role));
  const total = lista.data?.total ?? 0;
  const reiniciar = (f: () => void) => { f(); setPagina(0); };

  return (
    <div className="space-y-4">
      <PageHeader title="Costo cotizado vs real"
        description="Compara lo que Pricing cotizó contra las facturas de proveedor del embarque, moneda por moneda." />
      <TabsModoPricing valor={modo} onCambiar={(v) => reiniciar(() => setModo(v))} />
      <Select value={ejecutivo} onValueChange={(v) => reiniciar(() => setEjecutivo(v))}>
        <SelectTrigger className="w-56" aria-label="Ejecutivo de Pricing"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="todos">Todos los ejecutivos</SelectItem>
          {usuarios.map((u) => <SelectItem key={u.user_id} value={u.user_id}>{u.nombre}</SelectItem>)}
        </SelectContent>
      </Select>
      {lista.isError ? <ErrorStateInline message="No se pudieron cargar las solicitudes." onRetry={() => void lista.refetch()} />
        : lista.isLoading ? <EmptyStateInline loading message="Cargando…" />
        : total === 0 ? <EmptyStateInline message="No hay solicitudes respondidas con estos filtros." />
        : (
          <>
            <ul className="space-y-2">
              {filas.map((s) => {
                const resumen = costos.data?.get(s.id);
                const etiqueta = resumen ? ETIQUETA_ESTADO_COSTO[resumen.estado]
                  : costos.isError ? "Comparación no disponible"
                  : costos.isSuccess ? ETIQUETA_ESTADO_COSTO.sin_cotizacion : "Calculando…";
                return (
                  <li key={s.id}>
                    <Card>
                      <CardContent density="tight" className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{s.folio}</span>
                          <span className="text-body-sm">{s.cliente ?? "Sin cliente"}</span>
                          <span className="text-body-sm text-muted-foreground">{s.servicio}</span>
                          <Badge variant="outline">{etiqueta}</Badge>
                          {resumen?.expediente && <span className="text-caption text-muted-foreground">{resumen.expediente}</span>}
                        </div>
                        {resumen && <TablaCostoReal resumen={resumen} />}
                      </CardContent>
                    </Card>
                  </li>
                );
              })}
            </ul>
            <PaginationControls page={pagina} totalPages={Math.max(1, Math.ceil(total / PAGINA_COSTO_REAL))}
              total={total} pageSize={PAGINA_COSTO_REAL} onPageChange={setPagina} />
          </>
        )}
      {costos.isError && (
        <ErrorStateInline message="No se pudo calcular la comparación de costos."
          onRetry={() => void costos.refetch()} retrying={costos.isFetching} />
      )}
    </div>
  );
}
