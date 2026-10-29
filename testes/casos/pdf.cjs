// Conteúdo do PDF: cada campo da FR tem que sair no PDF (km e horímetro), 2 páginas A4, nome do arquivo certo
const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const fs = require('fs');
let falhas = 0;
const ok = (c, msg) => { console.log(c ? 'OK  ' : 'FALHA', msg); if (!c) falhas++; };
(async () => {
  const out = process.argv[2];
  const b = await chromium.launch();
  const p = await b.newPage();
  p.on('pageerror', e => console.log('pageerror', e.message));
  await p.goto('http://localhost:8091/');
  await p.waitForFunction(() => window.FrPdf && window.FR);
  const casos = {
    carro: { data: '2026-10-26', condutor: 'ANTÔNIO DE SOUZA VIEIRA', rgf: '15487', cargo: 'ASG', placa: 'GBI-2447', modelo: 'S-10', marca: 'CHEVROLET', tombamento: '5G-1031', numero: '12',
      descricao: 'PINTURA DE GUIAS NA REGIONAL DIVISA', partida_km: '217551', partida_hora: '08:32', retorno_km: '217648', retorno_hora: '14:58', portaria_hora: '08:40', combustivel: '3/4',
      checklist: Object.fromEntries((await p.evaluate(() => FR.ITENS.map(i => i.id))).map(k => [k, 'ok'])), defeitos: 'FAROL ESQUERDO QUEIMADO', ocorrencias: 'SEM OCORRENCIAS',
      itinerario: [{ saida_km: '217551', saida_hora: '08:33', local: 'DIVISA', chegada_km: '217610', chegada_hora: '09:49' }, { saida_km: '217610', saida_hora: '13:49', local: 'QUATINGA', chegada_km: '217648', chegada_hora: '14:57' }] },
    maquina: { data: '2026-10-27', condutor: 'MARCOS RIBEIRO', rgf: '18820', cargo: 'OPERADOR', numero: '55', modelo: 'RETROESCAVADEIRA', medidor: 'horimetro',
      descricao: 'LIMPEZA DE TERRENO', partida_km: '1234,5', partida_hora: '07:30', retorno_km: '1240', retorno_hora: '15:00', combustivel: 'cheio', checklist: {},
      itinerario: [{ saida_km: '1234,5', saida_hora: '07:40', local: 'TERRENO DA DIVISA', chegada_km: '1236,5', chegada_hora: '09:00' }] },
  };
  casos.carro.checklist.iluminacao = 'x';
  for (const [nome, fr] of Object.entries(casos)) {
    const r = await p.evaluate(async fr => {
      await FrPdf.carregar();
      const bytes = await FrPdf.gerar(fr);
      return { b64: btoa(Array.from(bytes, c => String.fromCharCode(c)).join('')), nome: FR.nomeArquivo(fr) };
    }, fr);
    const arq = `${out}/fr-${nome}.pdf`;
    fs.writeFileSync(arq, Buffer.from(r.b64, 'base64'));
    const texto = execFileSync('pdftotext', ['-layout', arq, '-']).toString();
    const info = execFileSync('pdfinfo', [arq]).toString();
    ok(/Pages:\s+2/.test(info) && /595 x 842/.test(info), `${nome}: 2 páginas A4`);
    const esperado = nome === 'carro'
      ? ['ANTÔNIO DE SOUZA VIEIRA', '15487', 'ASG', 'GBI-2447', 'S-10', 'CHEVROLET', '5G-1031', 'PINTURA DE GUIAS', '217551', '08:32', '217648', '14:58', 'FAROL ESQUERDO', 'DIVISA', 'QUATINGA', '217610', '09:49', '13:49', '14:57', 'SEM OCORRENCIAS', '26', '10', '2026']
      : ['MARCOS RIBEIRO', '18820', 'RETROESCAVADEIRA', 'LIMPEZA DE TERRENO', '1234,5', '1240', '1236,5', 'TERRENO DA DIVISA'];
    const faltando = esperado.filter(e => !texto.includes(e));
    ok(!faltando.length, `${nome}: todos os campos no PDF` + (faltando.length ? ' — faltou: ' + faltando.join(', ') : ''));
    ok(r.nome.startsWith(nome === 'carro' ? 'FR_ANTONIO_DE_SOUZA_VIEIRA_26-10-2026.pdf' : 'FR_MARCOS_RIBEIRO_27-10-2026.pdf'), `${nome}: nome do arquivo (${r.nome.split('.pdf')[0]})`);
  }
  // Marcação do checklist: OK em tudo e X na iluminação do carro
  const t = execFileSync('pdftotext', ['-layout', `${out}/fr-carro.pdf`, '-']).toString();
  ok((t.match(/\(\s*OK\s*\)/gi) || t.match(/OK/g) || []).length >= 20 && /X/.test(t), 'carro: marcações OK/X no checklist');
  await b.close();
  console.log(falhas ? `${falhas} falha(s)` : 'TUDO OK');
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.log('ERRO', e.message.split('\n')[0]); process.exit(1); });
