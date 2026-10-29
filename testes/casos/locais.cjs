const { chromium } = require('playwright');
const { initializeTestEnvironment } = require('@firebase/rules-unit-testing');
const { doc, setDoc, getDoc } = require('firebase/firestore');
const lerLocais = async adm => adm(async db => Object.entries((await getDoc(doc(db, 'listas/locais'))).data().itens).map(([chave, l]) => ({ chave, ...l })));
let falhas = 0;
const ok = (c, msg) => { console.log(c ? 'OK  ' : 'FALHA', msg); if (!c) falhas++; };
(async () => {
  const env = await initializeTestEnvironment({ projectId: 'demo-fr', firestore: { host: '127.0.0.1', port: 8086, rules: require('fs').readFileSync(require('path').resolve(__dirname, '../../firestore.rules'), 'utf8') } });
  const adm = async fn => { let r; await env.withSecurityRulesDisabled(async c => { r = await fn(c.firestore()); }); return r; };
  await adm(async db => {
    await setDoc(doc(db, 'funcionarios/100'), { rgf: '100', nome: 'Antonio Silva', cargo: 'ASG', uid: null, aprovado: true });
    await setDoc(doc(db, 'funcionarios/200'), { rgf: '200', nome: 'Bruno Souza', cargo: 'ASG', uid: null, aprovado: true });
    await setDoc(doc(db, 'veiculos/v1'), { placa: 'GBI-2447', modelo: 'S-10', ultimoKm: 1000, ativo: true });
    await setDoc(doc(db, 'listas/locais'), { itens: { 'RUA QUEIROZ': { texto: 'Rua Queiroz', n: 1 }, 'PARQUE QUATINGA VELHA': { texto: 'Parque Quatinga Velha', n: 9 } } });
  });
  const b = await chromium.launch();
  const celular = async rgf => {
    const ctx = await b.newContext({ viewport: { width: 400, height: 860 } });
    const p = await ctx.newPage();
    p.on('pageerror', e => console.log('pageerror', e.message));
    p.on('console', m => { if (/Content Security Policy/i.test(m.text())) console.log('CSP', m.text().slice(0, 200)); });
    await p.goto('http://localhost:8090/');
    await p.fill('#rgfNumero', rgf); await p.click('#btnRgfContinuar'); await p.click('#btnRgfSouEu');
    await p.click('#btnComecarDia'); await p.click('.veiculo'); await p.click('#csComb button[data-valor="1/2"]');
    await p.click('#btnComecarAvancar'); await p.click('#btnComecarAvancar');
    await p.fill('#cdDescricao', 'Serviço'); await p.click('#btnComecarAvancar');
    await p.waitForSelector('#btnSaida');
    return [ctx, p];
  };
  const [ctxA, A] = await celular('100');
  // Antônio escreve um local novo
  await A.click('#btnSaida');
  await A.locator('#npBusca').pressSequentially('Quatinga');
  await A.click('#npLista [data-i="0"]');
  await A.waitForSelector('#btnChegada');
  await A.waitForTimeout(1500);
  let l = await lerLocais(adm);
  ok(l.some(x => x.texto === 'Quatinga' && x.n === 1), 'Local novo "Quatinga" foi para o banco');

  // Bruno, em outro celular, digita só "q"
  const [ctxB, B] = await celular('200');
  await B.waitForTimeout(1000);
  await B.click('#btnSaida');
  await B.locator('#npBusca').pressSequentially('q');
  await B.waitForSelector('#npLista .np-local:not(.destaque)');
  const s1 = await B.locator('#npLista .np-local:not(.destaque) b').allInnerTexts();
  console.log('     sugestões com "q":', JSON.stringify(s1));
  ok(s1[0] === 'Quatinga' && s1.includes('Rua Queiroz') && s1.includes('Parque Quatinga Velha'), 'Com "q": começa com Q primeiro, depois palavras com Q');
  await B.locator('#npBusca').pressSequentially('uat');
  const s2 = await B.locator('#npLista .np-local:not(.destaque) b').allInnerTexts();
  ok(JSON.stringify(s2) === JSON.stringify(['Quatinga', 'Parque Quatinga Velha']), 'Com "quat": filtro atualiza ' + JSON.stringify(s2));
  await B.waitForTimeout(1500); await B.screenshot({ path: process.argv[2] + '/sugestoes.png' });
  await B.click('#npLista .np-local:has(b:text-is("Quatinga"))');
  ok((await B.innerText('.roteiro')).includes('Quatinga'), 'Tocar no local registra a saída');
  await B.waitForTimeout(1500);
  l = await lerLocais(adm);
  ok(l.filter(x => x.chave === 'QUATINGA').length === 1 && l.find(x => x.chave === 'QUATINGA').n === 2, 'Mesmo local não duplica: uso foi para 2');

  // Antônio escreve "quatínga" com acento/minúsculo: não duplica
  await A.click('#btnChegada'); await A.fill('#fcKm', '1010'); await A.click('#folhaFormOk');
  await A.click('#btnSaida'); await A.fill('#npBusca', 'quatínga'); await A.click('#npLista [data-i="0"]');
  await A.waitForTimeout(1500);
  l = await lerLocais(adm);
  ok(l.filter(x => x.chave === 'QUATINGA').length === 1 && l.find(x => x.chave === 'QUATINGA').n === 3, 'Acento e minúscula não duplicam');

  // Sem internet: sugestões continuam (cópia do celular)
  await ctxB.route(/:(9098|8086)\//, () => {});
  await B.reload();
  await B.waitForSelector('#btnChegada, #btnSaida');
  if (await B.isVisible('#btnChegada')) { await B.click('#btnChegada'); await B.fill('#fcKm', '1020'); await B.click('#folhaFormOk'); }
  await B.click('#btnSaida');
  await B.locator('#npBusca').pressSequentially('pa');
  ok((await B.locator('#npLista .np-local:not(.destaque) b').allInnerTexts()).includes('Parque Quatinga Velha'), 'Sem internet as sugestões continuam');
  await b.close(); await env.cleanup();
  console.log(falhas ? `${falhas} falha(s)` : 'TUDO OK');
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.log('ERRO', ((e.stack || '').match(/\w+\.cjs:\d+/) || [''])[0], e.message.split('\n')[0]); process.exit(1); });
