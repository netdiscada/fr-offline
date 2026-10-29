// Dia inteiro SEM INTERNET (offline de verdade: o navegador sem rede, app servido pelo service worker)
// e colega registrando parada offline numa FR compartilhada. Depois a internet volta e tudo tem que subir.
const { chromium } = require('playwright');
const { acaoFr, IMPRIMIR, fecharVisor } = require('./ui.cjs');
const { initializeTestEnvironment } = require('@firebase/rules-unit-testing');
const { doc, setDoc, getDoc, getDocs, collection } = require('firebase/firestore');
const URL = 'http://localhost:8092/';
let falhas = 0;
const ok = (c, msg) => { console.log(c ? 'OK  ' : 'FALHA', msg); if (!c) falhas++; };
const esperar = async (fn, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await new Promise(r => setTimeout(r, 500)); } return false; };

(async () => {
  const env = await initializeTestEnvironment({ projectId: 'demo-fr', firestore: { host: '127.0.0.1', port: 8086, rules: require('fs').readFileSync(require('path').resolve(__dirname, '../../firestore.rules'), 'utf8') } });
  // Leitura de conferência (ADM do teste): o cliente do emulador às vezes responde "offline" por um instante; tenta de novo
  const adm = async fn => { for (let i = 0; ; i++) { try { let r; await env.withSecurityRulesDisabled(async c => { r = await fn(c.firestore()); }); return r; } catch (e) { if (i > 4 || !/offline/.test(e.message)) throw e; await new Promise(res => setTimeout(res, 500)); } } };
  await adm(async db => {
    await setDoc(doc(db, 'funcionarios/100'), { rgf: '100', nome: 'Antonio Silva', cargo: 'ASG', uid: null, aprovado: true });
    await setDoc(doc(db, 'funcionarios/200'), { rgf: '200', nome: 'Bruno Souza', cargo: 'Motorista', uid: null, aprovado: true });
    await setDoc(doc(db, 'veiculos/v1'), { placa: 'GBI-2447', marca: 'Chevrolet', modelo: 'S-10', numero: '12', ultimoKm: 1000, ativo: true,
      defeitosAbertos: [{ id: 'buzina', nome: 'Buzina', desde: '2026-10-20', descricao: 'Buzina fraca' }] });
    await setDoc(doc(db, 'listas/locais'), { itens: { QUATINGA: { texto: 'Quatinga', n: 5 } } });
  });
  const b = await chromium.launch();
  const novoCelular = async nome => {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
    const p = await ctx.newPage();
    p.on('pageerror', e => console.log(`[${nome}] pageerror`, e.message));
    p.on('console', m => { if (/registrarLocal|locais/.test(m.text())) console.log(`[${nome}] DEBUG`, m.text().slice(0, 300)); });
    p.on('console', m => { if (/Content Security Policy/i.test(m.text())) console.log(`[${nome}] CSP`, m.text().slice(0, 160)); });
    await p.goto(URL);
    return [ctx, p];
  };
  const entrar = async (p, rgf) => {
    await p.fill('#rgfNumero', rgf); await p.click('#btnRgfContinuar'); await p.click('#btnRgfSouEu');
    await p.waitForSelector('#btnComecarDia, #btnSaida, #btnChegada');
  };

  // ---------- Antônio: prepara com internet ----------
  const [ctxA, A] = await novoCelular('A');
  await entrar(A, '100');
  await A.evaluate(() => navigator.serviceWorker.ready);
  await esperar(() => A.evaluate(async () => (await caches.keys()).length > 0 && (await (await caches.open((await caches.keys())[0])).keys()).length >= 28));
  await esperar(() => A.evaluate(() => (FR.veiculos || []).length === 1 && (FR.locais || []).length === 1));
  ok(true, 'Primeiro acesso com internet; app guardado no celular');

  // ---------- SEM INTERNET ----------
  await ctxA.setOffline(true);
  const t0 = Date.now();
  await A.reload();
  await A.waitForSelector('#btnComecarDia', { timeout: 10000 });
  ok(Date.now() - t0 < 5000, `Abre sem internet em ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  await A.click('#btnComecarDia');
  ok(await A.locator('.veiculo').count() === 1, 'Lista de veículos sem internet');
  await A.click('.veiculo');
  ok(await A.inputValue('#csKm') === '1000', 'Km sugerido sem internet');
  await A.click('#csComb button[data-valor="cheio"]');
  await A.click('#btnComecarAvancar');
  ok(await A.evaluate(() => FR.estado.fr.checklist.buzina === 'x' && FR.estado.fr.defeitosItens.buzina === 'Buzina fraca'), 'X da FR anterior veio sem internet');
  const pneu = A.locator('.item', { hasText: 'Pneus' });
  await pneu.locator('button[data-v="x"]').click();
  await A.fill('#clDefeito', 'Pneu careca'); await A.click('#folhaFormOk');
  await A.click('#btnComecarAvancar');
  await A.fill('#cdDescricao', 'Serviço offline'); await A.click('#btnComecarAvancar');
  await A.waitForSelector('#btnSaida');
  ok(true, 'Começou o dia sem internet');
  await A.click('#btnSaida');
  await A.locator('#npBusca').pressSequentially('qua');
  ok((await A.locator('#npLista .np-local b').allInnerTexts()).includes('Quatinga'), 'Sugestão de local sem internet');
  await A.click('#npLista .np-local:has(b:text-is("Quatinga"))');
  await A.click('#btnChegada'); await A.fill('#fcKm', '1010'); await A.click('#folhaFormOk');
  await A.click('#btnSaida'); await A.fill('#npBusca', 'Rua Nova Offline'); await A.click('#npLista [data-i="0"]');
  await A.waitForSelector('#btnChegada');

  // Fecha o app no meio do dia, sem internet, e abre de novo
  await A.close();
  const A2 = await ctxA.newPage();
  A2.on('pageerror', e => console.log('[A2] pageerror', e.message));
  A2.on('console', m => { if (/registrarLocal|locais/.test(m.text())) console.log('[A2] DEBUG', m.text().slice(0, 300)); });
  await A2.goto(URL);
  await A2.waitForSelector('#btnChegada', { timeout: 10000 });
  ok((await A2.innerText('.roteiro')).includes('Rua Nova Offline'), 'Fechou e reabriu sem internet: FR continua de onde parou');
  await A2.click('#btnChegada'); await A2.fill('#fcKm', '1025'); await A2.click('#folhaFormOk');
  await A2.click('#btnIrEncerrar');
  ok(await A2.inputValue('#ceDefeitos') === 'Buzina fraca; Pneu careca' || await A2.inputValue('#ceDefeitos') === 'Pneu careca; Buzina fraca', 'Defeitos com as descrições');
  await A2.fill('#ceKm', '1030');
  await A2.click('#btnEncerrar');
  await A2.waitForSelector('#visorAcoes [data-visor="1"]', { timeout: 15000 });
  await A2.click('#visorAcoes [data-visor="1"]');
  await A2.waitForSelector('#tela-inicio:not([hidden])');
  ok(true, 'Conferiu e encerrou sem internet');
  await A2.locator('[data-ant="pdf"], #btnPdfAnterior').first().click();
  await A2.waitForSelector(IMPRIMIR, { timeout: 15000 });
  await A2.evaluate(() => { localStorage.setItem('fr.guiaImpressao.v1', 'true'); window.__imp = 0; window.print = () => { window.__imp++; }; });
  await A2.click(IMPRIMIR);
  ok(await esperar(() => A2.evaluate(() => window.__imp === 1 && document.querySelectorAll('#impressao img').length === 2), 15000), 'Imprimir (2 páginas) sem internet');
  const idA = await A2.evaluate(() => FR.estado.fr.id);
  ok(!(await adm(async db => (await getDoc(doc(db, 'frs/' + idA))).exists())), 'Enquanto sem internet, nada chegou ao banco (esperado)');

  // ---------- INTERNET VOLTA ----------
  await ctxA.setOffline(false);
  const subiu = await esperar(async () => {
    const f = await adm(async db => (await getDoc(doc(db, 'frs/' + idA))).data());
    return f && f.status === 'fechada' && f.itinerario.length === 2;
  }, 60000);
  ok(subiu, 'Internet voltou: FR encerrada subiu com as 2 paradas');
  const v = await adm(async db => (await getDoc(doc(db, 'veiculos/v1'))).data());
  ok(v.ultimoKm === 1030 && v.defeitosAbertos.length === 2, 'Veículo atualizado (km 1030 e 2 defeitos abertos)');
  const loc = await esperar(async () => { const l = await adm(async db => (await getDoc(doc(db, 'listas/locais'))).data().itens); return l['RUA NOVA OFFLINE'] && l.QUATINGA.n === 6; }, 30000);
  if (!loc) console.log('DEBUG locais', JSON.stringify(await adm(async db => (await getDoc(doc(db, 'listas/locais'))).data())));
  ok(loc, 'Locais: novo local criado e uso do Quatinga somado');

  // ---------- Colega offline numa FR compartilhada ----------
  await fecharVisor(A2);
  await A2.click('#btnComecarDia'); await A2.click('.veiculo');
  await A2.click('#csComb button[data-valor="cheio"]');
  await A2.click('#btnComecarAvancar');
  await A2.locator('.item', { hasText: 'Pneus' }).locator('button[data-v="ok"]').click();
  await A2.locator('.item', { hasText: 'Buzina' }).locator('button[data-v="ok"]').click();
  await A2.click('#btnComecarAvancar');
  await A2.fill('#cdDescricao', 'Segunda FR'); await A2.click('#btnComecarAvancar');
  await A2.waitForSelector('#btnSaida');
  const [ctxB, B] = await novoCelular('B');
  await entrar(B, '200');
  await A2.click('#btnCompartilhar'); await A2.fill('#fcRgf', '200'); await A2.click('#folhaFormOk'); await A2.click('#confirmaSim');
  await B.waitForSelector('[data-usar-fr]', { timeout: 15000 });
  await B.click('[data-usar-fr]');
  await B.waitForTimeout(1000);
  await ctxB.setOffline(true);
  await B.click('#btnSaida'); await B.fill('#npBusca', 'Parada do Bruno offline'); await B.click('#npLista [data-i="0"]');
  await B.click('#btnChegada'); await B.fill('#fcKm', '1040'); await B.click('#folhaFormOk');
  await B.waitForTimeout(1500);
  ok(!(await A2.innerText('.roteiro')).includes('Bruno offline'), 'Parada do colega offline ainda não chegou ao dono (esperado)');
  await ctxB.setOffline(false);
  ok(await esperar(async () => (await A2.innerText('.roteiro')).includes('Parada do Bruno offline'), 45000), 'Internet do colega voltou: parada apareceu no celular do dono');

  await b.close(); await env.cleanup();
  console.log(falhas ? `${falhas} falha(s)` : 'TUDO OK');
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.log('ERRO', ((e.stack || '').match(/\w+\.cjs:\d+/) || [''])[0], e.message.split('\n')[0]); process.exit(1); });
