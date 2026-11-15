/**
 * Copy the fiscal members and their empty credential ComputedFields dependency
 * emitted by the official Supabase generator.
 * Usage: node scripts/qa/incorporar-tipos-perfil-fiscal.mjs
 * Requires test-results/resico/types.generated.ts and types.generation.json.
 * This is an extraction step, not a substitute for database introspection.
 */
import ts from "typescript";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

const sourcePath = "test-results/resico/types.generated.ts";
const targetPath = "src/integrations/supabase/types.ts";
const provenancePath = "test-results/resico/types.generation.json";
const selected = {
  Tables: ["perfiles_fiscales_emisor"],
  Functions: ["_perfil_fiscal_emisor_resultado", "confirmar_perfil_fiscal_emisor",
    "obtener_perfil_fiscal_emisor", "registrar_perfil_fiscal_emisor"],
};
const sha256 = (text) => createHash("sha256").update(text).digest("hex");
const source = readFileSync(sourcePath, "utf8");
const before = readFileSync(targetPath, "utf8");
const provenance = JSON.parse(readFileSync(provenancePath, "utf8"));
if (sha256(source) !== provenance.generatedSha256 || provenance.read_only !== "on"
  || provenance.postgrestVersion !== "14.1"
  || provenance.packages?.["@supabase/typegen"] !== "0.2.2") {
  throw new Error("Official generation evidence does not match the source artifact");
}

function catalog(text, path) {
  const file = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
  if (file.parseDiagnostics.length) throw new Error(`Invalid TypeScript: ${path}`);
  const database = file.statements.find((node) => ts.isTypeAliasDeclaration(node) && node.name.text === "Database");
  const publicSchema = database?.type.members?.find((node) => node.name?.getText(file) === "public");
  if (!publicSchema || !ts.isTypeLiteralNode(publicSchema.type)) throw new Error("Missing public database schema");
  return { file, schema: publicSchema.type };
}
function members(catalog, category) {
  const node = catalog.schema.members.find((node) => node.name?.getText(catalog.file) === category);
  if (!node || !ts.isTypeLiteralNode(node.type)) throw new Error(`Missing category ${category}`);
  return node.type.members;
}

const generated = catalog(source, sourcePath);
const current = catalog(before, targetPath);
const eol = before.includes("\r\n") ? "\r\n" : "\n";
const edits = [];
const dependencyTable = "facturapi_credenciales";
const dependencyField = "ComputedFields";
const generatedDependency = members(generated, "Tables").find((node) => node.name.getText(generated.file) === dependencyTable);
const currentDependency = members(current, "Tables").find((node) => node.name.getText(current.file) === dependencyTable);
if (!generatedDependency || !currentDependency || !ts.isTypeLiteralNode(generatedDependency.type)
  || !ts.isTypeLiteralNode(currentDependency.type)) throw new Error("Missing fiscal composite argument dependency");
const computed = generatedDependency.type.members.find((node) => node.name.getText(generated.file) === dependencyField);
if (!computed || computed.type?.kind !== ts.SyntaxKind.NeverKeyword || computed.questionToken) {
  throw new Error("Fiscal credential dependency is not the expected empty ComputedFields: never");
}
const existingComputed = currentDependency.type.members.find((node) => node.name.getText(current.file) === dependencyField);
if (existingComputed) {
  if (existingComputed.type?.kind !== ts.SyntaxKind.NeverKeyword || existingComputed.questionToken) {
    throw new Error("Existing credential ComputedFields is not empty; requires review");
  }
} else {
  const insert = currentDependency.type.members.find((node) => node.name.getText(current.file) === "Insert");
  if (!insert) throw new Error("Missing credential Insert field");
  edits.push({ start: insert.getFullStart(), end: insert.getFullStart(),
    text: computed.getFullText(generated.file).replace(/\r?\n/g, eol) });
}
for (const [category, names] of Object.entries(selected)) {
  const originalMembers = members(current, category);
  for (const name of names) {
    const node = members(generated, category).find((node) => node.name?.getText(generated.file) === name);
    if (!node) throw new Error(`Official output missing ${category}.${name}`);
    const text = node.getFullText(generated.file).replace(/\r?\n/g, eol);
    const existing = originalMembers.find((node) => node.name?.getText(current.file) === name);
    if (existing) {
      edits.push({ start: existing.getFullStart(), end: existing.end, text });
    } else {
      const following = originalMembers.find((node) => node.name?.getText(current.file) > name);
      const position = following?.getFullStart() ?? originalMembers.at(-1)?.end;
      if (position === undefined) throw new Error(`Cannot find insertion point for ${name}`);
      edits.push({ start: position, end: position, text });
    }
  }
}
let after = before;
for (const edit of edits.sort((a, b) => b.start - a.start)) {
  after = after.slice(0, edit.start) + edit.text + after.slice(edit.end);
}
const result = catalog(after, targetPath);
// Assert all original non-fiscal catalog entries are byte-for-byte unchanged.
// This includes unrelated enums, extension functions, columns and relationships.
for (const category of current.schema.members) {
  const name = category.name.getText(current.file);
  if (!ts.isTypeLiteralNode(category.type)) {
    const unchanged = result.schema.members.find((node) => node.name.getText(result.file) === name);
    if (!unchanged || category.getText(current.file) !== unchanged.getText(result.file)) {
      throw new Error(`Extraction changed unrelated category ${name}`);
    }
    continue;
  }
  const resultMembers = members(result, name);
  for (const node of category.type.members) {
    const memberName = node.name.getText(current.file);
    if (selected[name]?.includes(memberName)) continue;
    const unchanged = resultMembers.find((candidate) => candidate.name.getText(result.file) === memberName);
    if (name === "Tables" && memberName === dependencyTable) {
      if (!unchanged || !ts.isTypeLiteralNode(unchanged.type)) throw new Error("Missing credential dependency after extraction");
      const fields = unchanged.type.members;
      for (const original of node.type.members) {
        const field = fields.find((candidate) => candidate.name.getText(result.file) === original.name.getText(current.file));
        if (!field || original.getText(current.file) !== field.getText(result.file)) {
          throw new Error("Extraction changed an existing credential field");
        }
      }
      if (fields.length !== node.type.members.length + (existingComputed ? 0 : 1)
        || fields.find((field) => field.name.getText(result.file) === dependencyField)?.type?.kind !== ts.SyntaxKind.NeverKeyword) {
        throw new Error("Unexpected credential dependency change");
      }
      continue;
    }
    if (!unchanged || node.getText(current.file) !== unchanged.getText(result.file)) {
      throw new Error(`Extraction changed unrelated catalog entry ${name}.${memberName}`);
    }
  }
}
writeFileSync(targetPath, after);
writeFileSync("test-results/resico/types.extraction.json", JSON.stringify({
  sourcePath, targetPath, provenancePath,
  sourceSha256: sha256(source), beforeSha256: sha256(before), afterSha256: sha256(after),
  selected, generator: provenance.packages, postgres: provenance.postgres,
  dependencies: [{ table: dependencyTable, field: dependencyField, type: "never",
    reason: "Official fiscal helper composite argument excludes computed fields from facturapi_credenciales.Row",
    existingRowInsertUpdateRelationshipsPreserved: true }],
  postgrestVersion: provenance.postgrestVersion,
  unrelatedCatalogEntriesPreserved: true,
}, null, 2) + "\n");
console.log("Extracted one fiscal table, four fiscal functions and the verified empty credential ComputedFields dependency.");
