// FR Offline - geração de PDF 100% offline, sem dependências externas.
// Gera um PDF simples da ficha preenchida usando JS puro.
async function gerarPdf(fr) {
  // Helpers de PDF mínimo
  function escapePdf(s) {
    return String(s).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)').replace(/\n/g, '\\n');
  }

  const largura = 595.28; // A4 em pontos
  const altura = 841.89;
  const margem = 40;
  const yStart = altura - margem;

  const linhas = [];
  linhas.push('FR - Relatório Diário');
  linhas.push('Veículo: ' + (fr.veiculo && fr.veiculo.marca ? fr.veiculo.marca + ' ' + fr.veiculo.modelo : '') + ' - ' + (fr.veiculo && fr.veiculo.placa || ''));
  linhas.push('Tombamento: ' + (fr.veiculo && fr.veiculo.tombamento || ''));
  linhas.push('Condutor: ' + (fr.condutor || '') + '  RGF: ' + (fr.rgf || '') + '  Cargo: ' + (fr.cargo || ''));
  linhas.push('Data: ' + (fr.data || ''));
  linhas.push('Serviço: ' + (fr.descricao || ''));
  linhas.push('Saída: ' + (fr.partida_km || '') + ' km às ' + (fr.partida_hora || '') + ' | Portaria: ' + (fr.portaria_hora || ''));
  linhas.push('Combustível: ' + (fr.combustivel || ''));
  linhas.push('Retorno: ' + (fr.retorno_km || '') + ' km às ' + (fr.retorno_hora || ''));
  linhas.push('Defeitos: ' + (fr.defeitos || 'Nenhum'));
  linhas.push('Ocorrências: ' + (fr.ocorrencias || 'Nenhuma'));

  if (fr.itinerario && fr.itinerario.length) {
    linhas.push('Itinerário:');
    fr.itinerario.forEach((p, i) => {
      linhas.push('  ' + (i + 1) + '. ' + p.local + ' - chegada ' + p.chegada + ', saída ' + (p.saida || '—'));
    });
  }

  // Construir streams de conteúdo PDF
  const conteudo = [];
  conteudo.push('BT');
  conteudo.push('/F1 16 Tf');
  conteudo.push('1 0 0 1 ' + margem + ' ' + yStart + ' Tm');
  conteudo.push('(FR Offline - Relatório Diário) Tj');
  conteudo.push('ET');

  let y = yStart - 30;
  conteudo.push('BT');
  conteudo.push('/F1 10 Tf');
  conteudo.push('1 0 0 1 ' + margem + ' ' + y + ' Tm');
  let linhaAtual = '';
  for (const linha of linhas) {
    const texto = escapePdf(linha);
    conteudo.push('(' + texto + ') Tj');
    conteudo.push('0 -14 TD');
  }
  conteudo.push('ET');

  const conteudoStr = conteudo.join('\n');

  const pdf = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj

2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj

3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${largura} ${altura}] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>
endobj

4 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj

5 0 obj
<< /Length ${conteudoStr.length} >>
stream
${conteudoStr}
endstream
endobj

xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000074 00000 n 
0000000133 00000 n 
0000000242 00000 n 
0000000303 00000 n 
trailer
<< /Size 6 /Root 1 0 R >>
startxref
${1000 + conteudoStr.length}
%%EOF`;

  // Converter para ArrayBuffer
  const encoder = new TextEncoder();
  const bytes = encoder.encode(pdf);
  return new Blob([bytes], { type: 'application/pdf' });
}

global.gerarPdf = gerarPdf;
