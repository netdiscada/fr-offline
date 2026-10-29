// break-ui: o app com dados reais no pior caso, em 320 e 390 px. Uso (emulators:exec): node quebra.cjs <pasta>
const { chromium } = require('playwright');
const { initializeTestEnvironment } = require('@firebase/rules-unit-testing');
const { doc, setDoc, Timestamp } = require('firebase/firestore');
const PASTA = process.argv[2];
const dois = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`;
const HOJE = iso(new Date());
const LOCAIS = ['Escola Estadual Professor Antônio Gonçalves de Oliveira – Jardim Santa Tereza', 'UBS Braz Cubas', 'Divisa', 'Praça Coronel Benedito de Almeida', 'Cemitério São Salvador', 'Parque Centenário da Imigração Japonesa', 'Rua Dr. Deodato Wertheimer x Av. Francisco Rodrigues Filho', 'Quatinga', 'Jundiapeba', 'César de Souza', 'Biritiba Ussu', 'Taiaçupeba', 'Sabaúna', 'Brás Cubas II', 'Vila Moraes', 'Botujuru'];
(async () => {
  const env = await initializeTestEnvironment({ projectId: 'demo-fr', firestore: { host: '127.0.0.1', port: 8086, rules: require('fs').readFileSync(require('path').resolve(__dirname, '../../firestore.rules'), 'utf8') } });
  await env.withSecurityRulesDisabled(async c => {
    const db = c.firestore();
    for (const r of ['100', '101', '102']) await setDoc(doc(db, 'funcionarios/' + r), { rgf: r, nome: 'Maria Aparecida da Conceição Rodrigues dos Santos', cargo: 'Agente de Serviços Gerais', uid: null, aprovado: true, visto: true });
    for (const r of ['901', '902']) await setDoc(doc(db, 'funcionarios/' + r), { rgf: r, nome: 'Benedito Wellington Albuquerque de Souza', cargo: 'Encarregado', uid: null, aprovado: true, visto: true, papel: 'chefe' });
    await setDoc(doc(db, 'funcionarios/900'), { rgf: '900', nome: 'Benedito Wellington Albuquerque de Souza', cargo: 'Encarregado', uid: null, aprovado: true, visto: true, papel: 'chefe' });
    for (let i = 0; i < 9; i++) await setDoc(doc(db, 'funcionarios/2' + i), { rgf: '2' + i, nome: ['Jo', 'Ana Lúcia Ferreira Gonçalves Pinheiro', 'Zé', 'Francisco das Chagas Nascimento Filho', 'Luiz', 'Ednaldo Pereira', 'Ângela Maria', 'Raimundo Nonato da Silva Júnior', 'Iracema'][i], cargo: 'Motorista', uid: 'u' + i, aprovado: true, visto: true });
    await setDoc(doc(db, 'veiculos/v1'), { placa: 'FKP-3J21', modelo: 'Accelo 1016 Basculante Toco 4x2', marca: 'Mercedes-Benz', tipo: 'caminhao', tombamento: '5G-103154', ultimoKm: 1217551, ultimoCombustivel: '1/4', ativo: true, defeitosAbertos: [{ id: 'pneus', nome: 'Pneus', descricao: 'Pneu traseiro esquerdo careca e com bolha lateral', desde: '2026-10-20' }, { id: 'iluminacao', nome: 'Iluminação', desde: '2026-10-22' }] });
    await setDoc(doc(db, 'veiculos/v2'), { placa: 'GBI-2447', modelo: 'S-10', marca: 'GM', tipo: 'caminhonete', ultimoKm: 0, ativo: true });
    await setDoc(doc(db, 'veiculos/v3'), { placa: 'RET-0416', modelo: 'Retroescavadeira 416F2', marca: 'Caterpillar', tipo: 'retro', medidor: 'horimetro', ultimoKm: 12458.5, ativo: true });
    const itens = {}; LOCAIS.forEach((t, i) => { itens[t.toUpperCase().replace(/\W+/g, '_').slice(0, 40)] = { texto: t, n: 20 - i }; });
    await setDoc(doc(db, 'listas/locais'), { itens });
    // Equipe do chefe: abertas e encerradas com dados extremos
    for (let i = 0; i < 9; i++) {
      await setDoc(doc(db, 'frs/e' + i), { rgf: '2' + i, condutor: ['Jo', 'Ana Lúcia Ferreira Gonçalves Pinheiro', 'Zé', 'Francisco das Chagas Nascimento Filho', 'Luiz', 'Ednaldo Pereira', 'Ângela Maria', 'Raimundo Nonato da Silva Júnior', 'Iracema'][i], uid: 'u' + i, status: i < 5 ? 'aberta' : 'fechada', data: HOJE,
        veiculoId: i % 2 ? 'v1' : 'v2', placa: i % 2 ? 'FKP-3J21' : 'GBI-2447', modelo: i % 2 ? 'Accelo 1016 Basculante Toco 4x2' : 'S-10', marca: i % 2 ? 'Mercedes-Benz' : 'GM',
        partida_km: '1217551', partida_hora: '07:0' + i, retorno_km: i < 5 ? '' : '1217699', retorno_hora: i < 5 ? '' : '16:5' + i, descricao: 'Roçada e capina', itinerario: i === 1 ? LOCAIS.slice(0, 3).map((l, k) => ({ local: l, saida_km: '1217551', saida_hora: '08:0' + k, chegada_km: '1217560', chegada_hora: '08:3' + k })) : [], checklist: {}, criadoEm: Timestamp.now() });
    }
  });
  const b = await chromium.launch();
  const conta = await (await fetch('http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'adm@fr.test', password: 'senha123', returnSecureToken: true }) })).json();
  await env.withSecurityRulesDisabled(async c => { await setDoc(doc(c.firestore(), 'admins/' + conta.localId), {}); });
  const RGF = { 320: '100', 390: '101', 1440: '102' };
  for (const L of [320, 390, 1440]) {
    const ctx = await b.newContext({ viewport: { width: L, height: L > 900 ? 900 : 760 }, deviceScaleFactor: L > 900 ? 1 : 2 });
    await ctx.addInitScript(() => { try { localStorage.setItem('fr.animacoes.v1', JSON.stringify('off')); } catch (e) {} });
    const p = await ctx.newPage();
    p.on('pageerror', e => console.log('pageerror', e.message));
    const foto = (n, full = true) => p.screenshot({ path: `${PASTA}/${L}-${n}.png`, fullPage: full });
    const w = ms => p.waitForTimeout(ms);
    await p.goto('http://localhost:8090/');
    await p.fill('#rgfNumero', RGF[L]); await w(300); await p.click('#btnRgfContinuar'); await w(500); await p.click('#btnRgfSouEu');
    await p.waitForSelector('#btnComecarDia'); await w(800); await foto('1-inicio');
    await p.click('#btnComecarDia'); await w(500); await foto('2-veiculos');
    await p.click('.veiculo[data-id="v1"]'); await w(500); await foto('3-saida');
    await p.click('#csComb button[data-valor="1/4"]');
    await p.click('#btnComecarAvancar'); await w(500); await foto('4-inspecao');
    await p.click('#btnComecarAvancar'); await w(400);
    await p.fill('#cdDescricao', 'Roçada, capina e limpeza de bocas de lobo na região do Jardim Santa Tereza e entorno da Escola Estadual'); await foto('5-servico');
    await p.click('#btnComecarAvancar'); await w(1200);
    // 15 paradas (o máximo é 16), a última em andamento
    await p.evaluate(L => {
      const x = FR.estado.fr; x.itinerario = L.slice(0, 15).map((l, i) => ({ local: l, saida_km: String(1217551 + i * 12), saida_hora: `${String(7 + (i >> 1)).padStart(2, '0')}:${i % 2 ? '35' : '05'}`, chegada_km: i < 14 ? String(1217551 + i * 12 + 9) : '', chegada_hora: i < 14 ? `${String(7 + (i >> 1)).padStart(2, '0')}:${i % 2 ? '50' : '20'}` : '' }));
      FrDia.inicio();
    }, LOCAIS);
    await w(800); await foto('6-em-servico'); await foto('6b-em-servico-tela', false);
    await p.click('#btnChegada'); await w(600); await foto('7-chegada', false);
    await p.keyboard.press('Escape'); await p.evaluate(() => FR.fecharFolhas()); await w(300);
    await p.evaluate(() => { const x = FR.estado.fr; x.itinerario[14].chegada_km = '1217728'; x.itinerario[14].chegada_hora = '15:10'; FrDia.inicio(); }); await w(500);
    await p.click('#btnSaida'); await w(600); await foto('8-nova-parada');
    await p.click('#btnVoltar'); await w(500);
    await p.click('#btnIrEncerrar'); await w(700); await foto('9-encerrar');
    await p.click('#btnVoltar'); await w(500);
    await p.click('#btnVerFicha'); await w(900); await foto('10-ficha');
    await ctx.close();
    // Chefe
    const c2 = await b.newContext({ viewport: { width: L, height: L > 900 ? 900 : 760 }, deviceScaleFactor: L > 900 ? 1 : 2 });
    await c2.addInitScript(() => { try { localStorage.setItem('fr.animacoes.v1', JSON.stringify('off')); } catch (e) {} });
    const C = await c2.newPage();
    await C.goto('http://localhost:8090/');
    await C.fill('#rgfNumero', { 320: '900', 390: '901', 1440: '902' }[L]); await C.waitForTimeout(300); await C.click('#btnRgfContinuar'); await C.waitForTimeout(500); await C.click('#btnRgfSouEu');
    await C.waitForSelector('[data-fr]', { timeout: 15000 }).catch(() => {}); await C.waitForTimeout(1500);
    await C.screenshot({ path: `${PASTA}/${L}-11-chefe.png`, fullPage: true });
    await C.click('[data-fr="e1"]').catch(() => {}); await C.waitForTimeout(1200); await C.screenshot({ path: `${PASTA}/${L}-12-chefe-fr.png` });
    await C.keyboard.press('Escape'); await C.evaluate(() => { FR.fecharFolhas(); FR.fecharVisor && FR.fecharVisor(); }); await C.waitForTimeout(400);
    await C.click('#btnPreparar').catch(() => {}); await C.waitForTimeout(800); await C.screenshot({ path: `${PASTA}/${L}-13-preparar.png`, fullPage: true });
    await c2.close();
    // ADM
    const c3 = await b.newContext({ viewport: { width: L, height: L > 900 ? 900 : 760 }, deviceScaleFactor: L > 900 ? 1 : 2 });
    const D = await c3.newPage();
    D.on('pageerror', e => console.log('[adm] pageerror', e.message));
    await D.goto('http://localhost:8090/'); await D.click('#btnRgfAdm');
    await D.fill('#admEmail', 'adm@fr.test'); await D.fill('#admSenha', 'senha123'); await D.click('#btnAdmEntrar');
    await D.waitForTimeout(2000);
    for (const aba of ['frota', 'funcionarios', 'frs', 'locais']) {
      await D.click(`[data-aba="${aba}"]`).catch(() => {}); await D.waitForTimeout(1200);
      await D.screenshot({ path: `${PASTA}/${L}-20-adm-${aba}.png`, fullPage: true });
    }
    await c3.close();
  }
  await b.close(); await env.cleanup();
  console.log('OK quebra');
})().catch(e => { console.log('ERRO', ((e.stack || '').match(/\w+\.cjs:\d+/) || [''])[0], e.message.split('\n')[0]); process.exit(1); });
