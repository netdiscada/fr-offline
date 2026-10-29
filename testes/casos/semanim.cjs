// Pré-carregado nos testes detalhados: abre o app com as animações desligadas (o e2e testa com elas ligadas)
const pw = require('playwright');
const lancar = pw.chromium.launch.bind(pw.chromium);
const init = () => { try { localStorage.setItem('fr.animacoes.v1', JSON.stringify('off')); } catch (e) {} };
pw.chromium.launch = async (...a) => {
  const b = await lancar(...a);
  const nc = b.newContext.bind(b), np = b.newPage.bind(b);
  b.newContext = async (...o) => { const c = await nc(...o); await c.addInitScript(init); return c; };
  b.newPage = async (...o) => { const p = await np(...o); await p.context().addInitScript(init); await p.addInitScript(init); return p; };
  return b;
};
