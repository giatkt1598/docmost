import { BasePropertyService } from './base-property.service';
import { compileFormula } from './engine/formula.engine';

// jsonb() wraps values in a raw SQL fragment; read the JSON back out of it.
function jsonOf(value: any): any {
  const param = value.toOperationNode().parameters[0];
  return JSON.parse(typeof param === 'string' ? param : param.value);
}

type Prop = {
  id: string;
  name: string;
  type: string;
  typeOptions: any;
  isPrimary?: boolean;
  pendingToken?: string | null;
  pendingType?: string | null;
  pendingTypeOptions?: any;
};

function setup(props: Prop[]) {
  const updates: Array<{ id: string; patch: any; trx: unknown }> = [];
  const propertyRepo = {
    findByPageId: jest.fn(async () => props),
    update: jest.fn(
      async (_pageId: string, id: string, patch: any, trx?: unknown) => {
        updates.push({ id, patch, trx });
        const p = props.find((x) => x.id === id);
        return { ...p, ...patch };
      },
    ),
  };
  const queue = { add: jest.fn(async () => ({ id: 'job-1' })) };
  const events = { emit: jest.fn() };
  const db = {
    transaction: () => ({
      execute: (cb: (trx: unknown) => unknown) => cb('trx'),
    }),
  };
  const service = new BasePropertyService(
    db as any,
    queue as any,
    propertyRepo as any,
    {} as any,
    {} as any,
    events as any,
  );
  return { service, updates, queue, events };
}

const page = { id: 'page-1', workspaceId: 'ws-1' } as any;
const user = { id: 'user-1' } as any;

const number = (id: string, name: string): Prop => ({
  id,
  name,
  type: 'number',
  typeOptions: {},
});

function formula(
  id: string,
  name: string,
  source: string,
  others: Prop[],
): Prop {
  return {
    id,
    name,
    type: 'formula',
    typeOptions: compileFormula(source, others, id),
  };
}

describe('BasePropertyService rename', () => {
  const price = number('p1', 'Price');
  const qty = number('p2', 'Qty');
  const total = formula('f1', 'Total', 'prop("Price") * prop("Qty")', [
    price,
    qty,
  ]);
  const label = formula('f2', 'Label', '"Qty: " + prop("Qty")', [price, qty]);

  it('rewrites prop("Old") in the formulas that reference the property', async () => {
    const { service, updates, events } = setup([price, qty, total, label]);
    await service.update(
      page,
      { pageId: page.id, propertyId: 'p1', name: 'Unit price' } as any,
      user,
    );

    expect(updates.map((u) => u.id)).toEqual(['p1', 'f1']);
    expect(updates.every((u) => u.trx === 'trx')).toBe(true);
    const rewritten = jsonOf(updates[1].patch.typeOptions);
    expect(rewritten.source).toBe('prop("Unit price") * prop("Qty")');
    expect(rewritten.ast).toEqual(total.typeOptions.ast);
    expect(rewritten.dependencies).toEqual(['p1', 'p2']);
    // one event for the renamed property, one for the rewritten formula
    expect(events.emit).toHaveBeenCalledTimes(2);
  });

  it('does nothing extra when the name does not change', async () => {
    const { service, updates } = setup([price, qty, total, label]);
    await service.update(
      page,
      { pageId: page.id, propertyId: 'p1', name: 'Price' } as any,
      user,
    );
    expect(updates.map((u) => u.id)).toEqual(['p1']);
  });

  it('also rewrites the staged options of a pending conversion to formula', async () => {
    const pending: Prop = {
      ...number('p3', 'Converted'),
      pendingType: 'formula',
      pendingToken: 'tok',
      pendingTypeOptions: compileFormula('prop("Qty") + 1', [price, qty], 'p3'),
    };
    const { service, updates } = setup([price, qty, total, label, pending]);
    await service.update(
      page,
      { pageId: page.id, propertyId: 'p2', name: 'Quantity' } as any,
      user,
    );
    expect(updates.map((u) => u.id)).toEqual(['p2', 'f1', 'f2', 'p3']);
    expect(jsonOf(updates[2].patch.typeOptions).source).toBe(
      '"Qty: " + prop("Quantity")',
    );
    expect(jsonOf(updates[3].patch.pendingTypeOptions).source).toBe(
      'prop("Quantity") + 1',
    );
  });

  it('recomputes formulas that read an edited formula', async () => {
    const double = formula('f3', 'Double', 'prop("Total") * 2', [
      price,
      qty,
      total,
    ]);
    const { service, queue } = setup([price, qty, total, double]);
    await service.update(
      page,
      {
        pageId: page.id,
        propertyId: 'f1',
        typeOptions: { source: 'prop("Price") + prop("Qty")' },
      } as any,
      user,
    );
    expect(queue.add).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        propertyIds: ['f1', 'f3'],
        reason: 'formula_edited',
      }),
    );
  });
});
