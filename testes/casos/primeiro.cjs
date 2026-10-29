// Primeiro acesso com nome, RGF e cargo (offline). Os veículos aparecem sem recarregar.
const { chromium } = require('playwright');
let falhas = 0;
const ok = (c, msg) => { console.log(c ? 'OK  ' : 'FALHA', msg); if (!c) falhas++; };
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 400, height: 860 } });
  const p = await ctx.newPage();
  p.on('pageerror', e => console.log('pageerror', e.message));

  // Cadastra o veículo no IndexedDB ANTES de entrar (sem servidor: não há ADM)
  await p.goto('http://localhost:8090/');
  await p.evaluate(async () => {
    // Limpa tudo antes de começar (estado residual de outros testes)
    const db = await new Promise((ok, erro) => {
      const req = indexedDB.open('fr-offline', 1);
      req.onerror = () => erro(req.error);
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
    await gravar('veiculos', [{ id: 'v1', placa: 'GBI-2447', modelo: 'S-10', marca: 'GM', tipo: 'caminhonete', ultimoKm: 1000, ativo: true }]);
    db.close();
  });
  // Recarrega para o app observar o veículo já cadastrado
  await p.reload();

  // Primeiro acesso: RGF -> nome/cargo -> entra
  await p.fill('#rgfNumero', '100'); await p.click('#btnRgfContinuar');
  await p.waitForSelector('#rgfNome', { timeout: 10000 });
  await p.fill('#rgfNome', 'Antonio Silva'); await p.fill('#rgfCargo', 'Motorista');
  await p.click('#btnRgfPedirAcesso');
  // Abre "Começar o dia": a lista de veículos deve aparecer
  await p.click('#btnComecarDia');
  await p.waitForSelector('.veiculo[data-id="v1"]', { timeout: 10000 });
  ok(await p.locator('.veiculo[data-id="v1"]').count() === 1, 'Veículo aparece sem recarregar após o primeiro acesso');
  await p.click('.veiculo[data-id="v1"]');
  ok(await p.inputValue('#csKm') === '1000', 'Km sugerido = ultimoKm do veículo (1000)');

  await b.close();
  console.log(falhas ? `FALHAS: ${falhas}` : 'TUDO OK');
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.log('ERRO', ((e.stack || '').match(/\w+\.cjs:\d+/) || [''])[0], e.message.split('\n')[0]); process.exit(1); });
