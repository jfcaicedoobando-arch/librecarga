type Etiqueta = "subtotal" | "ret_isr" | "iva" | "total";
interface LineaSegura { etiqueta: Etiqueta; cantidades: string[] }
type PdfCode = "pdf_limit" | "pdf_temp" | "pdf_launch" | "pdf_exit" | "pdf_parse";

export class PdfPreviewError extends Error {
  constructor(readonly code: PdfCode, readonly lineas: LineaSegura[] = []) { super(code); }
}

/** No source text survives: labels come from a closed enum, amounts from decimal tokens. */
export function diagnosticoMontos(texto: string): LineaSegura[] {
  const salida: LineaSegura[] = [];
  for (const linea of texto.split(/\r?\n/)) {
    const etiquetas = [...linea.matchAll(/\b(subtotal|(?:ret(?:enci[oó]n|enido)?\.?\s+)?ISR(?:\s+retenido)?|IVA|total)\b/gi)];
    for (const [index, match] of etiquetas.entries()) {
      const etiqueta: Etiqueta = /isr/i.test(match[0]) ? "ret_isr" : match[0].toLowerCase() as Etiqueta;
      const inicio = match.index + match[0].length;
      // Tax amounts can precede the label in PDF columns; retain numeric candidates only.
      const segmento = /isr|iva/i.test(match[0]) ? linea : linea.slice(inicio, etiquetas[index + 1]?.index);
      // Percentages are not money. Currency/sign are presentation, amounts are absolute.
      const cantidades = [...segmento.matchAll(/(?<![\w.])(?:\d{1,3}(?:,\d{3})+|\d+)\.\d{2}(?![\d.]|\s*%)/g)]
        .map((m) => m[0].replaceAll(",", "")).slice(0, 8);
      salida.push({ etiqueta, cantidades });
      if (salida.length >= 20) return salida;
    }
  }
  return salida;
}

export function montosPdf(texto: string) {
  const lineas = diagnosticoMontos(texto);
  const valores = (etiqueta: Etiqueta) => lineas.filter((l) => l.etiqueta === etiqueta && l.cantidades.length > 0).flatMap((l) => l.cantidades);
  const subtotal = valores("subtotal");
  const total = valores("total");
  if (total.length !== 1) throw new PdfPreviewError("pdf_parse", lineas);
  // Tax rows use provider-dependent vertical columns. Do not label a base as tax,
  // infer a missing amount, or claim the PDF confirms the tax rounding algorithm.
  // Multi-line previews place subtotal in a vertical column. Never infer it
  // from the nearest amount; the explicitly labelled grand total is required.
  return { subtotal: subtotal.length === 1 ? subtotal[0] : null, total: total[0] };
}

async function etapa<T>(code: PdfCode, action: () => Promise<T>): Promise<T> {
  try { return await action(); } catch { throw new PdfPreviewError(code); }
}

export async function extraerPdf(pdf: Uint8Array): Promise<ReturnType<typeof montosPdf>> {
  if (pdf.byteLength > 10 * 1024 * 1024) throw new PdfPreviewError("pdf_limit");
  let executable: string | undefined;
  try { executable = Deno.env.get("PDFTOTEXT_PATH"); } catch { throw new PdfPreviewError("pdf_launch"); }
  if (!executable) throw new PdfPreviewError("pdf_launch");
  const path = await etapa("pdf_temp", () => Deno.makeTempFile({ prefix: "resico-preview-", suffix: ".pdf" }));
  try {
    await etapa("pdf_temp", () => Deno.writeFile(path, pdf));
    const process = await etapa("pdf_launch", () => new Deno.Command(executable, {
      args: ["-layout", "-enc", "UTF-8", path, "-"], stdout: "piped", stderr: "piped", clearEnv: true,
    }).output());
    if (!process.success) throw new PdfPreviewError("pdf_exit");
    if (process.stdout.byteLength > 1024 * 1024) throw new PdfPreviewError("pdf_limit");
    return montosPdf(new TextDecoder().decode(process.stdout));
  } finally { await etapa("pdf_temp", () => Deno.remove(path)); }
}
