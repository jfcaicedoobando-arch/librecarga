/**
 * Barra de controles del estado de cuenta bancario (v13.450.0):
 * cuenta, periodo con atajos, búsqueda y tipo de movimiento.
 */
import SearchInput from "@/components/shared/SearchInput";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DatePickerMx } from "@/components/ui/date-picker-mx";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  rangoAnio, rangoMes, rangoTrimestre,
  type RangoFechas, type TipoMovimientoEstadoCuenta,
} from "@/features/tesoreria/domain/estadoCuenta";

interface CuentaOption {
  id: string;
  alias: string;
  banco: string;
  moneda: string;
}

interface Props {
  cuentas: CuentaOption[];
  cuentaId: string;
  onCuentaChange: (id: string) => void;
  rango: RangoFechas;
  onRangoChange: (rango: RangoFechas) => void;
  texto: string;
  onTextoChange: (texto: string) => void;
  tipo: TipoMovimientoEstadoCuenta;
  onTipoChange: (tipo: TipoMovimientoEstadoCuenta) => void;
}

export function EstadoCuentaToolbar({
  cuentas, cuentaId, onCuentaChange, rango, onRangoChange,
  texto, onTextoChange, tipo, onTipoChange,
}: Props) {
  return (
    <Card>
      <CardContent density="compact" className="flex flex-wrap items-end gap-3">
        <div className="min-w-[220px]">
          <p className="text-body-sm text-muted-foreground mb-1">Cuenta</p>
          <Select value={cuentaId} onValueChange={onCuentaChange} disabled={cuentas.length === 0}>
            <SelectTrigger aria-label="Cuenta bancaria"><SelectValue placeholder={cuentas.length ? "Selecciona una cuenta" : "Sin cuentas activas"} /></SelectTrigger>
            <SelectContent>
              {cuentas.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.alias} · {c.moneda}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <p className="text-body-sm text-muted-foreground mb-1">Desde</p>
          <DatePickerMx
            id="ec-desde"
            name="desde"
            aria-label="Desde (fecha inicial del estado de cuenta)"
            value={rango.desde}
            onChange={(iso) => onRangoChange({ ...rango, desde: iso })}
            max={rango.hasta}
          />
        </div>
        <div>
          <p className="text-body-sm text-muted-foreground mb-1">Hasta</p>
          <DatePickerMx
            id="ec-hasta"
            name="hasta"
            aria-label="Hasta (fecha final del estado de cuenta)"
            value={rango.hasta}
            onChange={(iso) => onRangoChange({ ...rango, hasta: iso })}
            min={rango.desde}
          />
        </div>

        <div className="flex items-center gap-1">
          <Button type="button" variant="outline" size="sm" onClick={() => onRangoChange(rangoMes())}>
            Mes
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => onRangoChange(rangoTrimestre())}>
            Trimestre
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => onRangoChange(rangoAnio())}>
            Año
          </Button>
        </div>

        <div className="min-w-[200px] flex-1">
          <p className="text-body-sm text-muted-foreground mb-1">Buscar</p>
          <SearchInput
            value={texto}
            onChange={onTextoChange}
            placeholder="Concepto o referencia"
            aria-label="Buscar por concepto o referencia"
          />
        </div>

        <div className="min-w-[150px]">
          <p className="text-body-sm text-muted-foreground mb-1">Tipo</p>
          <Select value={tipo} onValueChange={(v) => onTipoChange(v as TipoMovimientoEstadoCuenta)}>
            <SelectTrigger aria-label="Tipo de movimiento"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="entradas">Solo entradas</SelectItem>
              <SelectItem value="salidas">Solo salidas</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  );
}
