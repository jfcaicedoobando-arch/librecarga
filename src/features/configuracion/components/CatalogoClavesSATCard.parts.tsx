/**
 * Sub-componente `EditRow` del Catálogo de productos y servicios.
 * Aislado en su propio `.tsx` (sólo exporta componentes) para cumplir con
 * la regla `react-refresh/only-export-components`.
 *
 * P2-IVA (seguimiento): el tratamiento de 8% (estímulo de región fronteriza)
 * sólo se puede elegir cuando Contabilidad lo habilita por organización. Un
 * producto que YA estaba al 8% se sigue viendo y editando con su valor.
 */
import { useId, type ReactNode } from "react";
import { Pencil } from "lucide-react";
import { FormDialogShell } from "@/components/shared/FormDialogShell";
import { FormDialogSection } from "@/components/shared/FormDialogSection";
import { FormField } from "@/components/shared/FormField";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { DetailTableRow, DetailTableHead, DetailTableEmptyRow } from "@/components/shared/DetailTable";
import { Skeleton } from "@/components/ui/skeleton";
import { Hint } from "@/components/shared/Hint";
import { TIPO_IVA_AYUDA, TIPO_IVA_AYUDA_GENERAL } from "@/lib/financial/tipoIvaSat";
import {
  AVISO_IVA_FRONTERA_DESHABILITADO,
  puedeGuardarTipoIva,
} from "@/lib/financial/ivaFrontera";
import { useIvaFronteraHabilitada } from "@/features/configuracion/hooks/useIvaFrontera";
import {
  UNIDADES_SAT, TIPO_IVA_OPCIONES_CATALOGO, type Draft, type TipoIva,
} from "./CatalogoClavesSATCard.constants";


interface EditRowProps {
  draft: Draft;
  setDraft: (d: Draft) => void;
  onCancel: () => void;
  onSave: () => void;
  busy: boolean;
  valid: boolean;
  /** Tratamiento guardado del producto que se edita (undefined en alta nueva). */
  tipoIvaOriginal?: TipoIva;
  dialogTitle?: string;
}

export function EditRow({ draft, setDraft, onCancel, onSave, busy, valid, tipoIvaOriginal, dialogTitle }: EditRowProps) {
  const ayudaId = useId();
  const fronteraHabilitada = useIvaFronteraHabilitada();
  const p = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch });
  const permitido = (tipo: TipoIva) =>
    puedeGuardarTipoIva(tipo, tipoIvaOriginal, fronteraHabilitada);
  const elegirTipo = (v: string) => {
    if (!permitido(v as TipoIva)) return;
    p({ tipo_iva: v as TipoIva });
  };
  const guardable = valid && permitido(draft.tipo_iva);
  const pendiente = !draft.patron.trim() ? "Captura el nombre del producto."
    : draft.clave_sat.trim().length < 6 ? "Completa la clave SAT con al menos 6 caracteres."
    : !draft.clave_unidad_sat.trim() ? "Selecciona una unidad SAT."
    : !permitido(draft.tipo_iva) ? AVISO_IVA_FRONTERA_DESHABILITADO
    : undefined;
  const etiquetas = dialogTitle ? {} : {
    nombre: "Patrón de descripción", clave: "Clave SAT", iva: "Tratamiento de IVA", unidad: "Unidad SAT", activo: "Producto activo",
  };
  const nombre = <Input aria-label={etiquetas.nombre} value={draft.patron}
    onChange={(e) => p({ patron: e.target.value })} placeholder="Flete Marítimo" />;
  const clave = <Input aria-label={etiquetas.clave} value={draft.clave_sat}
    onChange={(e) => p({ clave_sat: e.target.value })} placeholder="78101800" />;
  const iva = (
    <Select value={draft.tipo_iva} onValueChange={elegirTipo}>
      <SelectTrigger aria-label={etiquetas.iva}><SelectValue /></SelectTrigger>
      <SelectContent>
        {TIPO_IVA_OPCIONES_CATALOGO.map((o) => {
          const habilitada = permitido(o.value);
          return (
            <Hint key={o.value} label={habilitada ? undefined : AVISO_IVA_FRONTERA_DESHABILITADO}>
              <SelectItem value={o.value} disabled={!habilitada}>
                <span className="flex flex-col">
                  <span>{o.label}</span>
                  <span className="text-label text-muted-foreground">
                    {habilitada ? TIPO_IVA_AYUDA[o.value] : AVISO_IVA_FRONTERA_DESHABILITADO}
                  </span>
                </span>
              </SelectItem>
            </Hint>
          );
        })}
      </SelectContent>
    </Select>
  );
  const unidad = (
    <Select value={draft.clave_unidad_sat} onValueChange={(v) => p({ clave_unidad_sat: v })}>
      <SelectTrigger aria-label={etiquetas.unidad}><SelectValue /></SelectTrigger>
      <SelectContent>
        {UNIDADES_SAT.map((u) => (
          <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
  const activo = <Switch checked={draft.activo} onCheckedChange={(v) => p({ activo: v })}
    aria-label={etiquetas.activo} />;
  const acciones = (
    <>
      <div className="flex flex-wrap justify-end gap-1">
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={busy} aria-label="Cancelar edición">Cancelar</Button>
        <Button size="sm" onClick={onSave} disabled={busy || !guardable}
          aria-label="Guardar producto" aria-describedby={!guardable && pendiente ? ayudaId : undefined}>Guardar producto</Button>
      </div>
      {!guardable && pendiente && <p id={ayudaId} className="mt-1 text-label text-muted-foreground">{pendiente}</p>}
    </>
  );

  if (dialogTitle) return (
    <FormDialogShell open onOpenChange={(open) => { if (!open) onCancel(); }}
      icon={Pencil} title={dialogTitle} description="Configura la clave, el IVA y la unidad del producto."
      size="md" busy={busy} footer={acciones}>
      <FormDialogSection title="Datos del producto">
        <FormField label="Patrón de descripción" required span="full">{nombre}</FormField>
        <FormField label="Clave SAT" required>{clave}</FormField>
        <FormField label="Unidad SAT" required>{unidad}</FormField>
        <FormField label="Tratamiento de IVA" hint={TIPO_IVA_AYUDA_GENERAL} span="full">{iva}</FormField>
        <FormField label="Producto activo">{activo}</FormField>
      </FormDialogSection>
    </FormDialogShell>
  );

  return (
    <DetailTableRow className="bg-muted/30" hoverable={false}>
      <TableCell>{nombre}</TableCell>
      <TableCell>{clave}</TableCell>
      <TableCell>
        {iva}
        <p className="mt-1 text-label text-muted-foreground">{TIPO_IVA_AYUDA_GENERAL}</p>
      </TableCell>
      <TableCell>{unidad}</TableCell>
      <TableCell>{activo}</TableCell>
      <TableCell className="text-right">{acciones}</TableCell>
    </DetailTableRow>
  );
}

interface Props {
  estado: "cargando" | "vacio" | "sin-coincidencias" | "disponible";
  ocultar: boolean;
  children: ReactNode;
}

function MensajeTabla({ estado }: Pick<Props, "estado">) {
  if (estado === "cargando") return (
    <TableRow role="status" aria-busy="true">
      <TableCell colSpan={6} className="py-4">
        <span className="sr-only">Cargando…</span>
        <Skeleton className="h-4 w-full" />
      </TableCell>
    </TableRow>
  );
  if (estado === "vacio") {
    return <DetailTableEmptyRow colSpan={6} message="Aún no hay productos. Da de alta al menos uno para poder capturar cotizaciones." />;
  }
  if (estado === "sin-coincidencias") {
    return <DetailTableEmptyRow colSpan={6} message="No hay productos que coincidan con la búsqueda." />;
  }
  return null;
}

export function CatalogoClavesSATTabla({ estado, ocultar, children }: Props) {
  if (ocultar) return null;
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <DetailTableHead className="w-[28%]">Nombre</DetailTableHead>
            <DetailTableHead className="w-[14%]">Clave SAT</DetailTableHead>
            <DetailTableHead className="w-[14%]">Tipo IVA</DetailTableHead>
            <DetailTableHead className="w-[14%]">Unidad SAT</DetailTableHead>
            <DetailTableHead className="w-[10%]">Activo</DetailTableHead>
            <DetailTableHead className="w-[12%] text-right">Acciones</DetailTableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <MensajeTabla estado={estado} />
          {children}
        </TableBody>
      </Table>
    </div>
  );
}
