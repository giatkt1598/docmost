import {
  acceptsType,
  argSpecAt,
  describeArgSpec,
  FUNCTIONS,
} from './functions';
import {
  BinaryOperator,
  FormulaCompileError,
  FormulaNode,
  FormulaType,
} from './types';
import { describeType } from './values';

// Static type of a property reference, by property type.
export function formulaTypeOfProperty(
  type: string,
  typeOptions?: any,
): FormulaType {
  switch (type) {
    case 'text':
    case 'longText':
    case 'url':
    case 'email':
    case 'select':
    case 'status':
      return 'text';
    case 'number':
      return 'number';
    case 'checkbox':
      return 'boolean';
    case 'date':
    case 'createdAt':
    case 'lastEditedAt':
      return 'date';
    case 'multiSelect':
    case 'person':
    case 'file':
    case 'page':
    case 'lastEditedBy':
      return 'list';
    case 'formula': {
      const rt = typeOptions?.resultType;
      if (rt === 'number' || rt === 'boolean' || rt === 'date') return rt;
      // 'string' is how older formulas stored text results
      if (rt === 'text' || rt === 'string') return 'text';
      return 'empty';
    }
    default:
      return 'empty';
  }
}

function typeError(message: string): never {
  throw new FormulaCompileError(message, 'TYPE');
}

function both(a: FormulaType, b: FormulaType) {
  return `${describeType(a)} and ${describeType(b)}`;
}

function checkBinary(
  op: BinaryOperator,
  l: FormulaType,
  r: FormulaType,
): FormulaType {
  if (l === 'list' || r === 'list') {
    typeError(
      `Operator "${op}" cannot be used with a list. Lists only work with empty(), length(), contains() and toText()`,
    );
  }
  const isNum = (t: FormulaType) => t === 'number' || t === 'empty';
  switch (op) {
    case '+':
      if (l === 'text' || r === 'text') return 'text';
      if (isNum(l) && isNum(r)) {
        return l === 'empty' && r === 'empty' ? 'empty' : 'number';
      }
      if (l === 'date' || r === 'date') {
        typeError('Use dateAdd() to add time to a date');
      }
      return typeError(`Operator "+" cannot add ${both(l, r)}`);
    case '-':
    case '*':
    case '/':
    case '%':
      if (isNum(l) && isNum(r)) return 'number';
      if (op === '-' && l === 'date' && r === 'date') {
        typeError('Use dateBetween() to subtract dates');
      }
      return typeError(`Operator "${op}" expects numbers, got ${both(l, r)}`);
    case '<':
    case '<=':
    case '>':
    case '>=':
      if (l === 'boolean' || r === 'boolean') {
        typeError(`Operator "${op}" cannot compare booleans`);
      }
      if (l !== 'empty' && r !== 'empty' && l !== r) {
        typeError(`Operator "${op}" cannot compare ${both(l, r)}`);
      }
      return 'boolean';
    case '==':
    case '!=':
      if (l !== 'empty' && r !== 'empty' && l !== r) {
        typeError(`Operator "${op}" cannot compare ${both(l, r)}`);
      }
      return 'boolean';
    case '&&':
    case '||':
      if (
        (l !== 'boolean' && l !== 'empty') ||
        (r !== 'boolean' && r !== 'empty')
      ) {
        typeError(`Operator "${op}" expects booleans, got ${both(l, r)}`);
      }
      return 'boolean';
  }
}

// Infers the static type of a resolved AST. `typeOfProperty` gives the type
// of each referenced property id.
export function inferType(
  node: FormulaNode,
  typeOfProperty: (id: string) => FormulaType,
): FormulaType {
  switch (node.k) {
    case 'num':
      return 'number';
    case 'str':
      return 'text';
    case 'bool':
      return 'boolean';
    case 'prop':
      return typeOfProperty(node.id);
    case 'unary': {
      const t = inferType(node.arg, typeOfProperty);
      if (node.op === '-') {
        if (t !== 'number' && t !== 'empty') {
          typeError(`Cannot negate ${describeType(t)}`);
        }
        return 'number';
      }
      if (t !== 'boolean' && t !== 'empty') {
        typeError(`Operator "!" expects a boolean, got ${describeType(t)}`);
      }
      return 'boolean';
    }
    case 'binary':
      return checkBinary(
        node.op,
        inferType(node.left, typeOfProperty),
        inferType(node.right, typeOfProperty),
      );
    case 'call': {
      const def = FUNCTIONS.get(node.fn);
      if (!def) {
        throw new FormulaCompileError(
          `Unknown function "${node.fn}"`,
          'UNKNOWN_FUNCTION',
        );
      }
      const n = node.args.length;
      if (n < def.minArgs || n > def.maxArgs) {
        const expected =
          def.minArgs === def.maxArgs
            ? `${def.minArgs}`
            : def.maxArgs === Infinity
              ? `at least ${def.minArgs}`
              : `${def.minArgs} to ${def.maxArgs}`;
        throw new FormulaCompileError(
          `${def.signature} takes ${expected} argument${expected === '1' ? '' : 's'}, got ${n}`,
          'ARGUMENTS',
        );
      }
      const types = node.args.map((a, i) => {
        const t = inferType(a, typeOfProperty);
        const spec = argSpecAt(def, i);
        if (!acceptsType(spec, t)) {
          typeError(
            `${def.signature}: argument ${i + 1} must be ${describeArgSpec(spec)}, got ${describeType(t)}`,
          );
        }
        return t;
      });
      return def.returns(types, node.args);
    }
    default:
      throw new FormulaCompileError('Invalid formula', 'SYNTAX');
  }
}
