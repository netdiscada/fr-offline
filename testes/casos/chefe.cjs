const { chromium } = require('playwright');
const { acaoFr, IMPRIMIR, fecharVisor } = require('./ui.cjs');
const { initializeTestEnvironment } = require('@firebase/rules-unit-testing');
const { doc, setDoc, getDoc, getDocs, collection, Timestamp } = require('firebase/firestore');
const URL = 'http://localhost:8090/';
let falhas = 0;
const ok = (c, msg) => { console.log(c ? 'OK  ' : 'FALHA', msg); if (!c) falhas++; };
const dois = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`;
const HOJE = iso(new Date()), ONTEM = iso(new Date(Date.now() - 86400000));
const SHOTS = process.argv[2];

(async () => {
  const env = await initializeTestEnvironment({ projectId: 'demo-fr', firestore: { host: '127.0.0.1', port: 8086, rules: require('fs').readFileSync(require('path').resolve(__dirname, '../../firestore.rules'), 'utf8') } });
  const adm = async fn => { let r; await env.withSecurityRulesDisabled(async c => { r = await fn(c.firestore()); }); return r; };
  // O SDK do teste às vezes diz "offline" logo no começo: tenta de novo
  const ler = async caminho => { for (let i = 0; ; i++) { try { return await adm(async db => { const s = await getDoc(doc(db, caminho)); return s.exists() ? s.data() : null; }); } catch (e) { if (i > 4 || !/offline/.test(e.message)) throw e; await new Promise(r => setTimeout(r, 500)); } } };
  const conta = await (await fetch('http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'adm@fr.test', password: 'senha123', returnSecureToken: true }) })).json();
  await adm(async db => {
    await setDoc(doc(db, 'admins/' + conta.localId), {});
    await setDoc(doc(db, 'funcionarios/900'), { rgf: '900', nome: 'Carlos Mendes', cargo: 'Encarregado', uid: null, aprovado: true, visto: true, papel: 'chefe' });
    await setDoc(doc(db, 'funcionarios/100'), { rgf: '100', nome: 'Antonio Silva', cargo: 'Motorista', uid: null, aprovado: true, visto: true });
    await setDoc(doc(db, 'funcionarios/200'), { rgf: '200', nome: 'Bruno Souza', cargo: 'Motorista', uid: null, aprovado: true, visto: true });
    await setDoc(doc(db, 'funcionarios/300'), { rgf: '300', nome: 'José Pereira', cargo: 'Operador', uid: null, aprovado: true, visto: true });
    await setDoc(doc(db, 'veiculos/v1'), { placa: 'GBI-2447', modelo: 'S-10', marca: 'GM', numero: '7', ultimoKm: 217551, ativo: true });
    await setDoc(doc(db, 'veiculos/v2'), { placa: 'XYZ-9999', modelo: 'Uno', marca: 'Fiat', numero: '9', ultimoKm: 88102, ultimoCombustivel: '3/4', ativo: true });
    await setDoc(doc(db, 'veiculos/v3'), { placa: 'ABC-1234', modelo: 'Gol', marca: 'VW', numero: '3', ultimoKm: 58000, ativo: true });
    // Preparada de ontem que o papel não voltou; FR encerrada de 40 dias atrás
    await setDoc(doc(db, 'frs/ontem'), { rgf: '300', condutor: 'José Pereira', uid: 'outro', status: 'preparada', data: ONTEM, veiculoId: 'v3', placa: 'ABC-1234', modelo: 'Gol', marca: 'VW', itinerario: [], checklist: {}, preparadaPor: { rgf: '900', nome: 'Carlos Mendes' }, criadoEm: Timestamp.now() });
    await setDoc(doc(db, 'frs/canc'), { rgf: '200', condutor: 'Bruno Souza', uid: 'outro', status: 'cancelada', data: HOJE, itinerario: [], criadoEm: Timestamp.now() });
    await setDoc(doc(db, 'frs/velha'), { rgf: '200', condutor: 'Bruno Souza', uid: 'outro', status: 'fechada', data: '2026-09-01', itinerario: [], criadoEm: Timestamp.fromMillis(Date.now() - 40 * 86400000) });
  });
  const b = await chromium.launch();
  const celular = async (nome, largura = 400) => {
    const ctx = await b.newContext({ viewport: { width: largura, height: 860 } });
    const p = await ctx.newPage();
    p.on('pageerror', e => console.log(`[${nome}] pageerror`, e.message));
    p.on('console', m => { if (m.type() === 'error' || /\[(FR|db|chefe)\]/.test(m.text())) console.log(`[${nome}] console`, m.text().slice(0, 200)); });
    await p.goto(URL);
    return p;
  };
  const entrar = async (p, rgf, alvo) => {
    await p.waitForSelector('#rgfNumero');
    await p.fill('#rgfNumero', rgf);
    await p.click('#btnRgfContinuar');
    await p.click('#btnRgfSouEu');
    await p.waitForSelector(alvo || '#btnComecarDia');
  };
  const esperar = async (fn, ms = 20000) => { const fim = Date.now() + ms; let v; while (Date.now() < fim) { v = await fn(); if (v) return v; await new Promise(r => setTimeout(r, 250)); } return v; };

  // Chefe entra: abre direto no painel da equipe
  const C = await celular('chefe');
  await entrar(C, '900', '#btnPreparar');
  ok(true, 'Chefe entrou e viu o painel da equipe');
  const uidC = await C.evaluate(() => firebase.auth().currentUser.uid);
  ok(await esperar(async () => !!(await ler('chefes/' + uidC))), 'Celular do chefe registrado em chefes/');
  ok(await esperar(async () => (await ler('frs/ontem')).status === 'fechada'), 'Preparada de ontem fechou sozinha');
  ok((await ler('frs/ontem')).fechadaAuto === true, '... marcada como fechadaAuto');
  ok(await esperar(async () => !(await ler('frs/velha'))), 'FR encerrada com mais de 30 dias foi apagada');
  ok(await esperar(async () => !(await ler('frs/canc'))), 'FR cancelada (teste antigo) foi apagada');

  const A = await celular('Antonio');
  await entrar(A, '100');

  // Chefe prepara a FR do Antônio (usa o app)
  await C.click('#btnPreparar');
  await C.waitForSelector('[data-func="100"]');
  ok((await C.textContent('[data-func="300"]')).includes('Só papel'), 'José aparece como "Só papel"');
  await C.click('[data-func="100"]');
  await C.click('.veiculo[data-id="v1"]');
  await C.fill('#ppDescricao', 'Pintura de guias na Regional Divisa');
  ok(await C.inputValue('#ppKm') === '217551', 'Km de saída já vem com o último registro do veículo');
  await C.fill('#ppKm', '217560');
  ok(await C.isHidden('#btnPrepararSo') && (await C.textContent('#btnPrepararAvancar')) === 'Salvar e enviar', 'Funcionário do app: só "Salvar e enviar" (sem imprimir)');
  if (SHOTS) await C.screenshot({ path: SHOTS + '/chefe-preenchido.png' });
  await C.click('#btnPrepararAvancar');
  await C.waitForSelector('text=Aguardando Antonio');
  ok(true, 'FR preparada aparece "Aguardando Antonio" no painel');
  if (SHOTS) await C.screenshot({ path: SHOTS + '/chefe-painel.png', fullPage: true });

  // Antônio recebe e começa
  await A.waitForSelector('[data-comecar-prep]');
  ok((await A.textContent('.preparada-cartao')).includes('Carlos preparou sua FR'), 'Antônio vê "Carlos preparou sua FR"');
  if (SHOTS) await A.screenshot({ path: SHOTS + '/func-preparada.png' });
  await A.click('[data-comecar-prep]');
  await A.waitForSelector('#csKm');
  ok(await A.inputValue('#csKm') === '217560', 'Saída já vem com o km que o chefe colocou');
  await A.click('#csComb button[data-valor="1/2"]');
  await A.click('#btnComecarAvancar');
  await A.click('#btnComecarAvancar');
  ok(await A.inputValue('#cdDescricao') === 'Pintura de guias na Regional Divisa', 'Serviço já vem preenchido pelo chefe');
  await A.click('#btnComecarAvancar');
  await A.waitForSelector('#btnSaida');
  const idA = await A.evaluate(() => FR.estado.fr.id);
  const uidA = await A.evaluate(() => firebase.auth().currentUser.uid);
  const frA = await esperar(async () => { const d = await ler('frs/' + idA); return d && d.status === 'aberta' && d; });
  ok(frA && frA.uid === uidA && frA.preparadaPor.rgf === '900' && frA.combustivel === '1/2', 'No banco: FR aberta, dona = celular do Antônio, preparada pelo chefe');
  await C.waitForSelector(`[data-fr="${idA}"] .status-servico`);
  ok(true, 'Painel do chefe mostra "Em serviço"');

  // Chefe só vê a saída da FR em serviço: sem km atual, sem paradas, sem imprimir/editar
  const cartao = await C.textContent(`[data-fr="${idA}"]`);
  ok(cartao.includes('Saída') && cartao.includes('217 560') && !/\d+ paradas?/.test(cartao), 'Cartão em serviço: só saída (horário e km)');
  ok(!(await C.$(`[data-fr="${idA}"] [data-acao="imprimir"]`)) && !(await C.$(`[data-fr="${idA}"] [data-acao="editar"]`)), 'Chefe NÃO imprime nem abre a FR em serviço no app');

  // Chefe prepara a do José (só papel), com combustível, e imprime
  await C.click('#btnPreparar');
  await C.click('[data-func="300"]');
  await C.click('.veiculo[data-id="v2"]');
  await C.fill('#ppDescricao', 'Roçada no Parque Quatinga');
  ok((await C.textContent('#preparar')).includes('não usa o app'), 'Aviso de que José não usa o app');
  await C.click('#ppKmUltimo');
  await C.click('#btnPrepararAvancar');
  await C.waitForSelector(IMPRIMIR);
  await C.click(IMPRIMIR);
  await C.waitForSelector('#guiaNaoMostrar');
  await C.check('#guiaNaoMostrar');
  await C.evaluate(() => { window.print = () => { window.__impresso = (window.__impresso || 0) + 1; }; });
  await C.click('#folhaFormOk');
  const idJ = await esperar(() => C.evaluate(() => { const c = document.querySelector('[data-fr] .status-papel'); return c && c.closest('[data-fr]').dataset.fr; }));
  ok(!!idJ, 'FR do José aparece "No papel"');
  const frJ = await esperar(async () => { const d = await ler('frs/' + idJ); return d && d.impressaEm && d; });
  ok(frJ && frJ.combustivel === '' && frJ.partida_hora === '' && frJ.partida_km === '88102' && frJ.uid !== uidA, 'FR do José: km de saída (Usar este), combustível e horário em branco, marcada como impressa');
  ok(await C.evaluate(() => window.__impresso === 1), 'Foi para a impressora');
  await fecharVisor(C);

  // Papel voltou: chefe anota o km
  await C.click(`[data-fr="${idJ}"] [data-acao="papel"]`);
  await C.fill('#rpRetorno', '88160');
  await C.click('#folhaFormOk');
  const v2 = await esperar(async () => { const v = await ler('veiculos/v2'); return v.ultimoKm === 88160 && v; });
  ok(!!v2 && v2.ultimoRgf === '300', 'Veículo do José ficou com 88160 km');
  ok((await ler('frs/' + idJ)).status === 'fechada', 'FR do José encerrada');
  await C.waitForSelector(`[data-fr="${idJ}"] .status-final`);
  ok(true, 'FR do José foi para "Finalizadas hoje"');
  // Ver PDF dentro do app (as 2 folhas) e editar a FR encerrada
  await C.click(`[data-fr="${idJ}"] [data-acao="pdf"]`);
  await C.waitForSelector('#visorFolhas .visor-folha:nth-child(2) img', { timeout: 20000 });
  ok(await C.$$eval('#visorFolhas img', l => l.length) === 2, 'Ver PDF: visor dentro do app com frente e verso');
  ok(await C.$eval('#visorFolhas img', i => i.naturalWidth >= 790), 'Visor nítido para a tela (no mínimo 96 dpi)');
  await C.dblclick('#visorFolhas .visor-folha img');
  ok(await C.$eval('#visorFolhas', c => c.classList.contains('ampliado')), 'Toque duplo amplia a FR');
  await C.dblclick('#visorFolhas .visor-folha img');
  ok(await C.$eval('#visorFolhas', c => !c.classList.contains('ampliado')), 'Toque duplo volta ao tamanho normal');
  ok(await C.evaluate(() => document.body.classList.contains('travado')), 'Com o visor aberto, a página de trás não rola');
  if (SHOTS) await C.screenshot({ path: SHOTS + '/visor.png' });
  await C.click('#visorAcoes [data-visor="0"]');
  await C.waitForSelector('#btnFichaSalvar:visible');
  await C.click('[data-secao="servico"] .cartao-cab');
  await C.fill('textarea[name="descricao"]', 'Roçada corrigida pelo chefe');
  await C.click('#btnFichaSalvar');
  await C.waitForSelector('#btnPreparar');
  ok(await esperar(async () => (await ler('frs/' + idJ)).descricao === 'Roçada corrigida pelo chefe'), 'Chefe corrigiu a FR encerrada');

  // Imprimir FRs do dia: a já impressa vem desmarcada
  await C.click('#btnImprimirDia');
  await C.waitForSelector('[data-marcar]');
  const todas = await C.$$eval('[data-marcar]', l => l.map(x => x.dataset.marcar));
  const marcadas = await C.$$eval('[data-marcar].on', l => l.map(x => x.dataset.marcar));
  ok(!todas.includes(idA) && todas.includes(idJ) && !marcadas.includes(idJ), 'Imprimir do dia: a do Antônio (em serviço) não aparece; a do José (já impressa) desmarcada');
  ok(await C.evaluate(() => document.getElementById('impressao').querySelectorAll('img').length === 2), 'Impressão com as 2 páginas da FR');
  await C.click('#folhaForm .btn-texto[data-fechar]');

  // Antônio recebe outra preparada e passa para o Bruno
  const B = await celular('Bruno');
  await entrar(B, '200');
  await C.click('#btnPreparar');
  await C.click('[data-func="100"]');
  await C.click('#btnConfirmaSim, #confirmaSim').catch(() => {});
  await C.waitForSelector('.veiculo[data-id="v3"]');
  await C.click('.veiculo[data-id="v3"]');
  await C.fill('#ppDescricao', 'Tapa-buraco Jundiapeba');
  await C.click('#btnPrepararAvancar');
  ok(true, 'Chefe preparou a segunda FR do Antônio (ele já tinha uma)');
  // Antônio cancela a dele primeiro para ver a nova
  await A.evaluate(() => { document.querySelectorAll('.folha').forEach(f => { f.hidden = true; }); });
  await A.click('#btnCancelarFr');
  await A.click('#confirmaSim');
  await A.waitForSelector('[data-passar-prep]');
  await A.click('[data-passar-prep]');
  await A.fill('#ppRgf', '200');
  await A.click('#folhaFormOk');
  await A.click('#confirmaSim');
  await B.waitForSelector('[data-comecar-prep]');
  ok((await B.textContent('.preparada-cartao')).includes('Gol'), 'Antônio passou a FR preparada para o Bruno');
  ok(await esperar(async () => !(await A.$('[data-passar-prep]'))), 'Sumiu do celular do Antônio');

  // Bruno começa; chefe cancela: some do celular do Bruno
  await B.click('[data-comecar-prep]');
  await B.click('#csComb button[data-valor="cheio"]');
  await B.click('#btnComecarAvancar'); await B.click('#btnComecarAvancar'); await B.click('#btnComecarAvancar');
  await B.waitForSelector('#btnSaida');
  const idB = await B.evaluate(() => FR.estado.fr.id);
  await C.waitForSelector(`[data-fr="${idB}"] .status-servico`);
  await C.click(`[data-fr="${idB}"] [data-acao="cancelar"]`);
  await C.click('#confirmaSim');
  await B.waitForSelector('#btnComecarDia', { timeout: 10000 });
  ok(true, 'Chefe cancelou: a FR saiu do celular do Bruno');
  ok(await esperar(async () => !(await ler('frs/' + idB))), 'Cancelada não fica no banco (o celular do Bruno apagou)');
  // Chefe cancela uma preparada: some na hora
  await C.click('#btnPreparar');
  await C.click('[data-func="300"]');
  await C.click('.veiculo[data-id="v2"]');
  await C.fill('#ppDescricao', 'Cancelar depois');
  await C.click('#btnPrepararSo');
  const idX = await esperar(() => C.evaluate(() => { const c = [...document.querySelectorAll('[data-fr]')].find(x => x.textContent.includes('José') && !x.querySelector('.status-final')); return c && c.dataset.fr; }));
  await acaoFr(C, idX, 'cancelar');
  await C.click('#confirmaSim');
  ok(await esperar(async () => !(await ler('frs/' + idX))), 'Preparada cancelada pelo chefe: apagada');

  ok(!(await C.$('[data-alternar]')), 'Chefe não tem "Meu dia" (só a equipe)');
  await C.waitForSelector('#btnAnteriores');
  await C.click('#btnAnteriores');
  await C.waitForSelector('[data-fr="ontem"]');
  await C.goBack();
  await C.waitForSelector('#btnPreparar');
  ok(!(await C.$('[data-fr="ontem"]')), 'Voltar do Android: dos dias anteriores volta para hoje');
  await C.click('#btnAnteriores');
  await C.waitForSelector('[data-fr="ontem"]');
  ok((await C.textContent('[data-fr="ontem"]')).toLowerCase().includes('fechou sozinha'), 'Dias anteriores: a de ontem "fechou sozinha"');
  await acaoFr(C, 'ontem', 'papel');
  await C.fill('#rpRetorno', '58040');
  await C.click('#folhaFormOk');
  ok(await esperar(async () => (await ler('veiculos/v3')).ultimoKm === 58040), 'Anotar km na FR de ontem atualizou o veículo');
  if (SHOTS) await C.screenshot({ path: SHOTS + '/chefe-anteriores.png', fullPage: true });

  // PC: painel largo e prévia do papel
  const P = await celular('chefe-pc', 1440);
  await P.evaluate(() => { localStorage.clear(); });
  await P.close();

  // ADM: marcar chefe e Frota
  const D = await celular('adm');
  await D.click('#btnRgfAdm');
  await D.fill('#admEmail', 'adm@fr.test'); await D.fill('#admSenha', 'senha123');
  await D.click('#btnAdmEntrar');
  await D.waitForSelector('.frota-item');
  ok(await D.isVisible('[data-acao="novo-veiculo"]'), 'ADM abre na aba Frota (com o cadastro de veículos)');
  if (SHOTS) await D.screenshot({ path: SHOTS + '/adm-frota.png', fullPage: true });
  await D.click('.frota-item[data-frota="v1"]');
  await D.waitForSelector('#folhaForm:not([hidden])');
  await D.click('#folhaFormOk');
  await D.click('[data-aba="funcionarios"]');
  await D.click('[data-pessoa="200"]'); await D.click('#acoesLista button:has-text("Editar")');
  await D.check('[data-c="chefe"]');
  await D.click('#folhaFormOk');
  ok(await esperar(async () => (await ler('funcionarios/200')).papel === 'chefe'), 'ADM marcou Bruno como chefe');
  await B.waitForSelector('#btnPreparar', { timeout: 10000 });
  ok(true, 'Celular do Bruno virou chefe na hora');
  ok((await D.textContent('[data-pessoa="900"]')).includes('Chefe'), 'Lista da equipe mostra o selo Chefe');

  await b.close(); await env.cleanup();
  console.log(falhas ? `FALHAS: ${falhas}` : 'TUDO OK');
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.log('ERRO', ((e.stack || '').match(/\w+\.cjs:\d+/) || [''])[0], e.message.split('\n').slice(0, 6).join(' | ')); process.exit(1); });
