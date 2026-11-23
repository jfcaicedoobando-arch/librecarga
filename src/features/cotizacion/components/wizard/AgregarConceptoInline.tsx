/**
 * AgregarConceptoInline — botón único "Agregar concepto" (P2 cierre v13.296.0).
 *
 * Reemplaza los dos botones separados (USD/MXN) por un popover con:
 *  - Selector SAT (ProductoServicioSelect)
 *  - Toggle de moneda USD/MXN
 *  - Cantidad y precio unitario prefill
 *
 * Al aceptar, invoca `onAgregar(moneda, prefill)` — el hook padre calcula el
 * total con IVA con base en la tasa configurada.
 */
import { CANTIDAD_MAX } from "@/lib/validation/limitesNumericos";
import { useId, useRef, useState, type Ref } from "react";
import { MoneyInput } from "@/components/shared/MoneyInput";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ProductoServicioSelect } from "@/features/cotizacion/components/conceptos/ProductoServicioSelect";
import type { ProductoCatalogo } from "@/features/cotizacion/hooks/useProductosCatalogo";
import { tasaDesdeTipoIva } from "@/features/cotizacion/hooks/useProductosCatalogo";
import type { ConceptoVentaCotizacion } from "@/features/cotizacion/hooks/useCotizaciones";

interface Props {
  onAgregar: (moneda: "USD" | "MXN", prefill: Partial<ConceptoVentaCotizacion>) => void;
  monedaDefault?: "USD" | "MXN";
  /** Fija la moneda (oculta el toggle). */
  monedaFija?: "USD" | "MXN";
  variante?: "venta" | "costo";
  triggerLabel?: string;
  requierePrecioPositivo?: boolean;
}

function PrecioConcepto({ id, campoPrecio, precio, onChange, requerido, error, variante }: {
  id: string;
  campoPrecio: Ref<HTMLInputElement>;
  precio: number;
  onChange: (precio: number) => void;
  requerido: boolean;
  error: boolean;
  variante: Props["variante"];
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>Precio unitario {variante === "costo" ? "(costo)" : ""}</Label>
      <MoneyInput id={id} ref={campoPrecio} value={precio} onChange={onChange}
        required={requerido} aria-invalid={error || undefined} aria-describedby={requerido ? `${id}-ayuda` : undefined} />
      {requerido && (
        <p id={`${id}-ayuda`} role={error ? "alert" : undefined}
          className={error ? "text-body-sm text-destructive" : "text-body-sm text-muted-foreground"}>
          Captura un precio mayor a cero.
        </p>
      )}
    </div>
  );
}

export function AgregarConceptoInline({
  onAgregar,
  monedaDefault = "USD",
  monedaFija,
  variante = "venta",
  triggerLabel = "Agregar concepto",
  requierePrecioPositivo = false,
}: Props) {
  const id = useId();
  const campoPrecio = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [intentoAgregar, setIntentoAgregar] = useState(false);
  const [producto, setProducto] = useState<ProductoCatalogo | null>(null);
  const [moneda, setMoneda] = useState<"USD" | "MXN">(monedaFija ?? monedaDefault);
  const [cantidad, setCantidad] = useState(1);
  const [precio, setPrecio] = useState(0);
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setProducto(null);
    setMoneda(monedaFija ?? monedaDefault);
    setCantidad(1);
    setPrecio(0);
    setIntentoAgregar(false);
  };

  const handleOpenChange = (o: boolean) => {
    if (!o) reset();
    setOpen(o);
  };

  const puede = !!producto && cantidad > 0;
  const errorPrecio = intentoAgregar && requierePrecioPositivo && !(precio > 0);

  const handleAceptar = () => {
    if (!puede || !producto) return;
    if (requierePrecioPositivo && !(precio > 0)) {
      setIntentoAgregar(true);
      campoPrecio.current?.focus();
      return;
    }
    setSaving(true);
    try {
      const tasa = tasaDesdeTipoIva(producto.tipo_iva);
      onAgregar(moneda, {
        descripcion: producto.nombre,
        unidad_medida: producto.nombre_unidad ?? "",
        cantidad,
        precio_unitario: precio,
        aplica_iva: tasa > 0,
        tasa_iva_aplicada: tasa,
        tipo_iva: producto.tipo_iva,
        moneda,
      });
      handleOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" data-testid="agregar-concepto-inline">
          <Plus className="h-4 w-4 mr-1" /> {triggerLabel}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[380px] max-w-[calc(100vw-1rem)] p-4 space-y-3">
        <div className="space-y-1.5">
          <Label className="text-overline font-semibold">
            Producto / servicio
          </Label>
          <ProductoServicioSelect
            value={producto?.nombre ?? ""}
            onSelect={(p) => setProducto(p)}
            placeholder="Selecciona del catálogo SAT"
          />
        </div>

        {!monedaFija && (
          <div className="space-y-1.5">
            <Label className="text-overline font-semibold">
              Moneda
            </Label>
            <div className="inline-flex rounded-md border p-0.5">
              {(["USD", "MXN"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMoneda(m)}
                  className={
                    "px-3 py-1 text-body-sm rounded " +
                    (moneda === m
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted")
                  }
                  aria-pressed={moneda === m}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-cantidad`}>Cantidad</Label>
            <Input
              id={`${id}-cantidad`}
              type="number"
              min={1}
              max={CANTIDAD_MAX}
              step="0.01"
              value={cantidad}
              onChange={(e) => setCantidad(Number(e.target.value) || 0)}
            />
          </div>
          <PrecioConcepto id={`${id}-precio`} campoPrecio={campoPrecio} precio={precio} onChange={setPrecio}
            requerido={requierePrecioPositivo} error={errorPrecio} variante={variante} />
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" size="sm" onClick={() => handleOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" size="sm" onClick={handleAceptar} disabled={!puede} loading={saving}>
            Agregar
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
