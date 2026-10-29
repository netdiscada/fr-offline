// FR - lista de inspeção (OK / X), usada no "Começar o dia", no "Encerrar" e na ficha completa.
// Tudo começa em OK. Ao marcar X o funcionário escreve qual é o problema (vai para "Defeitos / Avarias").
// "Após os serviços" (abastecimento e limpeza) é diferente: começa em branco e só tem o X (= foi feito).

(function (global) {
  const { $$, escapar } = window.FR;
  const GRUPOS = window.FR_LAYOUT.pagina1.checklist;

  // opcoes: { grupos: [índices] (padrão todos), pendentes: { itemId: 'texto' }, aoMudar }
  function render(caixa, opcoes = {}) {
    const fr = window.FR.frFicha();
    const indices = opcoes.grupos || GRUPOS.map((_, i) => i);
    const pendentes = opcoes.pendentes || {};
    caixa.innerHTML = '';

    indices.forEach(gi => {
      const grupo = GRUPOS[gi];
      const cab = document.createElement('div');
      cab.className = 'grupo-cab';
      if (grupo.semDefeito) {
        cab.innerHTML = `<h3>${escapar(grupo.grupo)}</h3>`;
        caixa.appendChild(cab);
        const dica = document.createElement('p');
        dica.className = 'dica grupo-dica';
        dica.textContent = 'Marque X só no que foi feito (abasteceu, lavou). O resto fica em branco.';
        caixa.appendChild(dica);
        grupo.itens.forEach(it => {
          if (fr.checklist[it.id] === 'ok') delete fr.checklist[it.id]; // FR antiga: o OK era só o padrão
          const linha = document.createElement('div');
          linha.className = 'item item-so-x';
          linha.dataset.id = it.id;
          linha.innerHTML = `<span class="item-nome">${escapar(it.nome)}</span>` +
            '<span class="item-btns"><button type="button" data-v="x" aria-label="Foi feito">X</button></span>';
          // Tocar de novo no X desmarca
          linha.addEventListener('click', e => {
            if (!e.target.closest('button[data-v]')) return;
            if (fr.checklist[it.id] === 'x') delete fr.checklist[it.id];
            else fr.checklist[it.id] = 'x';
            marcar(caixa);
            if (opcoes.aoMudar) opcoes.aoMudar();
          });
          caixa.appendChild(linha);
        });
        return;
      }
      cab.innerHTML = `<h3>${escapar(grupo.grupo)}</h3><button type="button" class="tudo-ok">Tudo OK</button>`;
      cab.querySelector('button').addEventListener('click', () => {
        // "Tudo OK" não apaga um X já marcado
        grupo.itens.forEach(it => { if (fr.checklist[it.id] !== 'x') fr.checklist[it.id] = 'ok'; });
        marcar(caixa);
        if (opcoes.aoMudar) opcoes.aoMudar();
      });
      caixa.appendChild(cab);

      grupo.itens.forEach(it => {
        const linha = document.createElement('div');
        linha.className = 'item';
        linha.dataset.id = it.id;
        const pend = pendentes[it.id];
        linha.innerHTML = `<span class="item-nome">${escapar(it.nome)}${pend ? `<small class="item-pend">${escapar(pend)}</small>` : ''}</span>` +
          '<span class="item-btns"><button type="button" data-v="ok" aria-label="Em ordem">OK</button>' +
          '<button type="button" data-v="x" aria-label="Com problema">X</button></span>';
        linha.addEventListener('click', e => {
          const b = e.target.closest('button[data-v]');
          if (!b) return;
          fr.checklist[it.id] = b.dataset.v;
          if (b.dataset.v === 'ok' && fr.defeitosItens) delete fr.defeitosItens[it.id];
          marcar(caixa);
          if (opcoes.aoMudar) opcoes.aoMudar();
          if (b.dataset.v === 'x' && window.FR.ehDefeito(it.id)) descrever(it, caixa, opcoes);
        });
        caixa.appendChild(linha);
      });
    });
    marcar(caixa);
  }

  // Pergunta qual é o problema do item marcado com X
  function descrever(it, caixa, opcoes) {
    const F = window.FR;
    const fr = F.frFicha();
    fr.defeitosItens = fr.defeitosItens || {};
    F.folhaForm({
      titulo: it.nome,
      botao: 'Salvar',
      html: `<label class="campo"><span>Qual é o problema?</span>
        <textarea id="clDefeito" rows="3" autocapitalize="sentences" placeholder="Ex.: farol dianteiro esquerdo queimado">${escapar(fr.defeitosItens[it.id] || '')}</textarea></label>
        <p class="dica">Vai para "Defeitos / Avarias" da FR. Se não souber explicar, pode salvar em branco e completar depois na ficha completa.</p>`,
      aoAbrir: () => setTimeout(() => document.getElementById('clDefeito').focus(), 250),
      aoOk: () => {
        const texto = document.getElementById('clDefeito').value.trim();
        if (texto) fr.defeitosItens[it.id] = texto;
        else delete fr.defeitosItens[it.id];
        marcar(caixa);
        if (opcoes.aoMudar) opcoes.aoMudar();
      },
    });
  }

  function marcar(caixa) {
    const fr = window.FR.frFicha();
    const d = fr.defeitosItens || {};
    $$('.item', caixa).forEach(linha => {
      const v = fr.checklist[linha.dataset.id] || '';
      $$('button[data-v]', linha).forEach(b => {
        b.classList.toggle('ativo', b.dataset.v === v);
        b.setAttribute('aria-pressed', b.dataset.v === v);
      });
      // Descrição do problema embaixo do item (tocar no X de novo corrige)
      let desc = linha.querySelector('.item-defeito');
      const texto = v === 'x' && window.FR.ehDefeito(linha.dataset.id) ? (d[linha.dataset.id] || 'Sem descrição (toque no X para descrever)') : '';
      if (texto && !desc) {
        desc = document.createElement('small');
        desc.className = 'item-pend item-defeito';
        linha.querySelector('.item-nome').appendChild(desc);
      }
      if (desc) { desc.textContent = texto; desc.hidden = !texto; }
    });
  }


  // Quantos itens dos grupos informados ainda estão sem marcação
  function faltando(indices) {
    const fr = window.FR.frFicha();
    return indices.filter(i => !GRUPOS[i].semDefeito).flatMap(i => GRUPOS[i].itens).filter(it => !fr.checklist[it.id]).length;
  }

  window.FrChecklist = { render, faltando };
})(window);
