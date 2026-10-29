const { chromium } = require('playwright');
const { initializeTestEnvironment } = require('@firebase/rules-unit-testing');
const { doc, setDoc, getDoc, updateDoc } = require('firebase/firestore');
const URL = 'http://localhost:8090/';
let falhas = 0;
const ok = (c, msg) => { console.log(c ? 'OK  ' : 'FALHA', msg); if (!c) falhas++; };

(async () => {
  const env = await initializeTestEnvironment({ projectId: 'demo-fr', firestore: { host: '127.0.0.1', port: 8086, rules: require('fs').readFileSync(require('path').resolve(__dirname, '../../firestore.rules'), 'utf8') } });
  const adm = async fn => { let r; await env.withSecurityRulesDisabled(async c => { r = await fn(c.firestore()); }); return r; };
  await adm(async db => {
    await setDoc(doc(db, 'funcionarios/100'), { rgf: '100', nome: 'Antonio Silva', cargo: 'Motorista', uid: null, aprovado: true, visto: true });
    await setDoc(doc(db, 'funcionarios/200'), { rgf: '200', nome: 'Bruno Souza', cargo: 'Motorista', uid: null, aprovado: true, visto: true });
    await setDoc(doc(db, 'veiculos/v1'), { placa: 'GBI-2447', modelo: 'S-10', marca: 'GM', numero: '7', ultimoKm: 217551, ativo: true });
  });
  const b = await chromium.launch();
  global.paginas = [];
  const celular = async nome => {
    const ctx = await b.newContext({ viewport: { width: 400, height: 860 } });
    const p = await ctx.newPage();
    p.on('pageerror', e => console.log(`[${nome}] pageerror`, e.message));
    p.on('console', m => { if (/FR|db/.test(m.text())) console.log(`[${nome}] console`, m.text().slice(0, 200)); });
    global.paginas.push([nome, p]);
    await p.goto(URL);
    return p;
  };
  const entrar = async (p, rgf) => {
    await p.waitForSelector('#rgfNumero');
    await p.fill('#rgfNumero', rgf);
    await p.click('#btnRgfContinuar');
    await p.click('#btnRgfSouEu');
    await p.waitForSelector('#btnComecarDia, #btnSaida, #btnChegada, [data-usar-fr]');
  };
  const confirmar = p => p.click('#confirmaSim');

  // Antônio começa o dia
  const A = await celular('A');
  await entrar(A, '100');
  await A.click('#btnComecarDia');
  await A.click('.veiculo');
  await A.click('#csComb button[data-valor="1/2"]');
  await A.click('#btnComecarAvancar');
  await A.click('#btnComecarAvancar');
  await A.fill('#cdDescricao', 'Manutenção de praças');
  await A.click('#btnComecarAvancar');
  await A.waitForSelector('#btnSaida');
  ok(true, 'Antônio abriu a FR');

  // Bruno entra no celular dele
  const B = await celular('B');
  await entrar(B, '200');

  // Antônio compartilha com o Bruno
  await A.click('#btnCompartilhar');
  await A.fill('#fcRgf', '200');
  await A.click('#folhaFormOk');
  await confirmar(A);
  await A.waitForSelector('text=Compartilhada com Bruno');
  ok(true, 'Antônio compartilhou com Bruno');

  // Bruno usa a FR e registra uma parada
  await B.waitForSelector('[data-usar-fr]', { timeout: 10000 });
  await B.click('[data-usar-fr]');
  ok(await B.isVisible('text=FR de Antonio'), 'Bruno está na FR do Antônio');
  ok(!(await B.isVisible('#btnIrEncerrar')), 'Bruno não tem botão de encerrar');
  await B.click('#btnSaida');
  await B.fill('#npBusca', 'Praça do Bruno');
  await B.click('#npLista [data-i="0"]');
  await B.click('#btnChegada');
  await B.fill('#fcKm', '217560');
  await B.click('#folhaFormOk');
  await B.waitForSelector('.roteiro-delta:has-text("+9 km")');

  // Antônio vê a parada do Bruno
  await A.waitForSelector('text=Praça do Bruno', { timeout: 10000 });
  ok(true, 'Parada do Bruno apareceu no celular do Antônio');

  // Bruno devolve o carro
  await B.click('#btnDevolver'); await confirmar(B);
  await B.waitForSelector('#btnComecarDia');
  ok(!(await B.isVisible('[data-usar-fr]')), 'Bruno devolveu e a FR saiu da tela dele');
  await A.waitForFunction(() => !document.body.innerText.includes('Compartilhada com'), null, { timeout: 10000 });
  ok(true, 'Antônio vê que o compartilhamento acabou');

  // Antônio registra parada própria depois
  await A.click('#btnSaida');
  await A.fill('#npBusca', 'Divisa');
  await A.click('#npLista [data-i="0"]');
  await A.waitForSelector('#btnChegada');
  await A.waitForTimeout(2000);

  // ADM desvincula o celular do Antônio; o celular novo do Antônio entra e recupera a FR
  await adm(db => updateDoc(doc(db, 'funcionarios/100'), { uid: null }));
  await A.waitForSelector('#rgfNumero:visible', { timeout: 10000 });
  ok(!String(await A.evaluate(() => localStorage.getItem('fr.atual.v2'))).includes('Divisa'), 'Celular velho tirou a FR do Antônio (ficou no banco)');
  const A2 = await celular('A2');
  await entrar(A2, '100');
  await A2.waitForSelector('text=Praça do Bruno', { timeout: 10000 });
  ok(await A2.isVisible('text=Divisa'), 'Celular novo do Antônio recuperou a FR com as paradas');
  ok(await A2.isVisible('#btnChegada'), 'Celular novo continua a parada em andamento');

  // O celular velho entra com outro RGF (o bug relatado): a FR NÃO pode virar dele
  await adm(db => setDoc(doc(db, 'funcionarios/300'), { rgf: '300', nome: 'Fernando Alves', cargo: 'ADM', uid: null, aprovado: true, visto: true }));
  await entrar(A, '300');
  await A.waitForSelector('#btnComecarDia');
  const fr = await adm(async db => { const { getDocs, collection } = require('firebase/firestore'); return (await getDocs(collection(db, 'frs'))).docs.map(d => d.data()); });
  ok(fr.length === 1 && fr[0].rgf === '100' && fr[0].condutor === 'Antonio Silva', 'FR continua no nome do Antônio depois de outro RGF entrar no celular velho');

  // ADM passa a FR para o Bruno: o celular do Antônio solta, o do Bruno pega
  const id = await A2.evaluate(() => FR.estado.fr.id);
  await adm(db => updateDoc(doc(db, 'frs/' + id), { rgf: '200', condutor: 'Bruno Souza' }));
  await A2.waitForSelector('#btnComecarDia', { timeout: 10000 });
  ok(true, 'Celular do Antônio soltou a FR passada pelo ADM');
  await B.reload();
  await B.waitForSelector('text=Divisa', { timeout: 10000 });
  ok(await B.evaluate(() => FR.estado.fr && FR.estado.fr.condutor) === 'Bruno Souza', 'Celular do Bruno pegou a FR passada pelo ADM');

  await b.close();
  await env.cleanup();
  console.log(falhas ? `${falhas} falha(s)` : 'TUDO OK');
  process.exit(falhas ? 1 : 0);
})().catch(async e => { console.log('ERRO', ((e.stack || '').match(/\w+\.cjs:\d+/) || [''])[0], e.message.split('\n')[0]); for (const [n, p] of global.paginas || []) console.log(`[${n}] TELA:`, (await p.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ').slice(0, 400)); process.exit(1); });
