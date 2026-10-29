// Km em cadeia: a saída nova vem do último retorno do veículo.
// Cadastrar veículo e FR anterior diretamente no IndexedDB (sem servidor).
const { chromium } = require('playwright');
let falhas = 0;
const ok = (c, msg) => { console.log(c ? 'OK  ' : 'FALHA', msg); if (!c) falhas++; };
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 400, height: 860 } });
  const p = await ctx.newPage();
  p.on('pageerror', e => console.log('pageerror', e.message));

  // Cadastra veículo e FR anterior no IndexedDB
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
    await gravar('veiculos', [{ id: 'v1', placa: 'GBI-2447', modelo: 'S-10', marca: 'GM', tipo: 'caminhonete', ultimoKm: 117789, ativo: true }]);
    await gravar('frs', [{
      id: 'f1', rgf: '100', condutor: 'Antonio Silva', uid: 'celVelho', status: 'fechada', data: '2026-10-26',
      veiculoId: 'v1', placa: 'GBI-2447', modelo: 'S-10', marca: 'GM', partida_km: '217700', retorno_km: '117789',
      partida_hora: '07:00', retorno_hora: '16:00', descricao: 'Roçada', itinerario: [], checklist: {},
    }]);
    db.close();
  });

  // Recarrega para o app observar o veículo já cadastrado
  await p.reload();

  // Primeiro acesso: RGF → entra
  await p.fill('#rgfNumero', '100'); await p.click('#btnRgfContinuar');
  try {
    await p.waitForSelector('#rgfNome', { timeout: 3000 });
    await p.fill('#rgfNome', 'Antonio Silva'); await p.fill('#rgfCargo', 'Motorista');
    await p.click('#btnRgfPedirAcesso');
  } catch (e) { /* já tem perfil, segue direto */ }

  await p.waitForSelector('#btnComecarDia', { timeout: 15000 });
  await p.click('#btnComecarDia');
  await p.waitForSelector('.veiculo[data-id="v1"]', { timeout: 10000 });
  await p.click('.veiculo[data-id="v1"]');
  ok(await p.inputValue('#csKm') === '117789', 'Saída veio com o km do último retorno (117789)');

  await b.close();
  console.log(falhas ? `FALHAS: ${falhas}` : 'TUDO OK');
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.log('ERRO', ((e.stack || '').match(/\w+\.cjs:\d+/) || [''])[0], e.message.split('\n')[0]); process.exit(1); });
