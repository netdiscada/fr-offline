// FRs anteriores do funcionário (corrigir) e botão Salvar na correção do ADM
const { chromium } = require('playwright');
const { acaoFr, IMPRIMIR, fecharVisor } = require('./ui.cjs');
const { initializeTestEnvironment } = require('@firebase/rules-unit-testing');
const { doc, setDoc, getDoc } = require('firebase/firestore');
let falhas = 0;
const ok = (c, msg) => { console.log(c ? 'OK  ' : 'FALHA', msg); if (!c) falhas++; };
const dois = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`;
const ONTEM = iso(new Date(Date.now() - 86400000));
(async () => {
  const env = await initializeTestEnvironment({ projectId: 'demo-fr', firestore: { host: '127.0.0.1', port: 8086, rules: require('fs').readFileSync(require('path').resolve(__dirname, '../../firestore.rules'), 'utf8') } });
  const adm = async fn => { let r; await env.withSecurityRulesDisabled(async c => { r = await fn(c.firestore()); }); return r; };
  const ler = c => adm(async db => { const s = await getDoc(doc(db, c)); return s.exists() ? s.data() : null; });
  const esperar = async (fn, ms = 20000) => { const fim = Date.now() + ms; let v; while (Date.now() < fim) { v = await fn(); if (v) return v; await new Promise(r => setTimeout(r, 250)); } return v; };
  const conta = await (await fetch('http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'adm@fr.test', password: 'senha123', returnSecureToken: true }) })).json();
  await adm(async db => {
    await setDoc(doc(db, 'admins/' + conta.localId), {});
    await setDoc(doc(db, 'funcionarios/900'), { rgf: '900', nome: 'Carlos Mendes', cargo: 'Encarregado', uid: null, aprovado: true, visto: true, papel: 'chefe' });
    await setDoc(doc(db, 'funcionarios/100'), { rgf: '100', nome: 'Antonio Silva', cargo: 'Motorista', uid: null, aprovado: true, visto: true });
    await setDoc(doc(db, 'veiculos/v1'), { placa: 'GBI-2447', modelo: 'S-10', marca: 'GM', ultimoKm: 1050, ultimaFrId: 'f1', ultimoRgf: '100', ativo: true });
    await setDoc(doc(db, 'frs/f1'), { rgf: '100', condutor: 'Antonio Silva', cargo: 'Motorista', uid: 'celVelho', status: 'fechada', data: ONTEM, veiculoId: 'v1', placa: 'GBI-2447', modelo: 'S-10', marca: 'GM',
      partida_km: '1000', retorno_km: '1050', descricao: 'Errado', itinerario: [{ local: 'Divisa', saida_km: '1000', saida_hora: '08:00', chegada_km: '1020', chegada_hora: '08:30' }], checklist: {} });
  });
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 400, height: 860 } });
  p.on('pageerror', e => console.log('pageerror', e.message));
  await p.goto('http://localhost:8090/');
  await p.fill('#rgfNumero', '100'); await p.click('#btnRgfContinuar'); await p.click('#btnRgfSouEu');
  await p.waitForSelector('[data-anterior="f1"]');
  ok(true, 'Funcionário vê "Minhas FRs anteriores" com a FR de ontem');
  // Banco lento/sem resposta ao abrir: a lista guardada no celular aparece na hora, com os botões
  await p.route(/:(8086|9098)\//, r => new Promise(() => {})); // pedidos ao banco ficam pendurados
  await p.reload();
  const t0 = Date.now();
  await p.waitForSelector('[data-anterior="f1"] [data-ant="corrigir"]', { timeout: 3000 }).catch(() => {});
  ok(Date.now() - t0 < 3000 && await p.isVisible('[data-anterior="f1"] [data-ant="corrigir"]'), 'Banco lento: FRs anteriores aparecem na hora (guardadas no celular), com Ver PDF/Corrigir/Apagar');
  ok(!(await p.$('#btnPdfAnterior')), '... sem o cartão provisório "Abrir o PDF de novo"');
  await p.unroute(/:(8086|9098)\//);
  await p.reload();
  await p.waitForSelector('[data-anterior="f1"]');
  await p.screenshot({ path: process.argv[2] + '/anteriores.png' });
  // Botão voltar do Android (site): fecha a janela e volta a tela, sem sair do app
  await p.click('#btnMenu:visible, #btnMenuOla:visible');
  await p.goBack();
  ok(await p.isHidden('#folhaMenu') && p.url().startsWith('http://localhost:8090'), 'Voltar fecha o menu e continua no app');
  await p.click('[data-anterior="f1"] [data-ant="corrigir"]');
  await p.waitForSelector('#tela-ficha:not([hidden])');
  await p.goBack();
  await p.waitForSelector('#tela-inicio:not([hidden])');
  ok(p.url().startsWith('http://localhost:8090'), 'Voltar da ficha volta para o início');
  await p.click('[data-anterior="f1"] [data-ant="corrigir"]');
  await p.waitForSelector('#tela-ficha:not([hidden])');
  ok(await p.isVisible('#btnFichaSalvar'), 'Ficha de correção tem o botão Salvar');
  ok(await p.isHidden('[data-secao="veiculo"]'), 'Funcionário não vê/edita os dados do veículo na ficha');
  await p.click('[data-secao="retorno"] .cartao-cab');
  await p.fill('input[name="retorno_km"]', '1060');
  await p.click('#btnFichaSalvar');
  await p.waitForSelector('#tela-inicio:not([hidden])');
  const uid = await p.evaluate(() => firebase.auth().currentUser.uid);
  const f1 = await esperar(async () => { const f = await ler('frs/f1'); return f.retorno_km === '1060' && f; });
  ok(f1 && f1.uid === uid, 'Correção do funcionário gravada (FR de outro celular: este assumiu)');
  ok(await esperar(async () => (await ler('veiculos/v1')).ultimoKm === 1060), 'Km do veículo corrigido (era a última FR dele)');

  // ADM corrige: botão Salvar e PDF gravam
  const D = await b.newPage({ viewport: { width: 400, height: 860 } });
  D.on('pageerror', e => console.log('[adm] pageerror', e.message));
  await D.goto('http://localhost:8090/');
  await D.click('#btnRgfAdm');
  await D.fill('#admEmail', 'adm@fr.test'); await D.fill('#admSenha', 'senha123');
  await D.click('#btnAdmEntrar');
  await D.click('[data-aba="frs"]');
  await acaoFr(D, 'f1', 'editar');
  await D.waitForSelector('#btnFichaSalvar:visible');
  ok(await D.isVisible('[data-secao="veiculo"]') && !(await D.$('input[name="numero"]')), 'ADM corrige o veículo (sem campo "Número")');
  await D.click('[data-secao="servico"] .cartao-cab');
  await D.fill('textarea[name="descricao"]', 'Certo pelo ADM');
  await D.click('#btnFichaPdf');
  ok(await esperar(async () => (await ler('frs/f1')).descricao === 'Certo pelo ADM'), 'ADM: "Gerar PDF" grava a correção antes');
  await D.waitForSelector('#visorFechar:visible');
  await D.click('#visorFechar');
  await D.fill('textarea[name="descricao"]', 'Certo pelo ADM 2');
  await D.click('#btnFichaSalvar');
  await D.waitForSelector('#tela-adm:not([hidden])');
  ok(await esperar(async () => (await ler('frs/f1')).descricao === 'Certo pelo ADM 2'), 'ADM: botão Salvar grava e volta para a lista');
  // O funcionário vê a versão corrigida
  await p.reload();
  await p.waitForSelector('[data-anterior="f1"]');
  ok(await esperar(() => p.evaluate(() => (FR.minhasFrs || []).some(f => f.descricao === 'Certo pelo ADM 2'))), 'Funcionário pega a correção do ADM (PDF sai certo)');
  // Funcionário apaga uma FR anterior (de teste)
  await adm(async db => { await setDoc(doc(db, 'frs/teste'), { rgf: '100', condutor: 'Antonio Silva', uid: 'celVelho', status: 'fechada', data: ONTEM, placa: 'TES-0000', modelo: 'Teste', itinerario: [], checklist: {} }); });
  await p.evaluate(() => { document.querySelectorAll('.folha').forEach(f => { f.hidden = true; }); });
  await p.reload();
  await p.waitForSelector('[data-anterior="teste"] [data-ant="apagar"]');
  await p.click('[data-anterior="teste"] [data-ant="apagar"]');
  await p.click('#confirmaSim');
  ok(await esperar(async () => !(await ler('frs/teste'))), 'Funcionário apagou a FR de teste (feita em outro celular)');
  ok(!(await p.$('[data-anterior="teste"]')), 'Sumiu da lista');
  // Chefe libera de novo a FR encerrada: volta para o celular do funcionário
  const C = await b.newPage({ viewport: { width: 400, height: 860 } });
  C.on('pageerror', e => console.log('[chefe] pageerror', e.message));
  await C.goto('http://localhost:8090/');
  await C.fill('#rgfNumero', '900'); await C.click('#btnRgfContinuar'); await C.click('#btnRgfSouEu');
  await C.waitForSelector('#btnAnteriores');
  await C.click('#btnAnteriores');
  await acaoFr(C, 'f1', 'liberar');
  await C.click('#confirmaSim');
  ok(await esperar(async () => (await ler('frs/f1')).status === 'aberta'), 'Chefe liberou de novo a FR encerrada');
  await p.reload();
  await p.waitForSelector('#btnIrEncerrar', { timeout: 15000 });
  ok(await p.evaluate(() => FR.estado.fr && FR.estado.fr.id === 'f1'), 'O celular do funcionário pegou a FR de volta para continuar');
  // Chefe faz a FR completa de quem esqueceu
  await C.goBack();
  await C.click('#btnPreparar');
  await C.click('[data-func="900"]');
  await C.click('.veiculo[data-id="v1"]');
  if (await C.isVisible('#confirmaSim')) await C.click('#confirmaSim'); // veículo em uso pela FR liberada
  await C.fill('#ppDescricao', 'Serviço esquecido');
  await C.click('#ppCompleta');
  await C.waitForSelector('#btnFichaSalvar:visible');
  await C.click('[data-secao="retorno"] .cartao-cab');
  await C.fill('input[name="retorno_km"]', '1100');
  await C.click('#btnFichaSalvar');
  await C.waitForSelector('#btnPreparar');
  const comp = await esperar(async () => adm(async db => { const { getDocs, collection, query, where } = require('firebase/firestore');
    const s = await getDocs(query(collection(db, 'frs'), where('descricao', '==', 'Serviço esquecido'))); return s.docs[0] && s.docs[0].data().status === 'fechada' && s.docs[0].data(); }));
  ok(comp && comp.retorno_km === '1100' && comp.completaPor === 'Carlos Mendes', 'FR completa do chefe: salva já encerrada');
  ok(await esperar(async () => (await ler('veiculos/v1')).ultimoKm === 1100), 'Km da FR completa foi para o veículo');
  await b.close(); await env.cleanup();
  console.log(falhas ? `FALHAS: ${falhas}` : 'TUDO OK');
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.log('ERRO', ((e.stack || '').match(/\w+\.cjs:\d+/) || [''])[0], e.message.split('\n').slice(0, 4).join(' | ')); process.exit(1); });
