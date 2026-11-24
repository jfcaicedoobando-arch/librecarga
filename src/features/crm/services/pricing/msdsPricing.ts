/** Identificación explícita de la MSDS dentro de los adjuntos privados existentes. */
const MAX_MSDS_BYTES = 10 * 1024 * 1024;

export function esMsdsPricing(nombre: string): boolean {
  return /^(?:\d{13}-)?MSDS-.+\.pdf$/i.test(nombre);
}

export function faltaMsdsPricing(imo: boolean | null | undefined, nombres: readonly string[]): boolean {
  return imo === true && !nombres.some(esMsdsPricing);
}

export async function prepararMsdsPricing(file: File): Promise<File> {
  if (!/\.pdf$/i.test(file.name) || (file.type && file.type !== "application/pdf")) {
    throw new Error("La hoja de seguridad (MSDS) debe ser un PDF.");
  }
  if (file.size === 0 || file.size > MAX_MSDS_BYTES) {
    throw new Error("La MSDS debe tener contenido y pesar como máximo 10 MB.");
  }
  const encabezado = new TextDecoder().decode(await file.slice(0, 5).arrayBuffer());
  if (encabezado !== "%PDF-") throw new Error("El archivo no contiene un PDF válido.");
  const nombre = esMsdsPricing(file.name) ? file.name : `MSDS-${file.name}`;
  return new File([file], nombre, { type: "application/pdf" });
}