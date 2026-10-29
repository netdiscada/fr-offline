// Segurança: textos do banco com código escondido (nome, cargo, local, veículo, FR) não podem rodar
// em nenhuma tela do funcionário nem do ADM, e têm que aparecer como texto.
const { chromium } = require('playwright');
const { acaoFr, IMPRIMIR, fecharVisor } = require('./ui.cjs');
const { initializeTestEnvironment } = require('@firebase/rules-unit-testing');
const { doc, setDoc } = require('firebase/firestore');
let falhas = 0;
const ok = (c, msg) => { console.log(c ? 'OK  ' : 'FALHA', msg); if (!c) falhas++; };
const MAL = '<img src=x onerror="window.__xss=(window.__xss||0)+1">';
(async () => {
  const env = await initializeTestEnvironment({ projectId: 'demo-fr', firestore: { host: '127.0.0.1', port: 8086, rules: require('fs').readFileSync(require('path').resolve(__dirname, '../../firestore.rules'), 'utf8') } });
  const r = await (await fetch('http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'adm@fr.test', password: 'senha123', returnSecureToken: true }) })).json();
  await env.withSecurityRulesDisabled(async c => {
    const db = c.firestore();
    await setDoc(doc(db, 'admins/' + r.localId), {});
    await setDoc(doc(db, 'funcionarios/100'), { rgf: '100', nome: 'Antonio ' + MAL, cargo: MAL, uid: null, aprovado: true });
    await setDoc(doc(db, 'funcionarios/666'), { rgf: '666', nome: MAL + 'Hacker', cargo: MAL, uid: 'zzz', aprovado: false, visto: false, pedidoUid: 'yyy', pedidoMotivo: MAL });
    await setDoc(doc(db, 'veiculos/v1'), { placa: MAL, marca: MAL, modelo: 'S-10' + MAL, numero: MAL, tombamento: MAL, ultimoKm: 10, ativo: true, licenciamentoVence: '2026-10-30',
      defeitosAbertos: [{ id: 'pneus', nome: MAL, desde: '2026-10-01', descricao: MAL }] });
    await setDoc(doc(db, 'listas/locais'), { itens: { MAL: { texto: 'Mal' + MAL, n: 3 } } });
    await setDoc(doc(db, 'frs/f1'), { id: 'f1', rgf: '100', uid: 'outro', condutor: MAL, cargo: MAL, status: 'fechada', data: '2026-10-25', placa: MAL, modelo: MAL,
      itinerario: [{ local: MAL, saida_km: '1', chegada_km: '2', saida_hora: '08:00', chegada_hora: '09:00' }], defeitosAbertos: [{ id: 'pneus', nome: MAL }],
      compartilhadoCom: [{ uid: 'q', rgf: '1', nome: MAL }], kmDivergente: true, kmEsperado: MAL, partida_km: MAL });
  });
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  const dialogos = [];
  p.on('dialog', d => { dialogos.push(d.message()); d.dismiss(); });
  p.on('pageerror', e => console.log('pageerror', e.message));
  await p.goto('http://localhost:8090/');
  const limpo = async onde => {
    await p.waitForTimeout(600);
    const n = await p.evaluate(() => window.__xss || 0);
    const imgs = await p.evaluate(() => document.querySelectorAll('img[src="x"]').length);
    ok(n === 0 && imgs === 0 && dialogos.length === 0, `${onde}: nenhum código rodou`);
  };
  await p.fill('#rgfNumero', '100'); await p.click('#btnRgfContinuar');
  await p.waitForSelector('#rgfPronto:not([hidden])');
  ok((await p.innerText('#rgfProntoDados')).includes('onerror'), '"É você?" mostra o nome como texto');
  await limpo('Primeiro acesso');
  await p.click('#btnRgfSouEu');
  await p.waitForSelector('#btnComecarDia');
  await limpo('Tela inicial');
  await p.click('#btnComecarDia');
  await limpo('Lista de veículos');
  await p.click('.veiculo'); await limpo('Saída');
  await p.click('#csComb button[data-valor="cheio"]'); await p.click('#btnComecarAvancar'); await limpo('Inspeção (defeito anterior)');
  await p.click('#btnComecarAvancar'); await p.fill('#cdDescricao', 'x'); await p.click('#btnComecarAvancar');
  await p.waitForSelector('#btnSaida'); await limpo('Tela do dia');
  await p.click('#btnSaida'); await p.locator('#npBusca').pressSequentially('mal'); await limpo('Sugestões de local');
  await p.click('#btnVoltar');
  await p.click('#btnMenu:visible, #btnMenuOla:visible'); await limpo('Menu');
  await p.click('#btnMenuAdm');
  await p.fill('#admEmail', 'adm@fr.test'); await p.fill('#admSenha', 'senha123'); await p.click('#btnAdmEntrar');
  await p.waitForSelector('#tela-adm:not([hidden])');
  await limpo('ADM Equipe (pedido de acesso)');
  await p.click('[data-aba="frota"]'); await p.click('.frota-item'); await limpo('ADM Frota (veículo)');
  await p.click('#folhaFormOk');
  await p.click('[data-aba="frs"]'); await p.waitForTimeout(1000); await limpo('ADM FRs');
  await acaoFr(p, 'f1', 'editar'); await limpo('ADM corrigindo FR (ficha completa)');
  await p.click('#btnVoltar');
  await p.click('[data-aba="frs"]'); await p.waitForTimeout(800);
  await acaoFr(p, 'f1', 'reabrir'); await limpo('ADM liberar de novo (confirmação)');
  await p.click('#folhaConfirma [data-fechar] >> nth=1');
  await acaoFr(p, 'f1', 'excluir'); await limpo('ADM excluir FR (confirmação)');
  await p.click('#folhaConfirma [data-fechar] >> nth=1');
  await p.click('[data-aba="locais"]'); await limpo('ADM Locais');
  await p.click('[data-aba="funcionarios"]');
  await p.click('[data-rgf="666"] [data-acao="recusar-cadastro"]'); await limpo('Confirmação com nome malicioso');
  await b.close(); await env.cleanup();
  console.log(falhas ? `${falhas} falha(s)` : 'TUDO OK');
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.log('ERRO', ((e.stack || '').match(/\w+\.cjs:\d+/) || [''])[0], e.message.split('\n')[0]); process.exit(1); });
