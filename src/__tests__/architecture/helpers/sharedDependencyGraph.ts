import { readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import ts from "typescript";
import { relPath, walk } from "../../../../scripts/lib/walk";

type Kind = "import" | "export" | "import()" | "require()" | "tipo";

interface Reference {
  specifier: string;
  kind: Kind;
  line: number;
}

interface Edge extends Reference {
  from: string;
  to: string;
}

const EXCLUDED_DIRS = ["node_modules", "__tests__", "__fixtures__", "__mocks__"];
const EXCLUDED_FILE = /\.(?:test|spec|stories)\./;
const EXTENSIONS = ["ts", "tsx", "mts", "cts", "js", "jsx", "mjs", "cjs"];
const AUTH_EDGES = new Set([
  "src/lib/contexts/auth/useAuthProfile.ts -> src/features/auth/services/session.ts",
  "src/lib/contexts/auth/useAuthSession.ts -> src/features/auth/services/session.ts",
  "src/lib/contexts/auth/useLoginAudit.ts -> src/features/auth/services/loginAudit.ts",
]);

function onlyTypeSpecifiers(elements: readonly { isTypeOnly: boolean }[]) {
  return elements.length > 0 && elements.every((element) => element.isTypeOnly);
}

function importKind(clause: ts.ImportClause | undefined): Kind {
  if (clause?.isTypeOnly) return "tipo";
  const named = clause?.namedBindings;
  return !clause?.name && named && ts.isNamedImports(named) && onlyTypeSpecifiers(named.elements)
    ? "tipo" : "import";
}

function exportKind(declaration: ts.ExportDeclaration): Kind {
  const named = declaration.exportClause;
  return declaration.isTypeOnly || (named && ts.isNamedExports(named) && onlyTypeSpecifiers(named.elements))
    ? "tipo" : "export";
}

function references(file: string): Reference[] {
  const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
  const result: Reference[] = [];
  function add(specifier: ts.Node | undefined, kind: Kind, node: ts.Node) {
    if (!specifier || !ts.isStringLiteralLike(specifier)) return;
    const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
    result.push({ specifier: specifier.text, kind: source.isDeclarationFile ? "tipo" : kind, line: line + 1 });
  }
  function visit(node: ts.Node) {
    if (ts.isImportDeclaration(node)) add(node.moduleSpecifier, importKind(node.importClause), node);
    if (ts.isExportDeclaration(node)) add(node.moduleSpecifier, exportKind(node), node);
    if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      add(node.moduleReference.expression, node.isTypeOnly ? "tipo" : "require()", node);
    }
    if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
      add(node.argument.literal, "tipo", node);
    }
    if (ts.isCallExpression(node)) {
      const { expression } = node;
      if (expression.kind === ts.SyntaxKind.ImportKeyword) add(node.arguments[0], "import()", node);
      if (ts.isIdentifier(expression) && expression.text === "require") add(node.arguments[0], "require()", node);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return result;
}

function tsResolver(root: string) {
  const formatHost: ts.FormatDiagnosticsHost = {
    getCanonicalFileName: (file) => file,
    getCurrentDirectory: () => root,
    getNewLine: () => "\n",
  };
  const project = ts.getParsedCommandLineOfConfigFile(join(root, "tsconfig.app.json"), { allowJs: true }, {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic: (error) => { throw new Error(ts.formatDiagnostic(error, formatHost)); },
  });
  if (!project) throw new Error("Falta la configuración TypeScript para revisar las dependencias.");
  if (project.errors.length) throw new Error(ts.formatDiagnostics(project.errors, formatHost));
  const canonicalize = ts.sys.useCaseSensitiveFileNames ? (name: string) => name : (name: string) => name.toLowerCase();
  const cache = ts.createModuleResolutionCache(root, canonicalize, project.options);
  return (specifier: string, from: string) => {
    const found = ts.resolveModuleName(specifier, from, project.options, ts.sys, cache).resolvedModule;
    if (!found || found.isExternalLibraryImport) return undefined;
    const path = relPath(root, found.resolvedFileName);
    if (path.startsWith("../") || isAbsolute(path) || EXCLUDED_FILE.test(path)) return undefined;
    if (path.split("/").some((part) => EXCLUDED_DIRS.includes(part))) return undefined;
    if (!EXTENSIONS.some((extension) => path.endsWith(`.${extension}`))) return undefined;
    return path;
  };
}

function trace(path: Edge[], target: string) {
  return [...path.map(({ from, line, kind, specifier }) => `${from}:${line} (${kind} ${specifier})`), target].join(" → ");
}

/** Report one shortest path per forbidden edge, separating type dependencies. */
export function sharedDependencyViolations(root: string) {
  const roots = walk(join(root, "src/components/shared"), {
    exts: EXTENSIONS,
    excludeDirs: EXCLUDED_DIRS,
    excludeFileRe: EXCLUDED_FILE,
  }).map((file) => relPath(root, file)).sort();
  const resolve = tsResolver(root);
  const edgesByFile = new Map<string, Edge[]>();
  const runtime = new Set<string>();
  const types = new Set<string>();
  const pending = roots.map((file) => ({ file, path: [] as Edge[], typeOnly: false }));
  const seen = new Set(roots.map((file) => `false:${file}`));

  for (const { file, path, typeOnly } of pending) {
    const absolute = join(root, file);
    let edges = edgesByFile.get(file);
    if (!edges) {
      edges = references(absolute).flatMap((entry) => {
        const to = resolve(entry.specifier, absolute);
        return to ? [{ ...entry, from: file, to }] : [];
      });
      edgesByFile.set(file, edges);
    }
    for (const edge of edges) {
      const nextTypeOnly = typeOnly || edge.kind === "tipo";
      const nextPath = [...path, edge];
      if (edge.to.startsWith("src/features/") && !AUTH_EDGES.has(`${file} -> ${edge.to}`)) {
        (nextTypeOnly ? types : runtime).add(trace(nextPath, edge.to));
        continue;
      }
      const key = `${nextTypeOnly}:${edge.to}`;
      if (seen.has(key)) continue;
      seen.add(key);
      pending.push({ file: edge.to, path: nextPath, typeOnly: nextTypeOnly });
    }
  }
  return { runtime: [...runtime].sort(), types: [...types].sort() };
}
