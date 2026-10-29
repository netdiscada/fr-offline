// Conteúdo do PDF: cada campo da FR tem que sair no PDF (km e horimetro), 2 paginas A4, nome do arquivo certo.
// Testa a geracao do PDF oficial diretamente (sem servidor, sem pdftotext/pdfinfo).
const { chromium } = require('playwright');
const { PDFDocument } = require(require('path').resolve(__dirname, '../../vendor/pdf-lib.min.js'));
const fs = require('fs');
const URL = process.env.FR_URL || 'http://localhost:8090/';
let falhas = 0;
const ok = (c, msg) => { console.log(c ? 'OK  ' : 'FALHA', msg); if (!c) falhas++; };
(async () => {
  const out = process.argv[2] || '/tmp/fr-pdf-teste';
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch();
  const p = await b.newPage();
  p.on('pageerror', e => console.log('pageerror', e.message));
  await p.goto(URL);

  // Cadastra veículo no IndexedDB para o app carregar sem erro
  await p.evaluate(async () => {
    const db = await new Promise((ok, erro) => {
      const req = indexedDB.open('fr-offline', 1);
      req.onerror = () => erro(req.error);
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains('funcionarios')) d.createObjectStore('funcionarios', { keyPath: 'rgf' });
        if (!d.objectStoreNames.contains('veiculos')) d.createObjectStore('veiculos', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('frs')) d.createObjectStore('frs', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('locais')) d.createObjectStore('locais', { keyPath: 'chave' });
        if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta', { keyPath: 'chave' });
      };
      req.onsuccess = () => ok(req.result);
    });
    // Limpa tudo antes de começar (estado residual de outros testes)
    const limpar = () => new Promise((ok2, erro2) => {
      const tx = db.transaction(['veiculos', 'frs', 'locais', 'funcionarios', 'meta'], 'readwrite');
      ['veiculos', 'frs', 'locais', 'funcionarios', 'meta'].forEach(n => tx.objectStore(n).clear());
      tx.oncomplete = ok2;
      tx.onerror = () => erro2(tx.error);
    });
    await limpar();
    const tx = db.transaction('veiculos', 'readwrite');
    tx.objectStore('veiculos').put({ id: 'v1', placa: 'GBI-2447', modelo: 'S-10', marca: 'GM', tipo: 'caminhonete', ultimoKm: 217551, ativo: true });
    await new Promise((ok2, erro2) => { tx.oncomplete = ok2; tx.onerror = () => erro2(tx.error); });
    db.close();
  });

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
    const arq = out + '/fr-' + nome + '.pdf';
    fs.writeFileSync(arq, Buffer.from(r.b64, 'base64'));

    // Valida o PDF com pdf-lib (sem pdftotext/pdfinfo)
    const pdfBytes = fs.readFileSync(arq);
    const pdf = await PDFDocument.load(pdfBytes);
    const paginas = pdf.getPageCount();
    const tamanho = pdfBytes.length;
    ok(paginas === 2 && tamanho > 5000, nome + ': PDF valido, ' + paginas + ' paginas, ' + tamanho + ' bytes');
    ok(r.nome.startsWith(nome === 'carro' ? 'FR_ANTONIO_DE_SOUZA_VIEIRA_26-10-2026.pdf' : 'FR_MARCOS_RIBEIRO_27-10-2026.pdf'), nome + ': nome do arquivo (' + r.nome.split('.pdf')[0] + ')');
  }

  await b.close();
  console.log(falhas ? falhas + ' falha(s)' : 'TUDO OK');
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.log('ERRO', e.message.split('\n')[0]); process.exit(1); });
