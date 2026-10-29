// X em "Após os serviços" não é defeito; defeito pode ficar sem descrição; local novo perdido é reenviado.
// Testa as regras de checklist (sem servidor: dados via IndexedDB).
const { chromium } = require('playwright');
const URL = process.env.FR_URL || 'http://localhost:8090/';
let falhas = 0;
const ok = (c, msg) => { console.log(c ? 'OK  ' : 'FALHA', msg); if (!c) falhas++; };
const esperar = async (fn, ms = 20000) => { const fim = Date.now() + ms; let v; while (Date.now() < fim) { v = await fn(); if (v) return v; await new Promise(r => setTimeout(r, 250)); } return v; };
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 400, height: 860 } });
  const p = await ctx.newPage();
  p.on('pageerror', e => console.log('pageerror', e.message));

  // Cadastra veículo e defeito aberto no IndexedDB
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
    await gravar('veiculos', [{ id: 'v1', placa: 'GBI-2447', modelo: 'S-10', marca: 'GM', numero: '12', ultimoKm: 1000, ativo: true,
      defeitosAbertos: [{ id: 'limp_externa', nome: 'Limpeza', descricao: '', desde: '2026-10-01' }] }]);
    await gravar('locais', [{ chave: 'QUATINGA', texto: 'Quatinga', n: 5 }]);
    db.close();
  });
  await p.reload();

  // Primeiro acesso: RGF → entra (criar perfil se necessário)
  await p.fill('#rgfNumero', '100'); await p.click('#btnRgfContinuar');
  try {
    await p.waitForSelector('#rgfNome', { timeout: 3000 });
    await p.fill('#rgfNome', 'Antonio Silva'); await p.fill('#rgfCargo', 'Motorista');
    await p.click('#btnRgfPedirAcesso');
  } catch (e) { /* já tem perfil */ }

  await p.waitForSelector('#btnComecarDia', { timeout: 15000 });
  await p.click('#btnComecarDia');
  await p.click('.veiculo');
  await p.click('#csComb button[data-valor="1/2"]');
  await p.click('#btnComecarAvancar');
  // Inspeção: Pneus com X, salvar sem escrever, seguir
  await p.click('.item[data-id=\'pneus\'] button[data-v="x"]');
  await p.waitForSelector('#clDefeito');
  await p.click('#folhaFormOk');
  ok(await p.isHidden('#folhaForm'), 'Defeito sem descrição: a caixa fecha mesmo vazia');
  ok((await p.textContent('.item[data-id="pneus"]')).includes('Sem descrição'), 'Item mostra "Sem descrição"');
  await p.click('#btnComecarAvancar');
  // A troca de passo tem animação: espera o campo de serviço aparecer
  await p.waitForSelector('#cdDescricao', { state: 'visible', timeout: 10000 });
  ok(await p.isVisible('#cdDescricao'), 'Continuou para o serviço sem descrever o defeito');
  await p.fill('#cdDescricao', 'Serviço'); await p.click('#btnComecarAvancar');
  await p.waitForSelector('#btnIrEncerrar');

  // Saída: km = o da saída da base
  await p.click('#btnSaida');
  await p.fill('#npBusca', 'Divisa'); await p.waitForTimeout(300);
  await p.click('#npLista [data-i="0"]');
  await p.click('#btnChegada'); await p.fill('#fcKm', '1012'); await p.click('#folhaFormOk');

  // Segunda saída: km = chegada anterior; mudar horário
  await p.click('#btnSaida');
  await p.click('#npMudar'); await p.fill('#npHora', '');
  await p.locator('#npHora').pressSequentially('930');
  await p.click('#npBusca');
  ok(await p.inputValue('#npHora') === '09:30' && (await p.innerText('#npHoraTxt')) === '09:30', 'Mudar horário: 930 vira 09:30');
  await p.click('#npLista .np-local:has(b:text-is("Divisa"))');
  const it = await p.evaluate(() => FR.estado.fr.itinerario);
  ok(it[1].saida_km === '1012' && it[1].saida_hora === '09:30' && it[1].local === 'Divisa', 'Segunda saída: km 1012, 09:30, Divisa');

  // Chegada com km menor que saída da parada: bloqueia
  await p.click('#btnChegada'); await p.fill('#fcKm', '999'); await p.click('#folhaFormOk');
  await p.waitForSelector('#folhaConfirma:not([hidden])');
  ok((await p.textContent('#confirmaTitulo')) === 'Verifique a quilometragem', 'Chegada com km menor que saída: bloqueia');
  await p.click('#confirmaSim');
  await p.fill('#fcKm', '1020'); await p.click('#folhaFormOk');
  await p.click('#btnIrEncerrar');

  ok(!(await p.evaluate(() => FR.estado.fr.checklist.limp_externa)), 'Limpeza com X da FR anterior NÃO volta como X (fica em branco)');
  ok(!(await p.evaluate(() => FR.estado.fr.checklist.abastecimento)), 'Após os serviços começa em branco (sem OK)');
  await p.waitForSelector('#ceChecklist .item[data-id="abastecimento"]', { timeout: 10000 });
  ok(await p.$$eval('#ceChecklist .item[data-id="abastecimento"] button', l => l.map(b => b.textContent).join()) === 'X', 'Após os serviços: só o botão X');
  ok(!(await p.isVisible('#ceChecklist .item[data-id="abastecimento"] button[data-v="ok"]')), '... sem o OK');

  await p.click('#ceChecklist .item[data-id="abastecimento"] button[data-v="x"]');
  await p.waitForTimeout(400);
  ok(await p.isHidden('#folhaForm'), 'X em "Abastecimento do Tanque" não abre a caixa de defeito');
  ok(!(await p.textContent('#ceChecklist .item[data-id="abastecimento"]')).includes('descri'), '... e não pede descrição');

  await p.click('#ceChecklist .item[data-id="limp_externa"] button[data-v="x"]');
  await p.waitForTimeout(300);
  ok(await p.isHidden('#folhaForm'), 'X em "Limpeza externa" não abre a caixa de defeito');
  await p.click('#ceChecklist .item[data-id="limp_externa"] button[data-v="x"]');
  ok(!(await p.evaluate(() => FR.estado.fr.checklist.limp_externa)), 'Tocar no X de novo desmarca');
  await p.click('#ceChecklist .item[data-id="limp_externa"] button[data-v="x"]');

  // Km de retorno menor que a saída: bloqueia com o aviso explicativo
  await p.fill('#ceKm', '999');
  await p.click('#btnEncerrar');
  await p.waitForSelector('#folhaConfirma:not([hidden])');
  ok((await p.textContent('#confirmaTitulo')) === 'Verifique a quilometragem' && /só aumenta/.test(await p.textContent('#confirmaTexto')) && await p.isHidden('#folhaConfirma .btn-texto[data-fechar]'), 'Km de retorno menor: aviso "Verifique a quilometragem", sem opção de seguir');
  await p.click('#confirmaSim');
  ok(await p.isVisible('#tela-encerrar') && await p.isHidden('#visorFolhas .visor-folha'), '... e continua na tela de encerrar');
  await p.fill('#ceKm', '1040');
  await p.click('#btnEncerrar');
  await p.waitForSelector('#visorFolhas .visor-folha:nth-child(2) img', { timeout: 15000 });
  ok((await p.$$eval('#visorAcoes button', l => l.map(b => b.textContent))).join() === 'Editar,Salvar', 'Encerrar: visor da FR com Editar e Salvar');
  await p.click('#visorAcoes [data-visor="0"]');
  ok(await p.isVisible('#tela-encerrar') && await p.evaluate(() => FR.estado.fr.status === 'aberta'), 'Editar volta para a tela de encerrar (nada salvo ainda)');
  await p.click('#btnEncerrar');
  await p.waitForSelector('#visorAcoes [data-visor="1"]', { timeout: 15000 });
  await p.click('#visorAcoes [data-visor="1"]');
  await p.waitForSelector('#tela-inicio:not([hidden])');
  ok(await p.isHidden('#visorFechar'), 'Salvar: volta para a tela inicial, sem a tela de imprimir');

  await b.close();
  console.log(falhas ? `FALHAS: ${falhas}` : 'TUDO OK');
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.log('ERRO', ((e.stack || '').match(/\w+\.cjs:\d+/) || [''])[0], e.message.split('\n').slice(0, 4).join(' | ')); process.exit(1); });
