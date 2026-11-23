import { Decimal } from "npm:decimal.js@10.6.0";
import { decodeXmlEntities } from "./cfdiParser.ts";

export function atributo(nodo: string, nombre: string): string | null {
  const valor = new RegExp(`\\s${nombre}\\s*=\\s*(["'])([^"'<>]*?)\\1`, "i").exec(nodo)?.[2];
  return valor == null ? null : decodeXmlEntities(valor);
}

export function importe(valor: string | number | null | undefined): Decimal {
  if (valor == null || !/^\d+(?:\.\d+)?$/.test(String(valor))) throw new Error("importe_cfdi_invalido");
  return new Decimal(valor);
}

export function nodos(xml: string, nombre: string): string[] {
  return xml.match(new RegExp(`<(?:[\\w.-]+:)?${nombre}(?=[\\s/>])[^>]*>`, "gi")) ?? [];
}

export function seccion(xml: string, nombre: string) {
  const etiquetas = nodos(xml, nombre);
  if (etiquetas.length !== 1) throw new Error(`nodo_cfdi_invalido_${nombre}`);
  const [etiqueta] = etiquetas;
  if (/\/\s*>$/.test(etiqueta)) return { etiqueta, contenido: "" };
  const nombreCompleto = etiqueta.match(/^<([\w.:-]+)/)?.[1] ?? "";
  const inicio = xml.indexOf(etiqueta) + etiqueta.length;
  const resto = xml.slice(inicio);
  const cierre = new RegExp(`</${nombreCompleto.replaceAll(".", "\\.")}\\s*>`).exec(resto);
  if (!cierre) throw new Error(`nodo_cfdi_invalido_${nombre}`);
  return { etiqueta, contenido: resto.slice(0, cierre.index) };
}
