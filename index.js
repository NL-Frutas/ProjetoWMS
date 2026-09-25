function calcularTotal(preco, quantidade) {
  if (preco < 0 || quantidade < 0) {
    throw new Error("Preço e quantidade não podem ser negativos");
  }
  return preco * quantidade;
}

function aplicarDesconto(total, percentual) {
  if (percentual < 0 || percentual > 100) {
    throw new Error("Percentual de desconto inválido");
  }
  return total - (total * percentual) / 100;
}

console.log("testando a acuracia da IA")
console.log("Resolvendo o pull request e passando o teste da IA")

//implemente um comentario a seguir: 
console.log(este é o comentario solicitado.)

module.exports = { calcularTotal, aplicarDesconto };