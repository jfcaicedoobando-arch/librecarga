import { StatusBadge } from "@/components/shared/StatusBadge";
import { Card, CardContent } from "@/components/ui/card";
import { usePortalFacturas, usePortalClientUsers } from "@/features/portal/hooks";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { resolverEstadoFacturaCliente } from "@/lib/domain/estadosFactura";
import { Receipt, AlertTriangle, ChevronRight } from "lucide-react";
import EmptyState from "@/components/empty/EmptyState";
import { PORTAL_LIST_MAX } from "@/features/portal/services/limits";
import { PortalPageShell } from "@/features/portal/components/layout/PortalPageShell";
import { PortalFiltersBar } from "@/features/portal/components/filtros/PortalFiltersBar";
import { PortalFacturasMobileFilters } from "@/features/portal/components/facturas/PortalFacturasMobileFilters";
import { useState, useMemo } from "react";
import { Link } from "react-router";
import { useDocumentTitle } from "@/hooks/shared";
import { estadoListadoPortal } from "@/features/portal/domain/estadoListadoPortal";
import { LoadingState } from "@/components/shared/states/LoadingState";

export default function PortalFacturas() {
  useDocumentTitle('Mis Facturas');
  const cuentas = usePortalClientUsers();
  const clientUsers = cuentas.data ?? [];
  const clienteIds = clientUsers.map((cu) => cu.cliente_id);
  const consulta = usePortalFacturas(clienteIds);
  const { data: facturas = [] } = consulta;
  const estadoListado = estadoListadoPortal(cuentas, consulta, "No pudimos cargar tus facturas");
  const [search, setSearch] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("todos");
  const filtrosActivos = Boolean(search) || filtroEstado !== "todos";

  const estados = useMemo(() => {
    const set = new Set(facturas.map((f) => f.estado));
    return Array.from(set).sort();
  }, [facturas]);

  const filtered = useMemo(() => {
    return facturas.filter((f) => {
      if (filtroEstado !== "todos" && f.estado !== filtroEstado) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          f.numero.toLowerCase().includes(q) ||
          (f.expediente ?? "").toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [facturas, search, filtroEstado]);

  if (estadoListado) {
    return (
      <PortalPageShell icon={<Receipt className="h-6 w-6 text-accent" />} title="Mis facturas">
        <LoadingState {...estadoListado} />
      </PortalPageShell>
    );
  }

  return (
    <PortalPageShell
      icon={<Receipt className="h-6 w-6 text-accent" />}
      title="Mis facturas"
      actions={<span className="text-body text-muted-foreground tabular-nums">{filtered.length} de {facturas.length}</span>}
    >
      <PortalFiltersBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Buscar por número, expediente…"
        selects={[
          {
            value: filtroEstado,
            onChange: setFiltroEstado,
            options: estados,
            placeholder: "Estado",
            allLabel: "Todos los estados",
          },
        ]}
      />

      <PortalFacturasMobileFilters
        search={search}
        onSearchChange={setSearch}
        estados={estados}
        filtroEstado={filtroEstado}
        setFiltroEstado={setFiltroEstado}
      />

      {facturas.length >= PORTAL_LIST_MAX && (
        <p className="text-body-sm text-muted-foreground">Hasta {PORTAL_LIST_MAX} registros recientes. La búsqueda aplica a esta lista.</p>
      )}

      {filtered.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title={filtrosActivos ? "No se encontraron facturas" : "Aún no tienes facturas"}
          description={facturas.length >= PORTAL_LIST_MAX
            ? "Ajusta los filtros para buscar en los registros recientes de esta lista."
            : filtrosActivos
            ? "Ajusta los filtros o busca con otro término."
            : "Aquí verás tus facturas en cuanto emitamos la primera, con su saldo y fecha de vencimiento."}
          primaryAction={filtrosActivos ? {
            label: "Limpiar filtros",
            variant: "outline",
            onClick: () => { setSearch(""); setFiltroEstado("todos"); },
          } : undefined}
        />
      ) : (
        <div className="grid gap-3">
          {facturas.length > 0 && filtered.map((f) => {
            // B-083: misma clasificación que el estado de cuenta — una
            // Emitida/Parcialmente pagada ya vencida se muestra "Vencida".
            const estadoVisible = resolverEstadoFacturaCliente(f.estado, f.fecha_vencimiento);
            return (
            <Card key={f.id} className="transition-[box-shadow,border-color] hover:shadow-raised hover:border-accent/40 focus-within:ring-2 focus-within:ring-accent/40">
              <Link
                to={`/portal/facturas/${f.id}`}
                aria-label={`Ver factura ${f.numero}`}
                className="block focus:outline-hidden"
              >
                <CardContent className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <StatusBadge domain="factura" status={estadoVisible} className="shrink-0" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-body font-mono tabular-nums">{f.numero}</p>
                        {estadoVisible === "Vencida" && <AlertTriangle className="h-3.5 w-3.5 text-destructive" />}
                      </div>
                      <p className="text-body-sm text-muted-foreground truncate">
                        Exp: <span className="font-mono">{f.expediente || (f as { embarque_expediente?: string | null }).embarque_expediente || "—"}</span> • Emisión: {f.fecha_emision ? formatDate(f.fecha_emision) : "—"}
                      </p>
                      <p className="text-label text-muted-foreground mt-0.5">
                        Vence: {f.fecha_vencimiento ? formatDate(f.fecha_vencimiento) : "—"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <p className="text-body font-bold tabular-nums text-right min-w-[110px]">
                      {formatCurrency(f.total, f.moneda)}
                    </p>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </CardContent>
              </Link>
            </Card>
            );
          })}
        </div>
      )}
    </PortalPageShell>
  );
}
