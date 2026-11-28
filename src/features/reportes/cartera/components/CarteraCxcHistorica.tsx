import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { ErrorStateInline } from "@/components/empty/ErrorStateInline";
import { useDiaNegocio } from "@/hooks/shared/useDiaNegocio";
import { formatDate } from "@/lib/formatters";
import { useCarteraPdfExport } from "../hooks/useCarteraPdfExport";
import { finDeMes, useCorteCxc } from "../hooks/useCortesCxc";
import { construirFilasCartera, leyendaTcCorte, totalCartera, totalesPorBucket } from "../domain/agingCartera";
import { descargarCarteraCsv } from "../services/carteraDescargas";
import { CarteraBloque } from "./CarteraBloque";

export function CarteraCxcHistorica() {
  const hoy = useDiaNegocio();
  const [mes, setMes] = useState("");
  const fecha = finDeMes(mes);
  const { corte, scope, listo } = useCorteCxc(fecha < hoy ? fecha : "");
  const certificado = corte.data?.estado === "certificado" && !corte.isFetching && !corte.isError && listo ? corte.data : undefined;
  const { userId, organizationId, role, generation } = scope;
  const dataScope = useMemo(() => ({ userId, organizationId, role, generation }), [userId, organizationId, role, generation]);
  const bloques = useMemo(() => {
    const filas = construirFilasCartera(certificado?.filas ?? [], fecha, certificado?.tipoCambio ?? null);
    return [{ titulo: "Cuentas por cobrar", filas, buckets: totalesPorBucket(filas), total: totalCartera(filas) }];
  }, [certificado, fecha]);
  const revisionCorte = certificado?.revision;
  const leyenda = revisionCorte ? `Corte certificado · Revisión ${revisionCorte}. ${leyendaTcCorte(certificado?.tipoCambio ?? null)}` : "";
  const exportable = !!certificado && bloques[0].filas.length > 0;
  const { exportarPdf, generandoPdf } = useCarteraPdfExport({
    fechaCorte: fecha, bloques, dataScope, revisionCorte, leyenda, puedeExportar: exportable, busqueda: "",
  });
  return (
    <section className="space-y-4" aria-label="Cortes de cuentas por cobrar">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <Label htmlFor="cartera-mes-historico">Mes del corte</Label>
          <Input id="cartera-mes-historico" type="month" max={hoy.slice(0, 7)} value={mes} onChange={(event) => setMes(event.target.value)} />
        </div>
        <Button variant="outline" disabled={!exportable}
          onClick={() => descargarCarteraCsv(fecha, bloques, dataScope, "", revisionCorte)}>Exportar CSV</Button>
        <Button variant="outline" disabled={!exportable || generandoPdf} loading={generandoPdf}
          onClick={() => void exportarPdf()}>Exportar PDF</Button>
      </div>
      <EstadoCorte fecha={fecha} hoy={hoy} corte={corte} />
      {certificado && (
        <>
          <p>{formatDate(fecha)} · {leyenda}</p>
          <CarteraBloque {...bloques[0]} etiquetaContraparte="Cliente" busquedaActiva={false}
            isLoading={false} isError={false} onRetry={() => void corte.refetch()} />
        </>
      )}
    </section>
  );
}

function EstadoCorte({ fecha, hoy, corte }: { fecha: string; hoy: string; corte: ReturnType<typeof useCorteCxc>["corte"] }) {
  if (!fecha) return null;
  if (fecha >= hoy) return <p role="status">Selecciona un mes terminado.</p>;
  if (corte.isFetching) return <p role="status">Consultando el corte de cartera…</p>;
  if (corte.isError) return <ErrorStateInline title="No se pudo consultar el corte" message="Reintenta para cargar la revisión." onRetry={() => void corte.refetch()} />;
  if (corte.data?.estado === "sin_corte") return <p role="status">Sin corte verificado</p>;
  if (corte.data?.estado === "reabierto") return <p role="status">Periodo reabierto. Pendiente de recertificación.</p>;
  return null;
}
