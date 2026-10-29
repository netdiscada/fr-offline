// Primeiro acesso com login lento: os veículos têm que aparecer sem recarregar
const { chromium } = require('playwright');
const { initializeTestEnvironment } = require('@firebase/rules-unit-testing');
const { doc, setDoc } = require('firebase/firestore');
let falhas = 0;
const ok = (c, msg) => { console.log(c ? 'OK  ' : 'FALHA', msg); if (!c) falhas++; };
(async () => {
  const env = await initializeTestEnvironment({ projectId: 'demo-fr', firestore: { host: '127.0.0.1', port: 8086, rules: require('fs').readFileSync(require('path').resolve(__dirname, '../../firestore.rules'), 'utf8') } });
  await env.withSecurityRulesDisabled(async c => {
    const db = c.firestore();
    await setDoc(doc(db, 'funcionarios/100'), { rgf: '100', nome: 'Antonio Silva', cargo: 'Motorista', uid: null, aprovado: true, visto: true });
    await setDoc(doc(db, 'veiculos/v1'), { placa: 'GBI-2447', modelo: 'S-10', marca: 'GM', ultimoKm: 1000, ativo: true });
  });
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 400, height: 860 } });
  // Login anônimo demora 4 s (sinal fraco)
  await ctx.route(/:9098\/.*signUp/, async r => { await new Promise(x => setTimeout(x, 4000)); r.continue(); });
  const p = await ctx.newPage();
  p.on('pageerror', e => console.log('pageerror', e.message));
  await p.goto('http://localhost:8090/');
  await p.fill('#rgfNumero', '100'); await p.click('#btnRgfContinuar'); await p.click('#btnRgfSouEu');
  await p.click('#btnComecarDia');
  ok(!!(await p.waitForSelector('.veiculo[data-id="v1"]', { timeout: 15000 }).catch(() => null)), 'Primeiro acesso com login lento: veículos aparecem sem recarregar');
  await b.close(); await env.cleanup();
  console.log(falhas ? `FALHAS: ${falhas}` : 'TUDO OK');
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.log('ERRO', ((e.stack || '').match(/\w+\.cjs:\d+/) || [''])[0], e.message.split('\n')[0]); process.exit(1); });
