import {
  BaseFormulaGraph,
  DEFAULT_MAX_DEPTH,
  evaluate,
  FormulaParseError,
  FormulaResultType,
  parseRaw,
  registry,
  resolve,
  typecheck,
} from '@docmost/base-formula/server';
import type {
  EvalContext,
  PropertyLookup,
  Value,
} from '@docmost/base-formula/server';
import { EngineProperty } from './base.types';

export class FormulaCompileError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
  }
}

// Mirrors the client typecheck input (use-formula-parser.ts) so both sides
// accept and reject the same formulas.
export function resultTypeOfProperty(type: string): FormulaResultType {
  if (type === 'number') return 'number';
  if (
    type === 'text' ||
    type === 'url' ||
    type === 'email' ||
    type === 'longText'
  ) {
    return 'string';
  }
  if (type === 'checkbox') return 'boolean';
  if (type === 'date' || type === 'createdAt' || type === 'lastEditedAt') {
    return 'date';
  }
  return 'null';
}

export type CompiledFormula = {
  source: string;
  ast: unknown;
  resultType: FormulaResultType;
  dependencies: string[];
  astVersion: 1;
  formatOptions?: Record<string, unknown>;
};

// Parses and checks a formula source against the other properties of the
// base. `selfId` is the property being edited (null for a new one). The
// client sends its own parse result, but the server never trusts it.
export function compileFormula(
  source: string,
  properties: Array<EngineProperty & { name: string }>,
  selfId: string | null,
  formatOptions?: Record<string, unknown>,
): CompiledFormula {
  if (typeof source !== 'string' || source.trim() === '') {
    throw new FormulaCompileError('Formula is empty', 'EMPTY');
  }
  try {
    const others = properties.filter((p) => p.id !== selfId);
    const nameToId = new Map(others.map((p) => [p.name, p.id]));
    const raw = parseRaw(source);
    const resolved = resolve(raw, nameToId);
    const typeMap = new Map<string, FormulaResultType>(
      others.map((p) => [p.id, resultTypeOfProperty(p.type)]),
    );
    const { resultType } = typecheck(resolved.ast, typeMap, registry);

    const candidate = {
      id: selfId ?? '__pending__',
      type: 'formula',
      typeOptions: { dependencies: resolved.dependencies },
    };
    const graph = new BaseFormulaGraph([...others, candidate]);
    const cycle = graph.detectCycle(candidate);
    if (cycle) {
      throw new FormulaCompileError(
        `Formula cycle: ${cycle.join(' -> ')}`,
        'CYCLE',
      );
    }
    return {
      source,
      ast: resolved.ast,
      resultType,
      dependencies: resolved.dependencies,
      astVersion: 1,
      ...(formatOptions ? { formatOptions } : {}),
    };
  } catch (e) {
    if (e instanceof FormulaCompileError) throw e;
    if (e instanceof FormulaParseError) {
      const first = e.errors[0];
      throw new FormulaCompileError(
        first?.message ?? e.message,
        first?.code ?? 'PARSE_ERROR',
      );
    }
    throw e;
  }
}

export type FormulaRowInput = {
  cells: Record<string, unknown>;
  createdAt?: Date | string | null;
  updatedAt?: Date | string | null;
  lastEditedBy?: string | null;
};

// Evaluates formula properties over rows. Build once per batch.
export class FormulaEvaluator {
  readonly graph: BaseFormulaGraph;
  private readonly lookups: Map<string, PropertyLookup>;
  private readonly properties: EngineProperty[];

  constructor(properties: EngineProperty[]) {
    this.properties = properties;
    this.graph = new BaseFormulaGraph(properties);
    this.lookups = new Map(
      properties.map((p) => [
        p.id,
        { id: p.id, type: p.type, typeOptions: p.typeOptions },
      ]),
    );
  }

  hasFormulas(): boolean {
    return this.properties.some((p) => p.type === 'formula');
  }

  // Formula properties that depend on `changedIds`, in evaluation order.
  affected(changedIds: string[]): string[] {
    const affected = new Set(this.graph.affectedFormulas(changedIds));
    return this.graph.evalOrder().filter((id) => affected.has(id));
  }

  allFormulaIds(): string[] {
    return this.graph.evalOrder();
  }

  // Returns propertyId -> computed value for the requested formulas.
  evaluateRow(row: FormulaRowInput, formulaIds: string[]) {
    const view: Record<string, unknown> = { ...row.cells };
    for (const p of this.properties) {
      if (p.type === 'createdAt' && row.createdAt) {
        view[p.id] = new Date(row.createdAt).toISOString();
      } else if (p.type === 'lastEditedAt' && row.updatedAt) {
        view[p.id] = new Date(row.updatedAt).toISOString();
      } else if (p.type === 'lastEditedBy') {
        view[p.id] = row.lastEditedBy ?? null;
      }
    }
    const ctx: EvalContext = {
      registry,
      properties: this.lookups,
      depth: 0,
      maxDepth: DEFAULT_MAX_DEPTH,
      memo: new Map<string, Value>(),
    };
    const out: Record<string, Value> = {};
    for (const id of formulaIds) {
      const prop = this.lookups.get(id);
      const ast = (prop?.typeOptions as any)?.ast;
      if (!prop || prop.type !== 'formula' || !ast) continue;
      out[id] = evaluate(ast, view, ctx);
    }
    return out;
  }
}
