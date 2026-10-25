import { EngineProperty } from '../base.types';

export function dependenciesOf(p: EngineProperty): string[] {
  const deps = p.typeOptions?.dependencies;
  if (!Array.isArray(deps)) return [];
  return deps.filter((d): d is string => typeof d === 'string');
}

// Dependency graph between the formula properties of a base. Edges go from
// a formula to the properties it references.
export class FormulaGraph {
  // formula ids in the order the properties were given
  private readonly formulaIds: string[];
  private readonly deps = new Map<string, string[]>();
  // property id -> formulas that reference it directly
  private readonly reverse = new Map<string, string[]>();
  private order: string[] | null = null;

  constructor(properties: EngineProperty[]) {
    this.formulaIds = [];
    for (const p of properties) {
      if (p.type !== 'formula' || this.deps.has(p.id)) continue;
      this.formulaIds.push(p.id);
      const deps = [...new Set(dependenciesOf(p))];
      this.deps.set(p.id, deps);
      for (const d of deps) {
        const list = this.reverse.get(d) ?? [];
        list.push(p.id);
        this.reverse.set(d, list);
      }
    }
  }

  isFormula(id: string): boolean {
    return this.deps.has(id);
  }

  dependenciesOf(id: string): string[] {
    return this.deps.get(id) ?? [];
  }

  // Every formula id, dependencies first. Ties keep the property order.
  // Formulas caught in a cycle (only possible with corrupted data) go last.
  evalOrder(): string[] {
    if (this.order) return this.order;
    const pending = new Map<string, number>();
    for (const id of this.formulaIds) {
      pending.set(
        id,
        this.dependenciesOf(id).filter((d) => this.deps.has(d)).length,
      );
    }
    const order: string[] = [];
    const done = new Set<string>();
    let progressed = true;
    while (progressed) {
      progressed = false;
      for (const id of this.formulaIds) {
        if (done.has(id) || pending.get(id) !== 0) continue;
        done.add(id);
        order.push(id);
        progressed = true;
        for (const dep of this.reverse.get(id) ?? []) {
          pending.set(dep, (pending.get(dep) ?? 0) - 1);
        }
        // restart so that earlier properties keep priority
        break;
      }
    }
    for (const id of this.formulaIds) if (!done.has(id)) order.push(id);
    this.order = order;
    return order;
  }

  // Formulas that depend on any of `changedIds`, directly or through other
  // formulas, in evaluation order. The changed ids themselves are not
  // included unless another changed id leads to them.
  affectedFormulas(changedIds: Iterable<string>): string[] {
    const seen = new Set<string>();
    const stack = [...changedIds];
    while (stack.length) {
      const id = stack.pop();
      for (const f of this.reverse.get(id) ?? []) {
        if (seen.has(f)) continue;
        seen.add(f);
        stack.push(f);
      }
    }
    return this.evalOrder().filter((id) => seen.has(id));
  }

  // Formulas whose value changes when `id` changes or disappears (direct and
  // indirect), in evaluation order.
  dependents(id: string): string[] {
    return this.affectedFormulas([id]);
  }

  // Returns the cycle that `startId` is part of (as a path that starts and
  // ends with it), or null.
  findCycle(startId: string): string[] | null {
    const path: string[] = [startId];
    const visited = new Set<string>();
    const walk = (id: string): boolean => {
      for (const dep of this.dependenciesOf(id)) {
        if (dep === startId) {
          path.push(dep);
          return true;
        }
        if (!this.deps.has(dep) || visited.has(dep)) continue;
        visited.add(dep);
        path.push(dep);
        if (walk(dep)) return true;
        path.pop();
      }
      return false;
    };
    return walk(startId) ? path : null;
  }
}
