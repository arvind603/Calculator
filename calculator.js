// Calculator logic. No DOM access, so the same file runs in the browser and in Node tests.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.createCalculator = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  // 15 digits is the most a double can hold exactly, for input and for results.
  const MAX_DIGITS = 15;

  function format(n) {
    if (!Number.isFinite(n)) return 'Error';
    return String(parseFloat(n.toPrecision(MAX_DIGITS)));
  }

  function compute(a, b, op) {
    switch (op) {
      case '+': return a + b;
      case '−': return a - b;
      case '×': return a * b;
      case '÷': return b === 0 ? NaN : a / b;
    }
    return NaN;
  }

  const digitCount = s => s.replace(/[^0-9]/g, '').length;
  const tidy = s => (s.endsWith('.') ? s.slice(0, -1) : s);

  return function createCalculator() {
    let current, previous, previousStr, operator, expression, error;
    // overwrite: the next digit replaces the display.
    // awaitingOperand: an operator was the last input, so there is no second operand yet.
    let overwrite, awaitingOperand;

    function clear() {
      current = '0';
      previous = null;
      previousStr = '';
      operator = null;
      expression = '';
      error = false;
      overwrite = false;
      awaitingOperand = false;
    }

    function fail() {
      current = 'Error';
      error = true;
      previous = null;
      operator = null;
      overwrite = true;
      awaitingOperand = false;
    }

    function startEntry(text) {
      current = text;
      overwrite = false;
      awaitingOperand = false;
      if (operator === null) expression = '';
    }

    function inputDigit(d) {
      if (error) return;
      if (overwrite) startEntry(d);
      else if (current === '0') current = d;
      else if (current === '-0') current = '-' + d;
      else if (digitCount(current) < MAX_DIGITS) current += d;
    }

    function inputDecimal() {
      if (error) return;
      if (overwrite) startEntry('0.');
      else if (!current.includes('.') && digitCount(current) < MAX_DIGITS) current += '.';
    }

    function inputOperator(op) {
      if (error) return;
      if (previous !== null && !awaitingOperand) {
        const res = compute(previous, parseFloat(current), operator);
        if (!Number.isFinite(res)) {
          expression = previousStr + ' ' + operator + ' ' + tidy(current) + ' =';
          fail();
          return;
        }
        previous = res;
        previousStr = current = format(res);
      } else {
        previous = parseFloat(current);
        previousStr = tidy(current);
      }
      operator = op;
      expression = previousStr + ' ' + op;
      overwrite = true;
      awaitingOperand = true;
    }

    function equals() {
      if (error || operator === null) return;
      const res = compute(previous, parseFloat(current), operator);
      expression = previousStr + ' ' + operator + ' ' + tidy(current) + ' =';
      if (!Number.isFinite(res)) {
        fail();
        return;
      }
      current = format(res);
      previous = null;
      operator = null;
      overwrite = true;
      awaitingOperand = false;
    }

    function toggleSign() {
      if (error || current === '0') return;
      current = current.startsWith('-') ? current.slice(1) : '-' + current;
      awaitingOperand = false;
    }

    function percent() {
      if (error) return;
      current = format(parseFloat(current) / 100);
      overwrite = true;
      awaitingOperand = false;
    }

    function backspace() {
      if (error || overwrite) return;
      current = current.slice(0, -1);
      if (current === '' || current === '-') current = '0';
    }

    clear();

    return {
      inputDigit, inputDecimal, inputOperator, equals, clear, toggleSign, percent, backspace,
      get display() { return current; },
      get expression() { return expression; },
      get error() { return error; },
    };
  };
});
