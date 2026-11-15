const test = require('node:test');
const assert = require('node:assert/strict');
const createCalculator = require('../calculator.js');

const OPS = { '+': '+', '-': '−', '*': '×', '/': '÷' };

// Feed a key sequence: digits, ".", "+ - * /", "=", "%", "s" (sign), "b" (backspace), "c" (clear).
function run(keys) {
  const calc = createCalculator();
  for (const k of keys) {
    if (k >= '0' && k <= '9') calc.inputDigit(k);
    else if (k === '.') calc.inputDecimal();
    else if (k in OPS) calc.inputOperator(OPS[k]);
    else if (k === '=') calc.equals();
    else if (k === '%') calc.percent();
    else if (k === 's') calc.toggleSign();
    else if (k === 'b') calc.backspace();
    else if (k === 'c') calc.clear();
    else throw new Error('unknown key ' + k);
  }
  return calc;
}

test('basic arithmetic', () => {
  assert.equal(run('2+3=').display, '5');
  assert.equal(run('9-12=').display, '-3');
  assert.equal(run('6*7=').display, '42');
  assert.equal(run('1/4=').display, '0.25');
});

test('operations chain from left to right', () => {
  const calc = run('2+3*');
  assert.equal(calc.display, '5');
  assert.equal(calc.expression, '5 ×');
  calc.inputDigit('4');
  calc.equals();
  assert.equal(calc.display, '20');
  assert.equal(calc.expression, '5 × 4 =');
});

test('a second operator replaces the first', () => {
  assert.equal(run('5+*3=').display, '15');
});

test('floating-point noise is not shown', () => {
  assert.equal(run('.1+.2=').display, '0.3');
});

test('decimal point is added one time only', () => {
  assert.equal(run('1.2.3').display, '1.23');
});

test('input stops at 15 digits', () => {
  assert.equal(run('12345678901234567').display, '123456789012345');
});

test('a result starts a new calculation when a digit follows', () => {
  const calc = run('2+3=7');
  assert.equal(calc.display, '7');
  assert.equal(calc.expression, '');
});

test('a result can continue into the next operation', () => {
  assert.equal(run('2+3=*4=').display, '20');
});

test('backspace on a negative number does not leave a lone minus sign', () => {
  const calc = run('5sb');
  assert.equal(calc.display, '0');
  calc.inputOperator('+');
  assert.equal(calc.error, false);
});

test('backspace removes one character and does not change a result', () => {
  assert.equal(run('123b').display, '12');
  assert.equal(run('2+3=b').display, '5');
});

test('digits after percent start a new number', () => {
  assert.equal(run('5%').display, '0.05');
  assert.equal(run('5%3').display, '3');
  assert.equal(run('.0000001%3').display, '3');
});

test('percent keeps the pending operation', () => {
  assert.equal(run('200+10%=').display, '200.1');
  assert.equal(run('200+10%+').display, '200.1');
});

test('division by zero gives an error that only clear removes', () => {
  const calc = run('5/0=');
  assert.equal(calc.display, 'Error');
  assert.equal(calc.error, true);
  for (const k of ['s', '%', 'b', '7', '.', '+', '=']) {
    if (k === 's') calc.toggleSign();
    else if (k === '%') calc.percent();
    else if (k === 'b') calc.backspace();
    else if (k === '7') calc.inputDigit('7');
    else if (k === '.') calc.inputDecimal();
    else if (k === '+') calc.inputOperator('+');
    else calc.equals();
    assert.equal(calc.display, 'Error');
  }
  calc.clear();
  assert.equal(calc.display, '0');
  assert.equal(calc.error, false);
});

test('division by zero in a chain gives an error', () => {
  assert.equal(run('5/0+').display, 'Error');
});

test('overflow gives an error', () => {
  const calc = createCalculator();
  for (let i = 0; i < 25; i++) {
    for (const d of '999999999999999') calc.inputDigit(d);
    calc.inputOperator('×');
  }
  assert.equal(calc.display, 'Error');
});

test('the expression line shows the operand as typed', () => {
  assert.equal(run('123456789012345+').expression, '123456789012345 +');
  assert.equal(run('123456789012345+1=').display, '123456789012346');
  assert.equal(run('2.+').expression, '2 +');
});

test('sign toggles the number in progress', () => {
  assert.equal(run('5s3').display, '-53');
  assert.equal(run('5ss').display, '5');
  assert.equal(run('s').display, '0');
});

test('sign after an operator makes the second operand', () => {
  const calc = run('5+s=');
  assert.equal(calc.display, '0');
  assert.equal(calc.expression, '5 + -5 =');
  assert.equal(run('5+s*2=').display, '0');
});

test('negative zero accepts digits correctly', () => {
  assert.equal(run('0.5sbb5').display, '-5');
});
