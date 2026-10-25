import { EngineProperty } from './base.types';
import {
  cellToValue,
  CompiledFormula,
  compileFormulaSource,
  ErrorCell,
  evaluateNode,
  FORMULA_AST_VERSION,
  FORMULA_RESULT_TYPES,
  FormulaCompileError,
  FormulaGraph,
  FormulaNode,
  FormulaResultType,
  FormulaRuntimeError,
  FormulaValue,
  NamedProperty,
  renamePropertyReferences,
  toCellValue,
} from './formula';

export { FormulaCompileError, renamePropertyReferences };
export type { CompiledFormula, FormulaResultType };

// Parses and checks a formula source against the other properties of the
// base and returns the typeOptions to store. `selfId` is the property being
// edited (null for a new one). The client may send its own analysis, but
// only the source is trusted.
export function compileFormula(
  source: string,
  properties: NamedProperty[],
  selfId: string | null,
  formatOptions?: Record<string, unknown>,
): CompiledFormula {
  return compileFormulaSource(source, properties, selfId, formatOptions);
}

export type FormulaRowInput = {
  cells: Record<string, unknown>;
  createdAt?: Date | string | null;
  updatedAt?: Date | string | null;
  lastEditedBy?: string | null;
};

const OUTDATED_FORMULA =
  'This formula uses an older syntax. Edit it to update it';

type Prepared =
  | { ast: FormulaNode; resultType?: FormulaResultType }
  | { error: string };

function prepare(p: EngineProperty): Prepared {
  const opts = p.typeOptions ?? {};
  if (typeof opts.source !== 'string' || opts.source.trim() === '') {
    return { error: 'Formula is empty' };
  }
  const ast = opts.ast;
  if (
    opts.astVersion !== FORMULA_AST_VERSION ||
    typeof ast !== 'object' ||
    ast === null ||
    typeof ast.k !== 'string'
  ) {
    return { error: OUTDATED_FORMULA };
  }
  const resultType = (FORMULA_RESULT_TYPES as readonly string[]).includes(
    opts.resultType,
  )
    ? (opts.resultType as FormulaResultType)
    : undefined;
  return { ast, resultType };
}

// Evaluates the formula properties of a base over rows. Build one per batch.
export class FormulaEvaluator {
  readonly graph: FormulaGraph;
  private readonly properties: EngineProperty[];
  private readonly byId: Map<string, EngineProperty>;
  private readonly prepared = new Map<string, Prepared>();
  private readonly now: Date;

  constructor(properties: EngineProperty[], now: Date = new Date()) {
    this.properties = properties;
    this.byId = new Map(properties.map((p) => [p.id, p]));
    this.graph = new FormulaGraph(properties);
    this.now = now;
    for (const p of properties) {
      if (p.type === 'formula') this.prepared.set(p.id, prepare(p));
    }
  }

  hasFormulas(): boolean {
    return this.properties.some((p) => p.type === 'formula');
  }

  // Formula properties that depend on `changedIds`, in evaluation order.
  affected(changedIds: string[]): string[] {
    return this.graph.affectedFormulas(changedIds);
  }

  allFormulaIds(): string[] {
    return this.graph.evalOrder();
  }

  // Returns propertyId -> cell value for the requested formulas: a number,
  // text, boolean, ISO date, null (empty) or { __err: message }.
  evaluateRow(
    row: FormulaRowInput,
    formulaIds: string[],
  ): Record<string, unknown> {
    const view: Record<string, unknown> = { ...(row.cells ?? {}) };
    for (const p of this.properties) {
      if (p.type === 'createdAt') {
        view[p.id] = row.createdAt ? new Date(row.createdAt) : null;
      } else if (p.type === 'lastEditedAt') {
        view[p.id] = row.updatedAt ? new Date(row.updatedAt) : null;
      } else if (p.type === 'lastEditedBy') {
        view[p.id] = row.lastEditedBy ?? null;
      }
    }

    const memo = new Map<string, FormulaValue | FormulaRuntimeError>();
    const running = new Set<string>();
    const env = { now: this.now };

    const compute = (id: string): FormulaValue => {
      const cached = memo.get(id);
      if (cached instanceof FormulaRuntimeError) throw cached;
      if (memo.has(id)) return cached as FormulaValue;
      if (running.has(id)) throw new FormulaRuntimeError('Formula cycle');
      running.add(id);
      try {
        const prepared = this.prepared.get(id);
        if (!prepared || 'error' in prepared) {
          throw new FormulaRuntimeError(
            prepared && 'error' in prepared
              ? prepared.error
              : 'Invalid formula',
          );
        }
        const value = evaluateNode(prepared.ast, { env, read });
        // check the type here too so that formulas reading this one see
        // the same error as its own cell
        toCellValue(value, prepared.resultType);
        memo.set(id, value);
        return value;
      } catch (e) {
        const err =
          e instanceof FormulaRuntimeError
            ? e
            : new FormulaRuntimeError('The formula could not be computed');
        memo.set(id, err);
        throw err;
      } finally {
        running.delete(id);
      }
    };

    const read = (id: string): FormulaValue => {
      const prop = this.byId.get(id);
      if (!prop) {
        throw new FormulaRuntimeError('A referenced property was deleted');
      }
      if (prop.type === 'formula') return compute(id);
      return cellToValue(prop.type, prop.typeOptions, view[id]);
    };

    const out: Record<string, unknown> = {};
    for (const id of formulaIds) {
      const prop = this.byId.get(id);
      if (!prop || prop.type !== 'formula') continue;
      try {
        const prepared = this.prepared.get(id) as {
          resultType?: FormulaResultType;
        };
        out[id] = toCellValue(compute(id), prepared.resultType);
      } catch (e) {
        const message =
          e instanceof FormulaRuntimeError
            ? e.message
            : 'The formula could not be computed';
        out[id] = { __err: message } satisfies ErrorCell;
      }
    }
    return out;
  }
}
