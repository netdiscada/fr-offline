// Caso real: a FR anterior do veículo saiu com o km de retorno errado (100 000 a menos). O ADM corrige e
// o km certo vai para o veículo e para a FR em aberto do colega; e a ficha da FR do dia tem Salvar.
const { chromium } = require('playwright');
const { acaoFr } = require('./ui.cjs');
const { initializeTestEnvironment } = require('@firebase/rules-unit-testing');
const { doc, setDoc, getDoc, Timestamp } = require('firebase/firestore');
let falhas = 0;
const ok = (c, msg) => { console.log(c ? 'OK  ' : 'FALHA', msg); if (!c) falhas++; };
const dois = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`;
const ONTEM = iso(new Date(Date.now() - 86400000));
(async () => {
  const env = await initializeTestEnvironment({ projectId: 'demo-fr', firestore: { host: '127.0.0.1', port: 8086, rules: require('fs').readFileSync(require('path').resolve(__dirname, '../../firestore.rules'), 'utf8') } });
  const adm = async fn => { let r; await env.withSecurityRulesDisabled(async c => { r = await fn(c.firestore()); }); return r; };
  const ler = caminho => adm(async db => { const s = await getDoc(doc(db, caminho)); return s.exists() ? s.data() : null; });
  const esperar = async (fn, ms = 15000) => { const fim = Date.now() + ms; let v; while (Date.now() < fim) { v = await fn(); if (v) return v; await new Promise(r => setTimeout(r, 250)); } return v; };
  const conta = await (await fetch('http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'adm@fr.test', password: 'senha123', returnSecureToken: true }) })).json();
  await adm(async db => {
    await setDoc(doc(db, 'admins/' + conta.localId), {});
    await setDoc(doc(db, 'funcionarios/100'), { rgf: '100', nome: 'Antonio Silva', cargo: 'Motorista', uid: 'celVelho', aprovado: true, visto: true });
    await setDoc(doc(db, 'funcionarios/200'), { rgf: '200', nome: 'Fernando Alves', cargo: 'Motorista', uid: null, aprovado: true, visto: true });
    await setDoc(doc(db, 'veiculos/v1'), { placa: 'GBI-2447', modelo: 'S-10', marca: 'GM', tipo: 'caminhonete', ultimoKm: 117789, ultimaFrId: 'f1', ultimoRgf: '100', ativo: true });
    await setDoc(doc(db, 'frs/f1'), { rgf: '100', condutor: 'Antonio Silva', uid: 'celVelho', status: 'fechada', data: ONTEM, veiculoId: 'v1', placa: 'GBI-2447', modelo: 'S-10', marca: 'GM',
      partida_km: '217700', retorno_km: '117789', partida_hora: '07:00', retorno_hora: '16:00', descricao: 'Roçada', itinerario: [], checklist: {}, criadoEm: Timestamp.now() });
  });
  const b = await chromium.launch();
  // Celular do Fernando: começa o dia com o km que veio errado e sai para uma parada
  const p = await (await b.newContext({ viewport: { width: 400, height: 860 } })).newPage();
  p.on('pageerror', e => console.log('pageerror', e.message));
  await p.goto('http://localhost:8090/');
  await p.fill('#rgfNumero', '200'); await p.click('#btnRgfContinuar'); await p.click('#btnRgfSouEu');
  await p.click('#btnComecarDia'); await p.click('.veiculo[data-id="v1"]');
  ok(await p.inputValue('#csKm') === '117789', 'Saída veio com o km errado da FR anterior (117789)');
  await p.click('#csComb button[data-valor="cheio"]');
  await p.click('#btnComecarAvancar'); await p.click('#btnComecarAvancar');
  await p.fill('#cdDescricao', 'Capina'); await p.click('#btnComecarAvancar');
  await p.waitForSelector('#btnSaida'); await p.click('#btnSaida'); await p.click('#npLista [data-i="0"], .np-local >> nth=0').catch(async () => { await p.fill('#npBusca', 'Brás Cubas'); await p.click('#btnParadaContinuar'); });
  await p.waitForSelector('#btnChegada');
  const idF = await p.evaluate(() => FR.estado.fr.id);
  ok(await esperar(async () => { const f = await ler('frs/' + idF); return f && f.itinerario.length === 1; }), 'FR do Fernando subiu com a parada');

  // ADM corrige o km de retorno da FR anterior
  const D = await (await b.newContext({ viewport: { width: 400, height: 860 } })).newPage();
  D.on('pageerror', e => console.log('[adm] pageerror', e.message));
  await D.goto('http://localhost:8090/');
  await D.click('#btnRgfAdm');
  await D.fill('#admEmail', 'adm@fr.test'); await D.fill('#admSenha', 'senha123'); await D.click('#btnAdmEntrar');
  await D.click('[data-aba="frs"]');
  await acaoFr(D, 'f1', 'editar');
  await D.waitForSelector('#btnFichaSalvar:visible');
  await D.click('[data-secao="retorno"] .cartao-cab').catch(() => {});
  await D.fill('input[name="retorno_km"]', '217789');
  await D.click('#btnFichaSalvar');
  await D.waitForSelector('#tela-adm:not([hidden])');
  ok(/também foi corrigido/.test(await D.textContent('#toast')), 'ADM: aviso de que a FR em aberto também foi corrigida');
  ok(await esperar(async () => (await ler('veiculos/v1')).ultimoKm === 217789), 'Veículo ficou com 217789 km');

  // O celular do Fernando aplica sozinho
  ok(await esperar(() => p.evaluate(() => FR.estado.fr.partida_km === '217789' && FR.estado.fr.itinerario[0].saida_km === '217789')), 'Celular: km de saída e saída da 1ª parada viraram 217789');
  ok(/corrigiu o km de saída/.test(await p.textContent('#toast')), 'Celular avisa a correção');
  ok(await esperar(async () => { const f = await ler('frs/' + idF); return f.partida_km === '217789' && f.itinerario[0].saida_km === '217789'; }), 'Banco: FR do Fernando corrigida');

  // Ficha completa da FR do dia: botão Salvar
  await p.click('#btnVerFicha');
  await p.waitForSelector('#btnFichaSalvar:visible');
  ok(true, 'Ficha da FR do dia tem o botão Salvar');
  await p.click('[data-secao="servico"] .cartao-cab').catch(() => {});
  await p.fill('textarea[name="descricao"]', 'Capina e roçada');
  await p.click('#btnFichaSalvar');
  await p.waitForSelector('#tela-inicio:not([hidden])');
  ok(await esperar(async () => (await ler('frs/' + idF)).descricao === 'Capina e roçada'), 'Salvar grava no banco e volta para o início');

  await b.close(); await env.cleanup();
  console.log(falhas ? `FALHAS: ${falhas}` : 'TUDO OK');
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.log('ERRO', ((e.stack || '').match(/\w+\.cjs:\d+/) || [''])[0], e.message.split('\n').slice(0, 4).join(' | ')); process.exit(1); });
