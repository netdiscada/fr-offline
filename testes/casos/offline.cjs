// Abrir sem internet e recarregar: a FR continua aberta.
// (sem servidor: não precisa de emulador Firebase)
const { chromium } = require('playwright');
const URL = process.env.FR_URL || 'http://localhost:8090/';
let falhas = 0;
const ok = (c, msg) => { console.log(c ? 'OK  ' : 'FALHA', msg); if (!c) falhas++; };
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 400, height: 860 } });
  const p = await ctx.newPage();
  p.on('pageerror', e => console.log('pageerror', e.message));

  // Cadastra veículo no IndexedDB para funcionar sem servidor
  await p.goto(URL);
  await p.evaluate(async () => {
    // Limpa tudo antes de começar (estado residual de outros testes)
    const db = await new Promise((ok, erro) => {
      const req = indexedDB.open('fr-offline', 1);
      req.onerror = () => erro(req.error);
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains('funcionarios')) d.createObjectStore('funcionarios', { keyPath: 'rgf' });
        if (!d.objectStoreNames.contains('veiculos')) d.createObjectStore('veiculos', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('frs')) d.createObjectStore('frs', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('locais')) d.createObjectStore('locais', { keyPath: 'chave' });
        if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta', { keyPath: 'chave' });
      };
      req.onsuccess = () => ok(req.result);
    });
    const limpar = () => new Promise((ok2, erro2) => {
      const tx = db.transaction(['veiculos', 'frs', 'locais', 'funcionarios', 'meta'], 'readwrite');
      ['veiculos', 'frs', 'locais', 'funcionarios', 'meta'].forEach(n => tx.objectStore(n).clear());
      tx.oncomplete = ok2;
      tx.onerror = () => erro2(tx.error);
    });
    await limpar();
    const gravar = (loja, registros) => new Promise((ok2, erro2) => {
      const tx = db.transaction(loja, 'readwrite');
      const l = tx.objectStore(loja);
      registros.forEach(r => l.put(r));
      tx.oncomplete = ok2;
      tx.onerror = () => erro2(tx.error);
    });
    await gravar('veiculos', [{ id: 'v1', placa: 'GBI-2447', modelo: 'S-10', marca: 'GM', numero: '12', ultimoKm: 1000, ativo: true }]);
    db.close();
  });
  await p.reload();

  // Primeiro acesso com internet
  await p.fill('#rgfNumero', '100'); await p.click('#btnRgfContinuar');
  try {
    await p.waitForSelector('#rgfNome', { timeout: 3000 });
    await p.fill('#rgfNome', 'Antonio Silva'); await p.fill('#rgfCargo', 'Motorista');
    await p.click('#btnRgfPedirAcesso');
  } catch (e) { /* já tem perfil */ }

  await p.waitForSelector('#btnComecarDia', { timeout: 15000 });
  await p.click('#btnComecarDia');
  await p.waitForSelector('.veiculo[data-id="v1"]', { timeout: 10000 });

  // Espera o service worker estar registrado e ativo
  await p.evaluate(() => navigator.serviceWorker.ready);
  await p.waitForTimeout(1000);
  if (!(await p.evaluate(() => navigator.serviceWorker.controller))) {
    await p.reload();
    await p.evaluate(() => navigator.serviceWorker.ready);
    await p.waitForTimeout(1000);
  }

  // Sem internet: recarrega, o SW serve do cache
  await ctx.setOffline(true);
  await p.reload();
  await p.waitForSelector('#btnComecarDia', { timeout: 10000 });

  // Abre "Começar o dia" sem internet e confere o veículo
  await p.click('#btnComecarDia');
  await p.waitForSelector('.veiculo[data-id="v1"]', { timeout: 10000 });
  const temVeiculo = await p.locator('.veiculo[data-id="v1"]').count() === 1;
  ok(temVeiculo, 'Veículo aparece após recarregar sem internet (app off-line)');

  await b.close();
  console.log(falhas ? `FALHAS: ${falhas}` : 'TUDO OK');
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.log('ERRO', ((e.stack || '').match(/\w+\.cjs:\d+/) || [''])[0], e.message.split('\n')[0]); process.exit(1); });
