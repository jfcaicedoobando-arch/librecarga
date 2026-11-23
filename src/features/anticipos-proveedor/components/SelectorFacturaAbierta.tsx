/** Selector de facturas ABIERTAS (saldo > 0, no canceladas) de un proveedor. Usado por AplicarAnticipoDialog. */
import { ErrorStateInline } from "@/components/empty/ErrorStateInline";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCurrency } from "@/lib/formatters";
import { useFacturasAbiertasProveedor } from "@/features/anticipos-proveedor/hooks/useFacturasAbiertasProveedor";
import { EmptyStateInline } from "@/components/empty/EmptyStateInline";
import { FileX } from "lucide-react";

interface Props {
  proveedorId: string | null;
  value: string;
  onChange: (facturaId: string, saldo: number, moneda: string, fechaEmision?: string | null) => void;
}

export function SelectorFacturaAbierta({ proveedorId, value, onChange }: Props) {
  const { data: options = [], isLoading, isError, isFetching, refetch } = useFacturasAbiertasProveedor(proveedorId);

  if (!proveedorId) {
    return (
      <Select disabled value="">
        <SelectTrigger><SelectValue placeholder="Selecciona un proveedor primero" /></SelectTrigger>
        <SelectContent />
      </Select>
    );
  }

  if (isError) {
    return (
      <ErrorStateInline
        title="No se pudieron consultar las facturas abiertas"
        message="Reintenta para elegir una factura del proveedor seleccionado."
        onRetry={() => void refetch()}
        retrying={isFetching}
      />
    );
  }

  return (
    <Select
      value={value}
      onValueChange={(id) => {
        const f = options.find((x) => x.id === id);
        onChange(id, f?.saldo ?? 0, f?.moneda ?? "MXN", f?.fecha_emision);
      }}
      disabled={isLoading}
    >
      <SelectTrigger>
        <SelectValue placeholder={isLoading ? "Cargando facturas…" : "Selecciona una factura abierta"} />
      </SelectTrigger>
      <SelectContent>
        {options.length === 0 && !isLoading && (
          <EmptyStateInline icon={FileX} message="Sin facturas abiertas para este proveedor." className="py-2" />
        )}
        {options.map((f) => (
          <SelectItem key={f.id} value={f.id}>
            {f.folio_interno} · {formatCurrency(f.saldo, f.moneda)} saldo ({f.moneda})
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
