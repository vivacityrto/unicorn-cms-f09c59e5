/**
 * Parses src/integrations/supabase/types.ts's `Database["public"]` type
 * literal into a plain-data contract (table columns, RPC args/returns)
 * that contract.test.ts can diff against the live PostgREST OpenAPI schema.
 *
 * Uses the TypeScript compiler API (same package already used by
 * scripts/generate-route-manifest.mjs) rather than regex, since the
 * generated file's formatting is not a stable contract to match against.
 */
import ts from "typescript";
import { readFileSync } from "node:fs";

export interface ParsedColumn {
  name: string;
  /** Raw type text as written in the generated file, e.g. "string | null". */
  typeText: string;
  nullable: boolean;
}

export interface ParsedTable {
  name: string;
  columns: ParsedColumn[];
}

export interface ParsedFunctionArg {
  name: string;
  typeText: string;
  optional: boolean;
}

export interface ParsedFunction {
  name: string;
  args: ParsedFunctionArg[];
  returnsText: string;
}

export interface ParsedContract {
  tables: ParsedTable[];
  functions: ParsedFunction[];
}

function findPropertyByName(
  literal: ts.TypeLiteralNode,
  name: string,
): ts.PropertySignature | undefined {
  for (const member of literal.members) {
    if (
      ts.isPropertySignature(member) &&
      member.name &&
      ts.isIdentifier(member.name) &&
      member.name.text === name
    ) {
      return member;
    }
  }
  return undefined;
}

function asTypeLiteral(node: ts.TypeNode | undefined): ts.TypeLiteralNode | undefined {
  return node && ts.isTypeLiteralNode(node) ? node : undefined;
}

function parseRowColumns(
  sourceFile: ts.SourceFile,
  rowLiteral: ts.TypeLiteralNode,
): ParsedColumn[] {
  const columns: ParsedColumn[] = [];
  for (const member of rowLiteral.members) {
    if (!ts.isPropertySignature(member) || !member.type || !member.name) continue;
    if (!ts.isIdentifier(member.name) && !ts.isStringLiteral(member.name)) continue;
    const name = member.name.getText(sourceFile);
    const typeText = member.type.getText(sourceFile);
    columns.push({
      name,
      typeText,
      nullable: /\bnull\b/.test(typeText),
    });
  }
  return columns;
}

function parseFunctionArgs(
  sourceFile: ts.SourceFile,
  argsLiteral: ts.TypeLiteralNode,
): ParsedFunctionArg[] {
  const args: ParsedFunctionArg[] = [];
  for (const member of argsLiteral.members) {
    if (!ts.isPropertySignature(member) || !member.type || !member.name) continue;
    if (!ts.isIdentifier(member.name) && !ts.isStringLiteral(member.name)) continue;
    args.push({
      name: member.name.getText(sourceFile),
      typeText: member.type.getText(sourceFile),
      optional: !!member.questionToken,
    });
  }
  return args;
}

/**
 * Walks `Database["public"]["Tables"]` and `Database["public"]["Functions"]`
 * out of a parsed source file. Returns an empty contract (rather than
 * throwing) if the expected shape is not found, so a generator-format
 * change fails a specific, readable test assertion instead of crashing the
 * whole suite with a stack trace.
 */
export function parseDatabaseContract(sourceText: string, fileName = "types.ts"): ParsedContract {
  const sourceFile = ts.createSourceFile(fileName, sourceText, ts.ScriptTarget.Latest, true);

  let publicLiteral: ts.TypeLiteralNode | undefined;

  ts.forEachChild(sourceFile, (node) => {
    if (publicLiteral) return;
    if (!ts.isTypeAliasDeclaration(node) || node.name.text !== "Database") return;
    const databaseLiteral = asTypeLiteral(node.type);
    if (!databaseLiteral) return;
    const publicProp = findPropertyByName(databaseLiteral, "public");
    publicLiteral = asTypeLiteral(publicProp?.type);
  });

  if (!publicLiteral) return { tables: [], functions: [] };

  const tables: ParsedTable[] = [];
  const tablesProp = findPropertyByName(publicLiteral, "Tables");
  const tablesLiteral = asTypeLiteral(tablesProp?.type);
  if (tablesLiteral) {
    for (const member of tablesLiteral.members) {
      if (!ts.isPropertySignature(member) || !member.name || !member.type) continue;
      if (!ts.isIdentifier(member.name) && !ts.isStringLiteral(member.name)) continue;
      const tableLiteral = asTypeLiteral(member.type);
      if (!tableLiteral) continue;
      const rowProp = findPropertyByName(tableLiteral, "Row");
      const rowLiteral = asTypeLiteral(rowProp?.type);
      if (!rowLiteral) continue;
      tables.push({
        name: member.name.getText(sourceFile),
        columns: parseRowColumns(sourceFile, rowLiteral),
      });
    }
  }

  const functions: ParsedFunction[] = [];
  const functionsProp = findPropertyByName(publicLiteral, "Functions");
  const functionsLiteral = asTypeLiteral(functionsProp?.type);
  if (functionsLiteral) {
    for (const member of functionsLiteral.members) {
      if (!ts.isPropertySignature(member) || !member.name || !member.type) continue;
      if (!ts.isIdentifier(member.name) && !ts.isStringLiteral(member.name)) continue;
      const fnLiteral = asTypeLiteral(member.type);
      if (!fnLiteral) continue;
      const argsProp = findPropertyByName(fnLiteral, "Args");
      const argsLiteral = asTypeLiteral(argsProp?.type);
      const returnsProp = findPropertyByName(fnLiteral, "Returns");
      functions.push({
        name: member.name.getText(sourceFile),
        args: argsLiteral ? parseFunctionArgs(sourceFile, argsLiteral) : [],
        returnsText: returnsProp?.type ? returnsProp.type.getText(sourceFile) : "unknown",
      });
    }
  }

  return { tables, functions };
}

export function parseGeneratedTypesFile(path: string): ParsedContract {
  return parseDatabaseContract(readFileSync(path, "utf8"), path);
}
