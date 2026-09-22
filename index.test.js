const test = require('node:test');
const assert = require('node:assert');
const { calcularTotal, aplicarDesconto } = require('./index');

test('calcula o total corretamente', () => {
  assert.strictEqual(calcularTotal(10, 3), 30);
});

test('lança erro com preço negativo', () => {
  assert.throws(() => calcularTotal(-1, 3));
});

test('lança erro com quantidade negativa', () => {
  assert.throws(() => calcularTotal(10, -1));
});

test('aplica desconto corretamente', () => {
  assert.strictEqual(aplicarDesconto(100, 10), 90);
});

test('lança erro com percentual inválido', () => {
  assert.throws(() => aplicarDesconto(100, 150));
});