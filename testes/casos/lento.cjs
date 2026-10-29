const { chromium } = require('playwright');
const { initializeTestEnvironment } = require('@firebase/rules-unit-testing');
const { doc, setDoc } = require('firebase/firestore');
(async () => {
  const env = await initializeTestEnvironment({ projectId: 'demo-fr', firestore: { host: '127.0.0.1', port: 8086, rules: require('fs').readFileSync(require('path').resolve(__dirname, '../../firestore.rules'), 'utf8') } });
  await env.withSecurityRulesDisabled(async c => {
    await setDoc(doc(c.firestore(), 'funcionarios/100'), { rgf: '100', nome: 'Antonio Silva', cargo: 'Motorista', uid: null, aprovado: true });
    await setDoc(doc(c.firestore(), 'veiculos/v1'), { placa: 'GBI-2447', modelo: 'S-10', ultimoKm: 217551, ativo: true });
  });
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 400, height: 860 } });
  const p = await ctx.newPage();
  await p.goto('http://localhost:8090/');
  await p.fill('#rgfNumero', '100'); await p.click('#btnRgfContinuar'); await p.click('#btnRgfSouEu');
  await p.waitForSelector('#btnComecarDia');
  await p.waitForTimeout(1500);
  // Sinal fraco: o servidor nunca responde (login e banco)
  await ctx.route(/:(9098|8086)\//, () => {});
  const t0 = Date.now();
  await p.reload();
  try {
    await p.waitForSelector('#btnComecarDia', { timeout: 45000 });
    console.log(`Tela inicial em ${((Date.now() - t0) / 1000).toFixed(1)} s`);
    await p.click('#btnComecarDia');
    const n = await p.locator('.veiculo').count();
    console.log(`Veículos na lista: ${n} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
    // Começa o dia ainda com sinal fraco
    await p.click('.veiculo');
    await p.click('#csComb button[data-valor="1/2"]');
    await p.click('#btnComecarAvancar');
    await p.click('#btnComecarAvancar');
    await p.fill('#cdDescricao', 'Serviço com sinal fraco');
    await p.click('#btnComecarAvancar');
    await p.waitForSelector('#btnSaida');
    console.log(`FR aberta com sinal fraco em ${((Date.now() - t0) / 1000).toFixed(1)} s`);
    await ctx.unroute(/:(9098|8086)\//);
    const { getDocs, collection } = require('firebase/firestore');
    for (let i = 0; i < 90; i++) {
      let n2 = 0;
      await env.withSecurityRulesDisabled(async c => { n2 = (await getDocs(collection(c.firestore(), 'frs'))).size; });
      if (n2) { console.log(`FR chegou ao banco ${i} s depois de o sinal voltar`); break; }
      if (i === 89) console.log('FR NÃO chegou ao banco');
      await p.waitForTimeout(1000);
    }
  } catch (e) { console.log('ERRO', ((e.stack || '').match(/\w+\.cjs:\d+/) || [''])[0], e.message.split('\n')[0]); await b.close(); await env.cleanup(); process.exit(1); }
  await b.close(); await env.cleanup(); process.exit(0);
})();
