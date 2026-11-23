import { describe, expect, it } from "vitest";
import { demoLeadsToCsv } from "../demoLeadsCsv";
import type { DemoLead } from "../demoLeads";

const row: DemoLead = {
  id: "lead", nombre: "Ana", empresa: "Carga", email: "ana@example.test",
  telefono_e164: "+525555555555", utm_source: null, utm_medium: null,
  utm_campaign: null, referrer: null, created_at: "2026-11-17T00:00:00Z",
};

describe("exportación segura de leads", () => {
  it.each(["=1+1", "+1+1", "-1+1", "@SUM(1)", " \t=1+1", "\r=1+1", "\n=1+1"])(
    "neutraliza fórmulas en cada campo: %s", (value) => {
      const csv = demoLeadsToCsv([{
        ...row, nombre: value, empresa: value, email: value, telefono_e164: value,
        utm_source: value, utm_medium: value, utm_campaign: value, referrer: value,
      }]);
      expect(csv.split("\n")[1]).toBe(
        ['"2026-11-17T00:00:00.000Z"', ...Array<string>(8).fill(`"'${value.trimStart()}"`)].join(","),
      );
    },
  );
  it("conserva texto, comillas, comas y valores vacíos", () => {
    expect(demoLeadsToCsv([{ ...row, nombre: 'Ana, "López"' }])).toContain(
      '"Ana, ""López""","Carga","ana@example.test","\'+525555555555","","","",""',
    );
  });
  it("exporta sólo encabezados sin filas", () => {
    expect(demoLeadsToCsv([])).toBe("fecha,nombre,empresa,email,telefono,utm_source,utm_medium,utm_campaign,referrer");
  });
});