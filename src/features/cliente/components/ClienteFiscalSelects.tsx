import { useId } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { REGIMENES_FISCALES_SAT } from "@/constants/regimenFiscalSAT";
import { USOS_CFDI_SAT, FORMAS_PAGO_SAT, METODOS_PAGO_SAT } from "@/constants/catalogosSAT";
import { validarFormaMetodoPago } from "@/lib/financial/formaMetodoPago";
import { validarUsoCfdiIngreso } from "@/lib/financial/usoCfdiFiscal";
import { rfcLooksValid } from "./nuevoClienteValidators";
import { PrellenadoBadge } from "./NuevoClienteFormPieces";

export interface ClienteFiscalCampos {
  rfc?: string;
  regimen_fiscal: string;
  uso_cfdi_default: string;
  forma_pago_default: string;
  metodo_pago_default: string;
}
type CampoFiscal = Exclude<keyof ClienteFiscalCampos, "rfc">;

interface SelectsProps {
  form: ClienteFiscalCampos;
  onChange: (field: CampoFiscal, value: string) => void;
  prefilledRegimen?: boolean;
}

const CAMPOS = [
  {
    nombre: "regimen_fiscal", label: "Régimen Fiscal SAT", placeholder: "Selecciona régimen",
    opciones: REGIMENES_FISCALES_SAT.map((r) => ({ value: r.clave, label: `${r.clave} — ${r.descripcion}` })),
  },
  { nombre: "uso_cfdi_default", label: "Uso CFDI por defecto", placeholder: "Selecciona uso CFDI", opciones: USOS_CFDI_SAT },
  { nombre: "forma_pago_default", label: "Forma de pago por defecto", placeholder: "Selecciona forma de pago", opciones: FORMAS_PAGO_SAT },
  { nombre: "metodo_pago_default", label: "Método de pago por defecto", placeholder: "Selecciona método de pago", opciones: METODOS_PAGO_SAT },
] as const;

function avisosFiscales(form: ClienteFiscalCampos) {
  const { rfc = "", regimen_fiscal: regimen, uso_cfdi_default: usoCfdi, forma_pago_default: forma, metodo_pago_default: metodo } = form;
  const evaluable = rfcLooksValid(rfc) && REGIMENES_FISCALES_SAT.some((r) => r.clave === regimen) && Boolean(usoCfdi);
  return {
    uso: evaluable ? validarUsoCfdiIngreso({ rfc, regimen, usoCfdi })[0]?.message : undefined,
    pago: forma && metodo ? validarFormaMetodoPago(forma, metodo)[0]?.message : undefined,
  };
}

function idAviso(nombre: CampoFiscal, id: string, avisos: ReturnType<typeof avisosFiscales>) {
  if (nombre === "regimen_fiscal") return undefined;
  if (nombre === "uso_cfdi_default") return avisos.uso ? `${id}-uso` : undefined;
  return avisos.pago ? `${id}-pago` : undefined;
}

export function ClienteFiscalSelects({ form, onChange, prefilledRegimen }: SelectsProps) {
  const id = useId();
  const avisos = avisosFiscales(form);
  return (
    <>
      <p className="text-body-sm text-muted-foreground sm:col-span-2">Estos valores se proponen al crear facturas de este cliente. Confírmalos antes de continuar.</p>
      {CAMPOS.map(({ nombre, label, placeholder, opciones }) => (
        <div key={nombre}>
          <Label htmlFor={`${id}-${nombre}`} size="sm" className="flex items-center">
            {label}<span aria-hidden="true" className="text-destructive ml-0.5">*</span>
            {nombre === "regimen_fiscal" && prefilledRegimen && <PrellenadoBadge />}
          </Label>
          <Select value={form[nombre] || undefined} onValueChange={(valor) => onChange(nombre, valor)}>
            <SelectTrigger id={`${id}-${nombre}`} aria-required="true" aria-describedby={idAviso(nombre, id, avisos)} className="mt-1">
              <SelectValue placeholder={placeholder} />
            </SelectTrigger>
            <SelectContent>
              {opciones.map((opcion) => <SelectItem key={opcion.value} value={opcion.value}>{opcion.label}</SelectItem>)}
            </SelectContent>
          </Select>
          {nombre === "uso_cfdi_default" && avisos.uso && <p id={`${id}-uso`} role="status" className="mt-1 text-label text-muted-foreground">{avisos.uso}</p>}
        </div>
      ))}
      {avisos.pago && <p id={`${id}-pago`} role="status" className="text-label text-muted-foreground sm:col-span-2">{avisos.pago}</p>}
    </>
  );
}
