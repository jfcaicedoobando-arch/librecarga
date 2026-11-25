/** Carga masiva de tarifas aéreas y terrestres desde CSV o Excel (una transacción por tarifa). */
import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/shared/FormField";
import { Input } from "@/components/ui/input";
import { FormDialogShell } from "@/components/shared/FormDialogShell";
import { useOrganization } from "@/lib/contexts/OrganizationContext";
import { fetchCosteoAgentes } from "@/features/costeo/services/agentes";
import { crearTarifaMultimodo } from "@/features/costeo/services/tarifas/crearMultimodo";
import { readWorkbook } from "@/lib/xlsx/readWorkbook";
import { exportToCsv } from "@/generators/exportCsv";
import { ENCABEZADOS_MULTIMODO, prepararMultimodo, type ResultadoMultimodo } from "./importarMultimodo";

interface Props { open: boolean; onOpenChange: (v: boolean) => void; onDone: () => void }
const msg = (e: unknown) => (e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e));

export function ImportarMultimodoDialog({ open, onOpenChange, onDone }: Props) {
  const { organizationId } = useOrganization();
  const [prep, setPrep] = useState<ResultadoMultimodo | null>(null);
  const [cargando, setCargando] = useState(false);
  const [procesadas, setProcesadas] = useState<number | null>(null);
  const [resultado, setResultado] = useState<{ creadas: number; errores: string[] } | null>(null);
  const enCurso = useRef(false);

  const onFile = async (file: File | undefined) => {
    if (!file || !organizationId) return;
    setCargando(true); setResultado(null);
    try {
      const [filas, agentes] = await Promise.all([
        readWorkbook(await file.arrayBuffer(), { layout: "objects" }), fetchCosteoAgentes(organizationId),
      ]);
      setPrep(prepararMultimodo(filas, agentes));
    } catch (e) {
      setPrep({ tarifas: [], errores: [`No se pudo leer el archivo: ${msg(e)}`] });
    } finally { setCargando(false); }
  };

  const importar = async () => {
    if (!prep || !organizationId || enCurso.current) return;
    enCurso.current = true; setCargando(true); setProcesadas(0);
    const errores: string[] = []; let creadas = 0;
    for (const t of prep.tarifas) {
      try { await crearTarifaMultimodo(organizationId, t.form); creadas += 1; }
      catch (e) { errores.push(`Fila ${t.fila}: ${msg(e)}`); }
      setProcesadas((n) => (n ?? 0) + 1);
    }
    setResultado({ creadas, errores: [...prep.errores, ...errores] });
    setPrep(null); setCargando(false); setProcesadas(null); enCurso.current = false;
    if (creadas > 0) onDone();
  };

  const cerrar = (v: boolean) => {
    if (!v && enCurso.current) return;
    if (!v) { setPrep(null); setResultado(null); }
    onOpenChange(v);
  };
  const errores = resultado?.errores ?? prep?.errores ?? [];
  const footer = <>
    <Button variant="outline" disabled={procesadas !== null} onClick={() => cerrar(false)}>Cerrar</Button>
    {prep && prep.tarifas.length > 0 && <Button onClick={() => void importar()} disabled={cargando}>
      {cargando ? "Importando…" : `Importar ${prep.tarifas.length} tarifa(s)`}</Button>}
  </>;

  return (
    <FormDialogShell open={open} onOpenChange={cerrar} icon={Upload} title="Importar tarifas aéreas y terrestres"
      description="Sube un archivo CSV o Excel con los encabezados de la plantilla." size="lg" footer={footer} busy={procesadas !== null}>
      <div className="space-y-3 text-body-sm">
        <p className="text-muted-foreground">
          Modo «Aéreo» o «Terrestre». Aéreo usa códigos IATA (p. ej. PVG, MEX); terrestre, código postal o ciudad y
          submodalidad FTL, LTL o Arrastre. Fechas en DD/MM/AAAA. Rangos de peso como «45:4.5; 100:3.9» (desde kg : precio por kg).
          Los recargos se agregan después en cada tarifa.
        </p>
        <Button type="button" variant="outline" size="sm" disabled={cargando}
          onClick={() => exportToCsv("plantilla-tarifas-aereas-terrestres.csv", ENCABEZADOS_MULTIMODO.map((label) => ({ key: label, label })), [])}>
          Descargar plantilla CSV
        </Button>
        <FormField label="Archivo CSV o Excel">
          <Input type="file" accept=".csv,.xlsx,.xls" disabled={cargando}
            onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ""; }} />
        </FormField>
        {cargando && !prep && <p>Leyendo archivo…</p>}
        {prep && <p>Listas para importar: <strong>{prep.tarifas.length}</strong>. Renglones con error: <strong>{prep.errores.length}</strong> (se omiten).</p>}
        {procesadas !== null && prep && <p role="status">Procesadas {procesadas} de {prep.tarifas.length}.</p>}
        {resultado && <p role="status">Tarifas importadas: <strong>{resultado.creadas}</strong>. Filas con error: <strong>{resultado.errores.length}</strong>.</p>}
        {errores.length > 0 && <ul className="max-h-48 list-disc space-y-1 overflow-auto rounded-md border p-3 pl-6 text-destructive">
          {errores.slice(0, 100).map((e) => <li key={e}>{e}</li>)}</ul>}
      </div>
    </FormDialogShell>
  );
}
