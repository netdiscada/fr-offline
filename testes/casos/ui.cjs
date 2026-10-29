// Ajudas dos testes para o visual novo (lista de FRs com "Mais" e o visor do papel no lugar do "FR pronta")
const ROTULO = { pdf: 'Ver PDF', editar: 'Corrigir', compartilhar: 'Compartilhar', trocar: 'Trocar', liberar: 'Reabrir', cancelar: 'Cancelar', papel: 'Anotar km', reabrir: 'Reabrir', excluir: 'Excluir', imprimir: 'Imprimir' };
// Clica numa ação do cartão da FR: o botão, se estiver à vista, ou pelo "⋯ Mais"
async function acaoFr(p, fr, acao) {
  const base = fr ? `[data-fr="${fr}"]` : '[data-fr]';
  await p.waitForSelector(base);
  const b = p.locator(`${base} [data-acao="${acao}"]`).first();
  if (await b.count()) return b.click();
  await p.locator(`${base} [data-mais]`).first().click();
  await p.locator(`#acoesLista button:has-text("${ROTULO[acao]}")`).first().click();
}
const IMPRIMIR = '#visorAcoes button:has-text("Imprimir")';
async function fecharVisor(p) { if (await p.isVisible('#visorFechar')) await p.click('#visorFechar'); }
module.exports = { acaoFr, IMPRIMIR, fecharVisor };
