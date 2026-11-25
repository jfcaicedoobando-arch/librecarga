/** Carga masiva de tarifas desde CSV o Excel. */
import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/shared/FormField";
import { Input } from "@/components/ui/input";
import { FormDialogShell } from "@/components/shared/FormDialogShell";
import { useOrganization } from "@/lib/contexts/OrganizationContext";
import { fetchPuertos, fetchNavieras, fetchTiposContenedor } from "@/features/catalogos/services";
import { fetchCosteoAgentes } from "@/features/costeo/services/agentes";
import { fetchCosteoRutas, insertCosteoRuta } from "@/features/costeo/services/rutas";
import { insertTarifaConRecargos } from "@/features/costeo/services/tarifas";
import { prepararImportacion, type ResultadoImport } from "./importarTarifas";
import { readWorkbook } from "@/lib/xlsx/readWorkbook";
import { exportToCsv } from "@/generators/exportCsv";
import { ENCABEZADOS_TARIFARIO } from "./encabezadosTarifario";

interface Props { open: boolean; onOpenChange: (v: boolean) => void; onDone: () => void }

async function leerArchivo(file: File): Promise<Record<string, unknown>[]> {
  return readWorkbook(await file.arrayBuffer(), { layout: "objects" });
}

const msg = (e: unknown) => (e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e));

export function ImportarTarifasDialog({ open, onOpenChange, onDone }: Props) {
  const { organizationId } = useOrganization();
  const [prep, setPrep] = useState<ResultadoImport | null>(null);
  const [cargando, setCargando] = useState(false);
  const [procesadas, setProcesadas] = useState<number | null>(null);
  const importacionEnCurso = useRef(false);
  const [resultado, setResultado] = useState<{ creadas: number; errores: string[] } | null>(null);

  const onFile = async (file: File | undefined) => {
    if (!file || !organizationId) return;
    setCargando(true); setResultado(null);
    try {
      const [filas, puertos, agentes, navieras, tipos, rutas] = await Promise.all([
        leerArchivo(file), fetchPuertos(), fetchCosteoAgentes(organizationId), fetchNavieras(), fetchTiposContenedor(), fetchCosteoRutas(organizationId),
      ]);
      setPrep(prepararImportacion(filas, { puertos, agentes, navieras, tipos, rutas }));
    } catch (e) {
      setPrep({ tarifas: [], errores: [`No se pudo leer el archivo: ${msg(e)}`] });
    } finally { setCargando(false); }
  };

  const importar = async () => {
    if (!prep || !organizationId || importacionEnCurso.current) return;
    importacionEnCurso.current = true;
    setCargando(true);
    setProcesadas(0);
    const rutas = new Map<string, string>();
    const errores: string[] = [];
    let creadas = 0;
    for (const t of prep.tarifas) {
      try {
        let rutaId = t.input.ruta_id;
        if (!rutaId) {
          const k = `${t.origenId}>${t.destinoId}`;
          rutaId = rutas.get(k) ?? (await insertCosteoRuta(organizationId, { puerto_origen_id: t.origenId, puerto_destino_id: t.destinoId })).id;
          rutas.set(k, rutaId);
        }
        await insertTarifaConRecargos(organizationId, { ...t.input, ruta_id: rutaId });
        creadas += 1;
      } catch (e) { errores.push(`Fila ${t.fila}: ${msg(e)}`); }
      setProcesadas((n) => (n ?? 0) + 1);
    }
    setResultado({ creadas, errores: [...prep.errores, ...errores] });
    setPrep(null);
    setCargando(false);
    setProcesadas(null);
    importacionEnCurso.current = false;
    if (creadas > 0) onDone();
  };

  const cerrar = (v: boolean) => {
    if (!v && importacionEnCurso.current) return;
    if (!v) { setPrep(null); setResultado(null); }
    onOpenChange(v);
  };
  const footer = (
    <>
      <Button variant="outline" disabled={procesadas !== null} onClick={() => cerrar(false)}>Cerrar</Button>
      {prep && prep.tarifas.length > 0 && (
        <Button onClick={() => void importar()} disabled={cargando}>
          {cargando ? "Importando…" : `Importar ${prep.tarifas.length} tarifa(s)`}
        </Button>
      )}
    </>
  );
  const errores = resultado?.errores ?? prep?.errores ?? [];

  return (
    <FormDialogShell open={open} onOpenChange={cerrar} icon={Upload} title="Importar tarifas"
      description="Sube un archivo CSV o Excel con los encabezados de la plantilla." size="lg" footer={footer} busy={procesadas !== null}>
      <div className="space-y-3 text-body-sm">
        <p className="text-muted-foreground">
          Escribe el nombre o código de cada puerto. Usa agentes y navieras del catálogo y fechas en DD/MM/AAAA.
          Las tarifas se importan como borrador y quedan pendientes de aprobación.
        </p>
        <Button type="button" variant="outline" size="sm" disabled={cargando}
          onClick={() => exportToCsv("plantilla-tarifas.csv", ENCABEZADOS_TARIFARIO, [])}>
          Descargar plantilla CSV
        </Button>
        <FormField label="Archivo CSV o Excel">
          <Input type="file" accept=".csv,.xlsx,.xls" disabled={cargando}
            onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ""; }} />
        </FormField>
        {cargando && !prep && <p>Leyendo archivo…</p>}
        {prep && <p>Listas para importar: <strong>{prep.tarifas.length}</strong> tarifa(s). Renglones con error: <strong>{prep.errores.length}</strong> (se omiten).</p>}
        {procesadas !== null && prep && <p role="status">Procesadas {procesadas} de {prep.tarifas.length} tarifas.</p>}
        {resultado && <p role="status">Tarifas importadas: <strong>{resultado.creadas}</strong>. Filas con error: <strong>{resultado.errores.length}</strong>.</p>}
        {errores.length > 0 && (
          <ul className="max-h-48 list-disc space-y-1 overflow-auto rounded-md border p-3 pl-6 text-destructive">
            {errores.slice(0, 100).map((e) => <li key={e}>{e}</li>)}
          </ul>
        )}
      </div>
    </FormDialogShell>
  );
}
