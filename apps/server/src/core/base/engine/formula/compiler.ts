import { EngineProperty } from '../base.types';
import { FormulaGraph } from './graph';
import { parseFormula } from './parser';
import { formulaTypeOfProperty, inferType } from './type-checker';
import {
  FORMULA_AST_VERSION,
  FormulaCompileError,
  FormulaNode,
  FormulaResultType,
} from './types';

export type NamedProperty = EngineProperty & { name: string };

// What a formula property stores in typeOptions.
export type CompiledFormula = {
  source: string;
  resultType: FormulaResultType;
  // ids of the referenced properties, in order of first use
  dependencies: string[];
  ast: FormulaNode;
  astVersion: typeof FORMULA_AST_VERSION;
  formatOptions?: Record<string, unknown>;
};

const NEW_FORMULA_ID = '__new_formula__';

export function normalizePropertyName(name: string): string {
  return name.trim().toLowerCase();
}

// Looks a property up by name: exact match first, then ignoring case and
// surrounding spaces (names are unique that way).
export function findPropertyByName<T extends { name: string }>(
  properties: T[],
  name: string,
): T | undefined {
  return (
    properties.find((p) => p.name === name) ??
    properties.find(
      (p) => normalizePropertyName(p.name) === normalizePropertyName(name),
    )
  );
}

// Replaces property names with ids. Returns the resolved tree and the
// referenced ids.
export function resolveReferences(
  ast: FormulaNode,
  properties: NamedProperty[],
  self: NamedProperty | null,
): { ast: FormulaNode; dependencies: string[] } {
  const dependencies: string[] = [];
  const visit = (node: FormulaNode): FormulaNode => {
    switch (node.k) {
      case 'prop': {
        const prop = findPropertyByName(properties, node.name);
        if (!prop) {
          if (self && findPropertyByName([self], node.name)) {
            throw new FormulaCompileError(
              'A formula cannot refer to itself',
              'SELF_REFERENCE',
            );
          }
          throw new FormulaCompileError(
            `Unknown property "${node.name}"`,
            'UNKNOWN_PROPERTY',
          );
        }
        if (!dependencies.includes(prop.id)) dependencies.push(prop.id);
        return { k: 'prop', id: prop.id };
      }
      case 'unary':
        return { ...node, arg: visit(node.arg) };
      case 'binary':
        return { ...node, left: visit(node.left), right: visit(node.right) };
      case 'call':
        return { ...node, args: node.args.map(visit) };
      default:
        return node;
    }
  };
  return { ast: visit(ast), dependencies };
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

// Parses, resolves and type checks a formula against the other properties
// of the base. `selfId` is the property being edited (null for a new one).
// Throws FormulaCompileError with a user facing message.
export function compileFormulaSource(
  source: string,
  properties: NamedProperty[],
  selfId: string | null,
  formatOptions?: unknown,
): CompiledFormula {
  const raw = parseFormula(source);
  const others = properties.filter((p) => p.id !== selfId);
  const self = properties.find((p) => p.id === selfId) ?? null;
  const { ast, dependencies } = resolveReferences(raw, others, self);

  const byId = new Map(others.map((p) => [p.id, p]));
  const type = inferType(ast, (id) => {
    const p = byId.get(id);
    return formulaTypeOfProperty(p?.type, p?.typeOptions);
  });
  if (type === 'list') {
    throw new FormulaCompileError(
      'A formula cannot return a list. Use toText() or length()',
      'RESULT_TYPE',
    );
  }
  const resultType: FormulaResultType = type === 'empty' ? 'text' : type;

  const candidateId = selfId ?? NEW_FORMULA_ID;
  const graph = new FormulaGraph([
    ...others,
    { id: candidateId, type: 'formula', typeOptions: { dependencies } },
  ]);
  const cycle = graph.findCycle(candidateId);
  if (cycle) {
    const names = cycle.map((id) =>
      id === candidateId ? (self?.name ?? 'this formula') : byId.get(id)?.name,
    );
    throw new FormulaCompileError(
      `Formula cycle: ${names.join(' -> ')}`,
      'CYCLE',
    );
  }

  return {
    source,
    resultType,
    dependencies,
    ast,
    astVersion: FORMULA_AST_VERSION,
    ...(isPlainObject(formatOptions) ? { formatOptions } : {}),
  };
}
