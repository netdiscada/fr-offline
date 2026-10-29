const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 400, height: 860 } });
  p.on('pageerror', e => console.log('pageerror', e.message));
  p.on('console', m => { if (/Content Security Policy|Refused/i.test(m.text())) console.log('CSP', m.text().slice(0, 250)); });
  await p.goto('http://localhost:8091/');
  await p.waitForFunction(() => window.FrPdf && window.FrImprimir);
  const r = await p.evaluate(async () => {
    await FrPdf.carregar();
    const fr = { data: '2026-10-26', condutor: 'ANTÔNIO DE SOUZA VIEIRA', rgf: '15487', cargo: 'ASG', placa: 'GBI-2447', modelo: 'S-10', marca: 'CHEVROLET', tombamento: '5G-1031',
      descricao: 'PINTURA DE GUIAS NA REGIONAL DIVISA', partida_km: '217551', partida_hora: '08:32', retorno_km: '217648', retorno_hora: '14:58', combustivel: '3/4', checklist: {},
      itinerario: [{ saida_km: '217551', saida_hora: '08:33', local: 'DIVISA', chegada_km: '217610', chegada_hora: '09:49' }] };
    localStorage.setItem('fr.guiaImpressao.v1', 'true');
    window.print = () => { window.__imprimiu = document.title; };
    await FR.gerarEMostrarPdf(fr);
    const nome = document.getElementById('folhaPdfTexto').textContent;
    const t0 = Date.now();
    document.getElementById('btnImprimirPdf').click();
    while (!window.__imprimiu && Date.now() - t0 < 20000) await new Promise(r => setTimeout(r, 100));
    return { nome, titulo: window.__imprimiu, ms: Date.now() - t0, imgs: document.querySelectorAll('#impressao img').length, baixar: document.getElementById('btnAbrirPdf').textContent };
  });
  console.log(JSON.stringify(r), 'CSP ativa:', await p.evaluate(() => !!document.querySelector('meta[http-equiv="Content-Security-Policy"]')));
  await p.emulateMedia({ media: 'print' });
  await p.pdf({ path: process.argv[2] + '/impresso.pdf', format: 'A4', printBackground: true, preferCSSPageSize: true });
  await b.close();
})();
