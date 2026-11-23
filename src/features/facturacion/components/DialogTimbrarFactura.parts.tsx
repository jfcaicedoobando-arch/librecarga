import type { CheckTimbrado } from "@/features/facturacion/utils/validarDatosTimbrado";
import { Check, X } from "lucide-react";
import { Link } from "react-router";
import { UsoCfdiIngresoSelect } from "./UsoCfdiIngresoSelect";
/**
 * Sub-vistas del modal de timbrado. Extraídas para respetar la regla
 * Power of 10 (≤200 líneas por archivo productivo).
 */
import { Label } from "@/components/ui/label";
import { TimbradoEmail, type TimbradoEmailProps } from "./TimbradoConfirmacion";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FORMAS_PAGO_SAT, METODOS_PAGO_SAT } from "@/constants/catalogosSAT";

interface CompactoProps extends TimbradoEmailProps {
  usoCfdi: string;
  formaPago: string;
  metodoPago: string;
}

export function TimbrarCompacto({ usoCfdi, formaPago, metodoPago, ...emailProps }: CompactoProps) {
  return (
    <>
      <div className="text-body text-muted-foreground">
        <span className="font-medium text-foreground">Uso CFDI:</span> {usoCfdi}
        {" · "}
        <span className="font-medium text-foreground">Forma:</span> {formaPago}
        {" · "}
        <span className="font-medium text-foreground">Método:</span> {metodoPago}
      </div>
      <TimbradoEmail {...emailProps} />
    </>
  );
}

interface CompletoProps extends TimbradoEmailProps {
  checks: CheckTimbrado[];
  clienteId?: string | null;
  receptor: { rfc: string; regimen: string };
  usoCfdi: string;
  setUsoCfdi: (v: string) => void;
  formaPago: string;
  setFormaPago: (v: string) => void;
  metodoPago: string;
  setMetodoPago: (v: string) => void;
  puedeTimbrar: boolean;
}

function DatosReceptorPendientes({ clienteId }: { clienteId?: string | null }) {
  if (!clienteId) return <p>Pide a la persona que administra Clientes que revise los datos fiscales del receptor.</p>;
  return (
    <p>
      <Link to={`/clientes/${clienteId}`} target="_blank" rel="noopener" className="font-medium underline">
        Abrir datos fiscales del cliente en otra pestaña
      </Link>
      {" · Corrige los datos y vuelve a este borrador."}
    </p>
  );
}

export function TimbrarCompleto(props: CompletoProps) {
  const {
    checks,
    usoCfdi, setUsoCfdi,
    formaPago, setFormaPago,
    metodoPago, setMetodoPago,
    enviarEmail, setEnviarEmail, emailDestino,
    puedeTimbrar,
  } = props;
  const pendientes = new Set(checks.filter((check) => !check.ok).map((check) => check.campo));
  return (
    <>
      <ul className="text-body space-y-1">
        {checks.map((c, i) => (
          <li key={i} className={`flex items-center gap-1.5 ${c.ok ? "text-success" : "text-destructive"}`}>
            {c.ok ? <Check className="h-3.5 w-3.5" aria-hidden /> : <X className="h-3.5 w-3.5" aria-hidden />}
            <span className="sr-only">{c.ok ? "Correcto: " : "Pendiente: "}</span>
            {c.label}
          </li>
        ))}
      </ul>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <UsoCfdiIngresoSelect value={usoCfdi} onChange={setUsoCfdi} receptor={props.receptor} />
        <div>
          <Label htmlFor="timbrar-forma-pago">Forma de pago</Label>
          <Select value={formaPago} onValueChange={setFormaPago}>
            <SelectTrigger id="timbrar-forma-pago"><SelectValue /></SelectTrigger>
            <SelectContent>
              {FORMAS_PAGO_SAT.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="timbrar-metodo-pago">Método de pago</Label>
          <Select value={metodoPago} onValueChange={setMetodoPago}>
            <SelectTrigger id="timbrar-metodo-pago"><SelectValue /></SelectTrigger>
            <SelectContent>
              {METODOS_PAGO_SAT.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <TimbradoEmail enviarEmail={enviarEmail} setEnviarEmail={setEnviarEmail} emailDestino={emailDestino} />

      {!puedeTimbrar && (
        <Alert variant="destructive">
          <AlertDescription className="space-y-1">
            {pendientes.has("receptor") && <DatosReceptorPendientes clienteId={props.clienteId} />}
            {pendientes.has("pago") && <p>Revisa los campos del CFDI en este formulario.</p>}
            {pendientes.has("factura") && <p>Corrige el tipo de cambio en el detalle de la factura.</p>}
          </AlertDescription>
        </Alert>
      )}
    </>
  );
}
