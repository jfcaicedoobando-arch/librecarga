import { Link } from "react-router";
import { formatDate } from "@/lib/formatters/dates";
import { importeTarifario, rutaTarifarioMultimodo } from "./presentacionTarifario";
import type { FilaTarifario, TarifaTarifario } from "./tarifarioService";

export function OtrasTarifas({ fila }: { fila: FilaTarifario }) {
  if (fila.otras.length === 0) return "—";
  const label = "Otras tarifas en el catálogo: " + fila.otras.length;
  if (!fila.base.ruta?.id) return label;
  return <Link to={"/costeo/tarifas?ruta=" + encodeURIComponent(fila.base.ruta.id)}
    className="text-accent underline underline-offset-2">{label}</Link>;
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-label text-muted-foreground">{etiqueta}</dt>
      <dd className="text-body-sm break-words tabular-nums">{valor}</dd>
    </div>
  );
}

function RutaYVigencia({ origen, destino, tarifa }: { origen: string; destino: string; tarifa: TarifaTarifario }) {
  const { vigente_desde: desde, vigente_hasta: hasta } = tarifa;
  return (
    <>
      <Dato etiqueta="Origen" valor={origen} />
      <Dato etiqueta="Destino" valor={destino} />
      <Dato etiqueta="Vigente desde" valor={desde ? formatDate(desde) : "—"} />
      <Dato etiqueta="Vigente hasta" valor={hasta ? formatDate(hasta) : "—"} />
    </>
  );
}

function DatosMultimodo({ tarifa }: { tarifa: TarifaTarifario }) {
  const [origen, destino] = rutaTarifarioMultimodo(tarifa);
  const unidad = tarifa.unidad_flete ? " / " + tarifa.unidad_flete : "";
  return (
    <div className="space-y-2">
      <p className="text-body-sm font-semibold">{tarifa.modo}</p>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
        <RutaYVigencia origen={origen || "—"} destino={destino || "—"} tarifa={tarifa} />
        <Dato etiqueta="Flete base" valor={importeTarifario(tarifa) + unidad} />
        <Dato etiqueta="Agente" valor={tarifa.agente?.nombre ?? "—"} />
      </dl>
    </div>
  );
}

export function TarifaBaseCard({ fila }: { fila: FilaTarifario }) {
  const multimodo = fila.otras.filter((t) => t.modo === "Aéreo" || t.modo === "Terrestre");
  const base = fila.tarifa20 ?? fila.tarifa40 ?? fila.otras.find((t) => t.modo !== "Aéreo" && t.modo !== "Terrestre");

  return (
    <article className="space-y-3">
      {base && (
        <>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
            <RutaYVigencia origen={fila.origen} destino={fila.destino} tarifa={base} />
            {fila.tarifa20 && <Dato etiqueta={'Tarifa 20"'} valor={importeTarifario(fila.tarifa20)} />}
            {fila.tarifa40 && <Dato etiqueta={'Tarifa 40"'} valor={importeTarifario(fila.tarifa40)} />}
            {!fila.tarifa20 && !fila.tarifa40 && <Dato etiqueta="Flete base" valor={importeTarifario(base)} />}
            <Dato etiqueta="Agente" valor={fila.agente} />
            <Dato etiqueta="Naviera" valor={fila.naviera} />
            {base.dias_libres_demoras !== null && <Dato etiqueta="Días libres de demoras" valor={String(base.dias_libres_demoras)} />}
          </dl>
          {base.notas && <p className="text-body-sm break-words"><span className="text-muted-foreground">Observaciones: </span>{base.notas}</p>}
          {fila.otras.length > 0 && <p className="text-body-sm"><OtrasTarifas fila={fila} /></p>}
        </>
      )}
      {multimodo.map((tarifa) => <DatosMultimodo key={tarifa.id} tarifa={tarifa} />)}
    </article>
  );
}
