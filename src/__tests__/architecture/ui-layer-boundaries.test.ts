import { readFileSync } from "node:fs";
import { join, posix } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { relPath, walk } from "../../../scripts/lib/walk";

// Una entrada por dependencia existente. Quitar la entrada cuando se migre.
const SHARED_FEATURE_EXCEPTIONS = [
  "src/components/shared/CartaGarantiaBadge.tsx -> @/features/costeo/types",
  "src/components/shared/CartaGarantiaBadge.tsx -> @/features/costeo/types/navieraCondicion",
  "src/components/shared/CoordinadorSelect.tsx -> @/features/operaciones/services",
  "src/components/shared/GlobalSearch.tsx -> @/features/search/domain/paginas",
  "src/components/shared/NavieraFormDialog.tsx -> @/features/catalogos/hooks",
  "src/components/shared/NavieraFormDialog.tsx -> @/features/catalogos/services",
  "src/components/shared/TipoCambioFallbackBanner.tsx -> @/features/catalogos/hooks",
  "src/components/shared/emails/DestinatariosPicker.tsx -> @/features/cotizacion/services/envios",
];

function getModuleSpecifier(node: ts.Node): ts.Node | undefined {
  if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return node.moduleSpecifier;
  if (ts.isExternalModuleReference(node)) return node.expression;
  if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) return node.argument.literal;
  if (ts.isCallExpression(node) && (
    node.expression.kind === ts.SyntaxKind.ImportKeyword
    || (ts.isIdentifier(node.expression) && node.expression.text === "require")
  )) return node.arguments[0];
}

function importsInto(from: string, forbiddenRoot: string): string[] {
  const root = process.cwd();
  const violations = new Set<string>();
  for (const file of walk(join(root, from), {
    exts: ["ts", "tsx", "js", "jsx"],
    excludeDirs: ["__tests__"],
    excludeFileRe: /\.(test|spec|stories)\./,
  })) {
    const relative = relPath(root, file);
    const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest);
    function visit(node: ts.Node) {
      const specifier = getModuleSpecifier(node);
      if (specifier && ts.isStringLiteralLike(specifier)) {
        const name = specifier.text;
        const target = name.startsWith("@/") ? posix.normalize(`src/${name.slice(2)}`)
          : name.startsWith(".") ? posix.join(posix.dirname(relative), name) : name;
        if (target === forbiddenRoot || target.startsWith(`${forbiddenRoot}/`)) {
          violations.add(`${relative} -> ${name}`);
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  return [...violations].sort();
}

describe("dependencias de la UI compartida", () => {
  it("las primitivas de ui no dependen de shared", () => {
    expect(importsInto("src/components/ui", "src/components/shared")).toEqual([]);
  });

  it("shared sólo conserva las dependencias de negocio registradas", () => {
    expect(importsInto("src/components/shared", "src/features")).toEqual([...SHARED_FEATURE_EXCEPTIONS].sort());
  });
});
