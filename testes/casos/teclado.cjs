// Teclado do celular: campo de texto livre NÃO pode ter autocomplete="off" (no Android isso desliga as
// sugestões e o microfone do teclado); campo de número abre o teclado de números (type="tel").
const { chromium } = require('playwright');
const { initializeTestEnvironment } = require('@firebase/rules-unit-testing');
const { doc, setDoc } = require('firebase/firestore');
let falhas = 0;
const ok = (c, msg) => { console.log(c ? 'OK  ' : 'FALHA', msg); if (!c) falhas++; };
(async () => {
  const env = await initializeTestEnvironment({ projectId: 'demo-fr', firestore: { host: '127.0.0.1', port: 8086, rules: require('fs').readFileSync(require('path').resolve(__dirname, '../../firestore.rules'), 'utf8') } });
  await env.withSecurityRulesDisabled(async c => {
    const db = c.firestore();
    await setDoc(doc(db, 'funcionarios/100'), { rgf: '100', nome: 'Fernando Alves', cargo: 'ASG', uid: null, aprovado: true, visto: true });
    await setDoc(doc(db, 'veiculos/v1'), { placa: 'GBI-2447', modelo: 'S-10', marca: 'Chevrolet', ultimoKm: 217789, ativo: true });
  });
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 400, height: 860 } });
  p.on('pageerror', e => console.log('pageerror', e.message));
  // Campos visíveis agora: texto livre (sem sugestão = falha) e número (tem que ser tel)
  const conferir = async (onde, livres, numeros) => {
    const r = await p.evaluate(([l, n]) => ({
      livres: l.map(s => { const e = document.querySelector(s); return e ? [s, e.getAttribute('autocomplete') || ''] : [s, 'NAO ACHOU']; }),
      numeros: n.map(s => { const e = document.querySelector(s); return e ? [s, e.type] : [s, 'NAO ACHOU']; }),
    }), [livres, numeros]);
    const ruins = r.livres.filter(([, a]) => a === 'off' || a === 'NAO ACHOU');
    ok(!ruins.length, `${onde}: texto livre com as sugestões do teclado` + (ruins.length ? ' — ' + JSON.stringify(ruins) : ''));
    const nruins = r.numeros.filter(([, t]) => t !== 'tel');
    if (numeros.length) ok(!nruins.length, `${onde}: número com teclado de números` + (nruins.length ? ' — ' + JSON.stringify(nruins) : ''));
  };
  await p.goto('http://localhost:8090/');
  await p.fill('#rgfNumero', '100'); await p.click('#btnRgfContinuar'); await p.click('#btnRgfSouEu');
  await p.click('#btnComecarDia'); await p.click('.veiculo[data-id="v1"]');
  await conferir('Saída', [], ['#csKm']);
  await p.click('#csComb button[data-valor="cheio"]'); await p.click('#btnComecarAvancar'); await p.click('#btnComecarAvancar');
  await conferir('Serviço', ['#cdDescricao'], []);
  await p.fill('#cdDescricao', 'Roçada'); await p.click('#btnComecarAvancar');
  await p.waitForSelector('#btnSaida'); await p.click('#btnSaida');
  await conferir('Nova parada', ['#npBusca'], []);
  await p.fill('#npBusca', 'Margarida'); await p.click('#btnParadaContinuar');
  await p.waitForSelector('#btnChegada'); await p.click('#btnChegada');
  await conferir('Chegada', [], ['#fcKm']);
  await p.fill('#fcKm', '217800'); await p.click('#folhaFormOk');
  await p.click('#btnVerFicha'); await p.waitForSelector('#tela-ficha:not([hidden])');
  await p.evaluate(() => document.querySelectorAll('#form .cartao[data-secao]').forEach(c => c.classList.add('aberto')));
  await conferir('Ficha', ['textarea[name="descricao"]', 'textarea[name="defeitos"]', 'textarea[name="ocorrencias"]', 'input[data-campo="local"]'],
    ['input[name="partida_km"]', 'input[name="retorno_km"]', 'input[data-campo="saida_km"]', 'input[data-campo="chegada_km"]']);
  await p.click('#btnVoltar'); await p.waitForSelector('#btnIrEncerrar'); await p.click('#btnIrEncerrar');
  await conferir('Encerrar', ['#ceDefeitos', '#ceOcorrencias'], ['#ceKm']);
  // Nenhum textarea do app inteiro com as sugestões desligadas
  ok(await p.evaluate(() => [...document.querySelectorAll('textarea')].every(t => t.getAttribute('autocomplete') !== 'off')), 'Nenhuma caixa de texto com as sugestões desligadas');
  await b.close(); await env.cleanup();
  console.log(falhas ? `FALHAS: ${falhas}` : 'TUDO OK');
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.log('ERRO', ((e.stack || '').match(/\w+\.cjs:\d+/) || [''])[0], e.message.split('\n')[0]); process.exit(1); });
