import type { DemoLead } from "./demoLeads";
import { sanitizeCsvFormula } from "@/lib/csv/importSchemasShared";

/** Exporta datos como texto, nunca como instrucciones de Excel/Sheets. */
export function demoLeadsToCsv(rows: readonly DemoLead[]): string {
  const headers = [
    "fecha", "nombre", "empresa", "email", "telefono",
    "utm_source", "utm_medium", "utm_campaign", "referrer",
  ];
  const esc = (value: string | null) =>
    `"${sanitizeCsvFormula(value ?? "").replace(/"/g, '""')}"`;
  const lines = rows.map((r) => [
    new Date(r.created_at).toISOString(), r.nombre, r.empresa, r.email,
    r.telefono_e164, r.utm_source, r.utm_medium, r.utm_campaign, r.referrer,
  ].map(esc).join(","));
  return [headers.join(","), ...lines].join("\n");
}