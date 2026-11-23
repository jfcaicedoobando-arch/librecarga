import type { CsfParsedData } from "@/features/cliente/services/csf";
import { cpLooksValid, emailLooksValid, rfcLooksValid } from "@/features/cliente/components/nuevoClienteValidators";
import { normalizarRazonSocial } from "@/lib/text/razonSocial";
import type { ClienteForm } from "./useNuevoClienteController.constants";

const REQUERIDOS_PASO_1 = {
  nombre: "Nombre / Razón Social",
  rfc: "RFC",
  cp: "Código Postal",
  regimen_fiscal: "Régimen Fiscal SAT",
  uso_cfdi_default: "Uso CFDI",
  forma_pago_default: "Forma de pago",
  metodo_pago_default: "Método de pago",
  contacto: "Contacto",
  email: "Correo electrónico",
  telefono: "Teléfono",
} as const;

const VALIDAR_FORMATO = {
  rfc: rfcLooksValid,
  cp: cpLooksValid,
  email: emailLooksValid,
} as const;

export function revisarPaso1Cliente(form: ClienteForm) {
  const faltantes = (Object.keys(REQUERIDOS_PASO_1) as Array<keyof typeof REQUERIDOS_PASO_1>)
    .filter((key) => !form[key].trim())
    .map((key) => REQUERIDOS_PASO_1[key]);
  const invalidos = (Object.keys(VALIDAR_FORMATO) as Array<keyof typeof VALIDAR_FORMATO>)
    .filter((key) => Boolean(form[key].trim()) && !VALIDAR_FORMATO[key](form[key]))
    .map((key) => REQUERIDOS_PASO_1[key]);
  return { faltantes, invalidos };
}

/** El mismo patch actualiza el formulario y registra su procedencia. */
export function camposExtraidosClienteCsf(datos: CsfParsedData): Partial<ClienteForm> {
  const extraidos = {
    nombre: normalizarRazonSocial(datos.nombre),
    rfc: datos.rfc,
    cp: datos.cp,
    direccion: datos.direccion,
    ciudad: datos.ciudad,
    estado: datos.estado,
    regimen_fiscal: datos.regimen_fiscal,
  };
  return Object.fromEntries(Object.entries(extraidos).filter(([, valor]) => Boolean(valor)));
}
