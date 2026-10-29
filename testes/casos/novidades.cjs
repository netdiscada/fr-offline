const { chromium } = require('playwright');
const { acaoFr, IMPRIMIR, fecharVisor } = require('./ui.cjs');
const { initializeTestEnvironment } = require('@firebase/rules-unit-testing');
const { doc, setDoc, getDoc, updateDoc } = require('firebase/firestore');
let falhas = 0;
const ok = (c, msg) => { console.log(c ? 'OK  ' : 'FALHA', msg); if (!c) falhas++; };
(async () => {
  const env = await initializeTestEnvironment({ projectId: 'demo-fr', firestore: { host: '127.0.0.1', port: 8086, rules: require('fs').readFileSync(require('path').resolve(__dirname, '../../firestore.rules'), 'utf8') } });
  const adm = async fn => { let r; await env.withSecurityRulesDisabled(async c => { r = await fn(c.firestore()); }); return r; };
  await adm(async db => {
    await setDoc(doc(db, 'funcionarios/100'), { rgf: '100', nome: 'Antonio Silva', cargo: 'ASG', uid: null, aprovado: true, visto: true });
    await setDoc(doc(db, 'veiculos/v1'), { placa: 'GBI-2447', modelo: 'S-10', ultimoKm: 217551, ativo: true,
      defeitosAbertos: [{ id: 'iluminacao', nome: 'Iluminação Externa', desde: '2026-10-25' },
                        { id: 'buzina', nome: 'Buzina', desde: '2026-10-24', descricao: 'Buzina fraca' }] });
  });
  const ids = await (async () => { const L = require('fs').readFileSync(require('path').resolve(__dirname, '../../www/js/layout.js'), 'utf8'); return L; })();
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 400, height: 860 } })).newPage();
  p.on('pageerror', e => console.log('pageerror', e.message));
  await p.goto('http://localhost:8090/');
  await p.fill('#rgfNumero', '100'); await p.click('#btnRgfContinuar'); await p.click('#btnRgfSouEu');
  await p.click('#btnComecarDia');
  await p.click('.veiculo');
  await p.click('#csComb button[data-valor="1/2"]');
  await p.click('#btnComecarAvancar');
  // Inspeção: tudo em OK, inclusive o defeito antigo do veículo (só aparece como aviso)
  const c = await p.evaluate(() => FR.estado.fr.checklist);
  ok(Object.keys(c).length === 35 || Object.keys(c).length > 20, 'Inspeção preenchida em todos os grupos');
  ok(c.iluminacao === 'x' && c.buzina === 'x' && Object.entries(c).filter(([k]) => k !== 'iluminacao' && k !== 'buzina').every(([, v]) => v === 'ok'), 'Tudo OK, menos os X da FR anterior');
  ok(await p.isVisible('text=Buzina fraca'), 'X da FR anterior volta com a descrição');
  const avisos = await p.locator('.item-pend:not(.item-defeito)').allInnerTexts(); console.log('avisos:', JSON.stringify(avisos));
  ok(avisos.some(t => t.includes('Veio com X da FR anterior (desde 25/10/2026)')), 'Aviso de que veio da FR anterior');
  // Iluminação foi consertada: funcionário troca para OK
  await p.locator('.item', { hasText: 'Iluminação Externa' }).locator('button[data-v="ok"]').click();
  // Marca X no pneu e descreve
  const pneu = p.locator('.item', { hasText: 'Pneus' });
  await pneu.locator('button[data-v="x"]').click();
  await p.waitForSelector('#clDefeito');
  await p.fill('#clDefeito', 'Pneu traseiro direito careca');
  await p.click('#folhaFormOk');
  ok(await pneu.locator('text=Pneu traseiro direito careca').isVisible(), 'Descrição aparece embaixo do item');
  await pneu.scrollIntoViewIfNeeded();
  await p.screenshot({ path: process.argv[2] + '/inspecao.png' });
  await p.click('#btnComecarAvancar');
  await p.fill('#cdDescricao', 'Pintura de guias');
  await p.click('#btnComecarAvancar');
  await p.waitForSelector('#btnSaida');
  // Encerrar: defeitos só com o texto do funcionário
  await p.click('#btnIrEncerrar');
  ok(await p.inputValue('#ceDefeitos') === 'Pneu traseiro direito careca; Buzina fraca' || await p.inputValue('#ceDefeitos') === 'Buzina fraca; Pneu traseiro direito careca', 'Defeitos/Avarias = só as descrições: ' + await p.inputValue('#ceDefeitos'));
  await p.fill('#ceKm', '217600');
  await p.click('#btnEncerrar');
  await p.waitForSelector('#visorAcoes [data-visor="1"]', { timeout: 15000 });
  await p.click('#visorAcoes [data-visor="1"]');
  await p.waitForSelector('#tela-inicio:not([hidden])');
  await p.locator('[data-ant="pdf"], #btnPdfAnterior').first().click();
  await p.waitForSelector(IMPRIMIR);
  // Site: passo a passo antes de imprimir (uma vez, se marcar "não mostrar de novo")
  await p.evaluate(() => { window.__impressoes = 0; window.print = () => { window.__impressoes++; }; });
  await p.click(IMPRIMIR);
  await p.waitForSelector('#guiaNaoMostrar');
  ok(/borda longa/i.test(await p.textContent('#folhaForm')), 'Passo a passo da impressão aparece');
  await p.check('#guiaNaoMostrar');
  await p.click('#folhaFormOk');
  await p.waitForFunction(() => window.__impressoes === 1);
  await p.locator('[data-ant="pdf"], #btnPdfAnterior').first().click();
  await p.click(IMPRIMIR);
  await p.waitForFunction(() => window.__impressoes === 2);
  ok(!(await p.isVisible('#guiaNaoMostrar')), 'Depois de "não mostrar de novo", imprime direto');
  await fecharVisor(p);
  await p.waitForTimeout(1500);
  const id = await p.evaluate(() => FR.estado.fr.id);
  const v = await adm(async db => (await getDoc(doc(db, 'veiculos/v1'))).data());
  const dv = Object.fromEntries(v.defeitosAbertos.map(d => [d.id, d]));
  ok(v.defeitosAbertos.length === 2 && dv.pneus.descricao === 'Pneu traseiro direito careca' && dv.buzina.desde === '2026-10-24', 'Veículo: pneu novo + buzina (mantém a data), iluminação consertada saiu');
  const fr = await adm(async db => (await getDoc(doc(db, 'frs/' + id))).data());
  ok(fr.status === 'fechada' && fr.defeitos.includes('Pneu traseiro') && fr.defeitos.includes('Buzina fraca'), 'FR encerrada no banco com os defeitos certos');
  // ADM libera de novo: o celular pega a FR de volta ao voltar para o app
  await adm(db => updateDoc(doc(db, 'frs/' + id), { status: 'aberta' }));
  await p.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await p.waitForSelector('#btnIrEncerrar', { timeout: 10000 });
  ok(await p.evaluate(() => FR.estado.fr.status) === 'aberta', 'FR liberada pelo ADM voltou para o celular');
  await b.close(); await env.cleanup();
  console.log(falhas ? `${falhas} falha(s)` : 'TUDO OK');
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.log('ERRO', ((e.stack || '').match(/\w+\.cjs:\d+/) || [''])[0], e.message.split('\n')[0]); process.exit(1); });
