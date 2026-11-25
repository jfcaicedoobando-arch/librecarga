import { Label } from "@/components/ui/label";
/**
 * Alta de Empresa del CRM: nombre con sugerencias de empresas existentes,
 * propiedades obligatorias (País, Fuente, Tipo de transporte, Volumen de
 * importación) y, opcionalmente, el resto de las propiedades.
 */
import { useState, type FormEvent, type ReactNode } from "react";
import { Building2, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/shared/FormField";
import { FormDialogShell } from "@/components/shared/FormDialogShell";
import { FormDialogCancelarBoton } from "@/components/shared/FormDialogCancelarBoton";
import { FormDialogSection } from "@/components/shared/FormDialogSection";
import { LoadingState } from "@/components/shared/states/LoadingState";
import { ErrorStateInline } from "@/components/empty/ErrorStateInline";
import { useCrearEmpresaCrm } from "@/features/crm/hooks/useObjetosCrm";
import { usePropiedadesCrm } from "@/features/crm/hooks/usePropiedadesCrm";
import type { PropiedadCrm } from "@/features/crm/services/propiedadesCrm";
import { filaValor, type ValorEntrada } from "@/features/crm/services/valoresCrm";
import { CampoPropiedad } from "./CampoPropiedad";
import { EmpresasSimilares } from "./EmpresasSimilares";

/** Propiedades que se exigen al crear una empresa. */
const CLAVES_OBLIGATORIAS_EMPRESA = ["pais", "fuente", "tipo_transporte", "volumen_importacion_usd"];
const FORM_ID = "nueva-empresa-crm";

interface Props { open: boolean; onOpenChange: (open: boolean) => void }

const vacio = (v: ValorEntrada | undefined) => v == null || v === "" || (Array.isArray(v) && v.length === 0);

interface CamposEmpresaProps {
  consulta: ReturnType<typeof usePropiedadesCrm>;
  obligatorias: PropiedadCrm[];
  adicionales: PropiedadCrm[];
  renderCampo: (propiedad: PropiedadCrm, requerido: boolean) => ReactNode;
}

function CamposEmpresa({ consulta, obligatorias, adicionales, renderCampo }: CamposEmpresaProps) {
  const [verMas, setVerMas] = useState(false);
  if (consulta.isPending) return <LoadingState label="Cargando campos de empresa…" minHeight="min-h-20" />;
  if (consulta.isError) {
    return (
      <ErrorStateInline
        title="No se pudieron cargar los campos de empresa"
        message="Reintenta la consulta para continuar con el alta."
        onRetry={() => void consulta.refetch()}
        retrying={consulta.isFetching}
      />
    );
  }
  return (
    <>
      {obligatorias.length > 0 && (
        <FormDialogSection>{obligatorias.map((p) => renderCampo(p, true))}</FormDialogSection>
      )}
      {adicionales.length > 0 && (
        <FormDialogSection cols={1} flat>
          <Button type="button" variant="ghost" size="sm" className="w-fit" onClick={() => setVerMas((v) => !v)} aria-expanded={verMas}>
            <ChevronDown className={`size-4 transition-transform ${verMas ? "rotate-180" : ""}`} />
            {verMas ? "Ocultar campos adicionales" : `Más campos (${adicionales.length})`}
          </Button>
        </FormDialogSection>
      )}
      {verMas && <FormDialogSection>{adicionales.map((p) => renderCampo(p, false))}</FormDialogSection>}
    </>
  );
}

export function NuevaEmpresaDialog({ open, onOpenChange }: Props) {
  const [nombre, setNombre] = useState("");
  const [valores, setValores] = useState<Record<string, ValorEntrada>>({});
  const [version, setVersion] = useState(0);
  const crear = useCrearEmpresaCrm();
  const propiedades = usePropiedadesCrm("empresa");
  const props = (propiedades.data ?? []).filter((p) => !p.archivada);
  const obligatorias = CLAVES_OBLIGATORIAS_EMPRESA
    .map((c) => props.find((p) => p.clave === c)).filter((p): p is PropiedadCrm => !!p);
  const resto = props.filter((p) => !CLAVES_OBLIGATORIAS_EMPRESA.includes(p.clave));
  const faltan = obligatorias.filter((p) => vacio(valores[p.id])).map((p) => p.etiqueta);
  const listo = propiedades.isSuccess && !!nombre.trim() && faltan.length === 0 && !crear.isPending;

  const cerrar = () => { setNombre(""); setValores({}); setVersion((v) => v + 1); onOpenChange(false); };

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!listo) return;
    const lista = props.filter((p) => !vacio(valores[p.id]))
      .map((p) => ({ propiedadId: p.id, tipo: p.tipo, valor: valores[p.id] ?? null }));
    crear.mutate({ nombre, valores: lista }, { onSuccess: cerrar });
  };

  const campo = (p: PropiedadCrm, requerido: boolean) => {
    const v = valores[p.id];
    let valor;
    try { valor = vacio(v) ? undefined : { propiedad_id: p.id, ...filaValor(p.tipo, v ?? null) }; } catch { valor = undefined; }
    return (
      <div key={p.id} className="space-y-1.5">
        <Label htmlFor={`prop-${p.id}`}>{p.etiqueta}{requerido && " *"}</Label>
        <CampoPropiedad prop={p} valor={valor} disabled={crear.isPending}
          onGuardar={(nv) => setValores((s) => ({ ...s, [p.id]: nv }))} />
      </div>
    );
  };

  return (
    <FormDialogShell
      open={open}
      onOpenChange={(o) => (o ? onOpenChange(true) : cerrar())}
      icon={Building2}
      title="Nueva empresa"
      size="lg"
      formId={FORM_ID}
      onSubmit={onSubmit}
      isDirty={(!!nombre || Object.keys(valores).length > 0) && !crear.isPending}
      busy={crear.isPending}
      footer={
        <>
          {propiedades.isSuccess && nombre.trim() && faltan.length > 0 && (
            <span className="mr-auto text-caption text-muted-foreground">Falta: {faltan.join(", ")}</span>
          )}
          <FormDialogCancelarBoton onCancelar={cerrar} disabled={crear.isPending} />
          <Button type="submit" form={FORM_ID} disabled={!listo}>{crear.isPending ? "Guardando…" : "Guardar"}</Button>
        </>
      }
    >
      <FormDialogSection cols={1}>
        <FormField label="Nombre" htmlFor="obj-nombre" required>
          <Input id="obj-nombre" required value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={200} autoComplete="off" />
        </FormField>
        <EmpresasSimilares nombre={nombre} onElegir={cerrar} disabled={crear.isPending} />
      </FormDialogSection>
      <CamposEmpresa key={version} consulta={propiedades} obligatorias={obligatorias} adicionales={resto} renderCampo={campo} />
    </FormDialogShell>
  );
}
