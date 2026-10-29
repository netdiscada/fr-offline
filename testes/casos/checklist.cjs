// X em "Após os serviços" não é defeito; defeito pode ficar sem descrição; local novo perdido é reenviado
const { chromium } = require('playwright');
const { acaoFr, IMPRIMIR, fecharVisor } = require('./ui.cjs');
const { initializeTestEnvironment } = require('@firebase/rules-unit-testing');
const { doc, setDoc, getDoc } = require('firebase/firestore');
let falhas = 0;
const ok = (c, msg) => { console.log(c ? 'OK  ' : 'FALHA', msg); if (!c) falhas++; };
(async () => {
  const env = await initializeTestEnvironment({ projectId: 'demo-fr', firestore: { host: '127.0.0.1', port: 8086, rules: require('fs').readFileSync(require('path').resolve(__dirname, '../../firestore.rules'), 'utf8') } });
  const adm = async fn => { let r; await env.withSecurityRulesDisabled(async c => { r = await fn(c.firestore()); }); return r; };
  const ler = c => adm(async db => { const s = await getDoc(doc(db, c)); return s.exists() ? s.data() : null; });
  const esperar = async (fn, ms = 20000) => { const fim = Date.now() + ms; let v; while (Date.now() < fim) { v = await fn(); if (v) return v; await new Promise(r => setTimeout(r, 250)); } return v; };
  await adm(async db => {
    await setDoc(doc(db, 'funcionarios/100'), { rgf: '100', nome: 'Antonio Silva', cargo: 'Motorista', uid: null, aprovado: true, visto: true });
    await setDoc(doc(db, 'veiculos/v1'), { placa: 'GBI-2447', modelo: 'S-10', marca: 'GM', ultimoKm: 1000, ativo: true,
      defeitosAbertos: [{ id: 'limp_externa', nome: 'Limpeza', descricao: '', desde: '2026-10-01' }] });
    await setDoc(doc(db, 'listas/locais'), { itens: { QUATINGA: { texto: 'Quatinga', n: 5 } } });
  });
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 400, height: 860 } });
  p.on('pageerror', e => console.log('pageerror', e.message));
  await p.goto('http://localhost:8090/');
  await p.fill('#rgfNumero', '100'); await p.click('#btnRgfContinuar'); await p.click('#btnRgfSouEu');
  await p.click('#btnComecarDia');
  await p.click('.veiculo');
  await p.click('#csComb button[data-valor="1/2"]');
  await p.click('#btnComecarAvancar');
  // Inspeção: Pneus com X, salvar sem escrever, e seguir
  await p.click('.item[data-id="pneus"] button[data-v="x"]');
  await p.waitForSelector('#clDefeito');
  await p.click('#folhaFormOk');
  ok(await p.isHidden('#folhaForm'), 'Defeito sem descrição: a caixa fecha mesmo vazia');
  ok((await p.textContent('.item[data-id="pneus"]')).includes('Sem descrição'), 'Item mostra "Sem descrição"');
  await p.click('#btnComecarAvancar');
  ok(await p.isVisible('#cdDescricao'), 'Continuou para o serviço sem descrever o defeito');
  await p.fill('#cdDescricao', 'Serviço');
  await p.click('#btnComecarAvancar');
  await p.waitForSelector('#btnIrEncerrar');
  // Saída: só "para onde"; km = o da saída da base, horário = agora
  await p.click('#btnSaida');
  await p.waitForSelector('#tela-parada:not([hidden])');
  ok(!(await p.$('#fsKm')) && await p.isHidden('#npHoraCampo') && (await p.innerText('.np-km')).includes('1 000'), 'Nova parada: veículo e km de agora, sem campo de km, horário escondido');
  await p.fill('#npBusca', 'Divisa');
  await p.waitForTimeout(300); await p.screenshot({ path: process.argv[2] + '/saida.png' });
  ok((await p.innerText('#npLista [data-i="0"]')).includes('Local novo'), 'Local digitado aparece como "Local novo: toque para sair"');
  await p.click('#npLista [data-i="0"]');
  let it = await p.evaluate(() => FR.estado.fr.itinerario[0]);
  ok(it.saida_km === '1000' && /^\d\d:\d\d$/.test(it.saida_hora), 'Saída gravou km 1000 (da base) e o horário de agora');
  // Chegada: horário digitado vira 11:07; relógio do sistema não aparece
  await p.click('#btnChegada');
  ok(await p.getAttribute('#fcHora', 'type') === 'tel' && await p.getAttribute('#fcKm', 'type') === 'tel', 'Horário e km com teclado de números do telefone (sem o relógio do Android)');
  await p.fill('#fcKm', '1012');
  await p.fill('#fcHora', '');
  await p.locator('#fcHora').pressSequentially('1107');
  ok(await p.inputValue('#fcHora') === '11:07', 'Digitar 1107 mostra 11:07');
  await p.click('#folhaFormOk');
  // Próxima saída: km = chegada anterior; mudar horário: 930 → 09:30
  await p.click('#btnSaida');
  ok((await p.innerText('#npLista [data-i="0"]')).includes('Última parada'), 'Lista começa pela última parada');
  await p.click('#npMudar');
  await p.fill('#npHora', '');
  await p.locator('#npHora').pressSequentially('930');
  await p.click('#npBusca');
  ok(await p.inputValue('#npHora') === '09:30' && (await p.innerText('#npHoraTxt')) === '09:30', 'Mudar horário: 930 vira 09:30 ao sair do campo');
  await p.click('#npLista .np-local:has(b:text-is("Divisa"))');
  it = await p.evaluate(() => FR.estado.fr.itinerario);
  ok(it[0].chegada_hora === '11:07' && it[1].saida_km === '1012' && it[1].saida_hora === '09:30' && it[1].local === 'Divisa', 'Segunda saída: km 1012 (chegada anterior), 09:30, Divisa');
  await p.click('#btnChegada'); await p.fill('#fcKm', '1005'); await p.click('#folhaFormOk');
  await p.waitForSelector('#folhaConfirma:not([hidden])');
  ok((await p.textContent('#confirmaTitulo')) === 'Verifique a quilometragem', 'Chegada com km menor que a saída da parada: bloqueia');
  await p.click('#confirmaSim');
  await p.fill('#fcKm', '1020'); await p.click('#folhaFormOk');
  await p.click('#btnIrEncerrar');
  ok(!(await p.evaluate(() => FR.estado.fr.checklist.limp_externa)), 'Limpeza com X da FR anterior NÃO volta como X (fica em branco)');
  ok(!(await p.evaluate(() => FR.estado.fr.checklist.abastecimento)), 'Após os serviços começa em branco (sem OK)');
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
  // Histórico: Abrir (visor), Imprimir e Compartilhar
  await p.waitForSelector('[data-ant="pdf"]');
  await p.click('[data-ant="pdf"] >> nth=0');
  await p.waitForSelector('#visorFolhas .visor-folha:nth-child(2) img', { timeout: 15000 });
  ok(await p.isVisible(IMPRIMIR) && await p.isVisible('#visorAcoes button:has-text("Baixar PDF")'), 'Histórico: abre o papel no visor, com Imprimir e Baixar PDF');
  await p.click('#visorFechar');
  const id = await p.evaluate(() => FR.estado.fr.id);
  const fr = await esperar(async () => { const f = await ler('frs/' + id); return f && f.status === 'fechada' && f; });
  ok(fr && fr.defeitosAbertos.map(d => d.id).join() === 'pneus', 'Defeitos da FR: só Pneus (abastecimento e limpeza não)');
  ok(fr && fr.checklist.abastecimento === 'x', 'O X do abastecimento continua na FR (papel)');
  const v = await esperar(async () => { const x = await ler('veiculos/v1'); return x.ultimoKm === 1040 && x; });
  ok(v && v.defeitosAbertos.map(d => d.id).join() === 'pneus', 'Veículo: defeito aberto só Pneus');
  // Local novo que se perdeu da fila: fica guardado no celular e é reenviado ao abrir
  await p.evaluate(() => localStorage.setItem('fr.locaisPendentes.v1', JSON.stringify({ 'RUA PERDIDA': 'Rua Perdida', QUATINGA: 'Quatinga' })));
  await p.reload();
  ok(await esperar(async () => { const l = (await ler('listas/locais')).itens; return l['RUA PERDIDA'] && l['RUA PERDIDA'].n === 1 && l.QUATINGA.n === 5; }), 'Local novo perdido reenviado ao abrir (e o que já estava lá não somou)');
  ok(await esperar(() => p.evaluate(() => localStorage.getItem('fr.locaisPendentes.v1') === '{}')), 'Lista de pendentes limpa');
  // ADM vê o aviso
  await b.close(); await env.cleanup();
  console.log(falhas ? `FALHAS: ${falhas}` : 'TUDO OK');
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.log('ERRO', ((e.stack || '').match(/\w+\.cjs:\d+/) || [''])[0], e.message.split('\n').slice(0, 4).join(' | ')); process.exit(1); });
