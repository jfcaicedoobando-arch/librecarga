import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DimensionLCL, DimensionAerea } from "@/features/cotizacion/hooks";
import { itemsBanderasAereas, type BanderasAereas } from "@/features/cotizacion/domain/banderasAereas";
import { pesoTasable } from "@/features/costeo/domain/tarifaPorPeso";
import { formatNumber } from "@/lib/formatters";
import { MercanciaInfoGrid } from "./seccionMercancia/MercanciaInfoGrid";
import { DimensionesLCLTable } from "./seccionMercancia/DimensionesLCLTable";
import { DimensionesAereasTable } from "./seccionMercancia/DimensionesAereasTable";

interface Props {
  cotizacion: {
    modo: string;
    tipo_embarque: string;
    tipo_contenedor: string | null;
    tipo_peso: string;
    tipo_carga: string;
    sector_economico: string;
    descripcion_mercancia: string;
    descripcion_adicional: string;
    peso_kg: number;
    peso_fisico_kg?: number | null;
    volumen_m3: number;
    piezas: number;
    msds_archivo: string | null;
    dimensiones_lcl: unknown;
    dimensiones_aereas: unknown;
  } & Partial<BanderasAereas>;
}

function MedidasAereasGuardadas({ cotizacion, conDimensiones }: { cotizacion: Props["cotizacion"]; conDimensiones: boolean }) {
  const fisico = cotizacion.peso_fisico_kg;
  const cbm = cotizacion.volumen_m3;
  const tasable = fisico != null && fisico > 0 && cbm > 0 ? pesoTasable(fisico, cbm) : null;
  // peso_kg guarda el peso volumétrico histórico del modo aéreo.
  const medidas: Array<[string, number | null | undefined, string]> = conDimensiones ? [] : [
    ["Peso físico", fisico, "kg"],
    ["Peso volumétrico", cotizacion.peso_kg, "kg"],
    ["Volumen total", cbm, "m³"],
  ];
  medidas.push(["Peso tasable", tasable, "kg"]);
  const disponibles = medidas.filter(([, valor]) => valor != null && Number.isFinite(valor) && valor > 0);
  if (!disponibles.length) return null;
  return (
    <dl className="grid grid-cols-2 gap-4 text-body md:grid-cols-4">
      {disponibles.map(([nombre, valor, sufijo]) => <div key={nombre}>
        <dt className="text-muted-foreground">{nombre}</dt>
        <dd className="font-medium">{formatNumber(valor, { maximumFractionDigits: 3, suffix: sufijo })}</dd>
      </div>)}
    </dl>
  );
}

function CondicionesAereasGuardadas({ cotizacion }: { cotizacion: Props["cotizacion"] }) {
  const banderas = itemsBanderasAereas({
    baterias_litio: cotizacion.baterias_litio ?? null,
    known_shipper: cotizacion.known_shipper ?? null,
    tipo_aeronave: cotizacion.tipo_aeronave ?? null,
  });
  if (!banderas.length) return null;
  return (
    <dl aria-label="Condiciones de transporte aéreo" className="grid grid-cols-2 gap-4 text-body md:grid-cols-4">
      {banderas.map(([etiqueta, valor]) => <div key={etiqueta}>
        <dt className="text-muted-foreground">{etiqueta}</dt>
        <dd className="font-medium">{valor}</dd>
      </div>)}
    </dl>
  );
}

export default function SeccionMercanciaCotizacionDetalle({ cotizacion }: Props) {
  const esMaritimo = cotizacion.modo === 'Marítimo';
  const esAereo = cotizacion.modo === 'Aéreo';
  const esLCL = esMaritimo && cotizacion.tipo_embarque === 'LCL';
  const dimensiones: DimensionLCL[] = Array.isArray(cotizacion.dimensiones_lcl) ? cotizacion.dimensiones_lcl as DimensionLCL[] : [];
  const dimensionesAereas: DimensionAerea[] = Array.isArray(cotizacion.dimensiones_aereas) ? cotizacion.dimensiones_aereas as DimensionAerea[] : [];

  return (
    <Card>
      <CardHeader><CardTitle>Mercancía</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <MercanciaInfoGrid cotizacion={cotizacion} />

        {cotizacion.descripcion_mercancia?.trim()
          && cotizacion.descripcion_mercancia !== cotizacion.sector_economico && (
          <div className="text-body">
            <span className="text-muted-foreground">Descripción de la mercancía</span>
            <p className="font-medium whitespace-pre-wrap break-words">{cotizacion.descripcion_mercancia}</p>
          </div>
        )}

        {cotizacion.descripcion_adicional
          && cotizacion.descripcion_adicional !== cotizacion.descripcion_mercancia && (
          <div className="text-body">
            <span className="text-muted-foreground">Descripción adicional</span>
            <p className="font-medium whitespace-pre-wrap">{cotizacion.descripcion_adicional}</p>
          </div>
        )}

        {esLCL && dimensiones.length > 0 && (
          <DimensionesLCLTable dimensiones={dimensiones} totalPiezas={cotizacion.piezas} volumenTotal={cotizacion.volumen_m3} />
        )}

        {esAereo && dimensionesAereas.length > 0 && (
          <DimensionesAereasTable dimensiones={dimensionesAereas} totalPiezas={cotizacion.piezas} pesoFisico={cotizacion.peso_fisico_kg} />
        )}
        {esAereo && <MedidasAereasGuardadas cotizacion={cotizacion} conDimensiones={dimensionesAereas.length > 0} />}
        {esAereo && <CondicionesAereasGuardadas cotizacion={cotizacion} />}
      </CardContent>
    </Card>
  );
}
