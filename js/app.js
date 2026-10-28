// FR Offline - lógica principal do app (telas, navegação, cadastro, ficha)
(function (global) {
  const Db = global.FrDb;
  const VERSAO = '1.0.0';

  // ---------- util ----------
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  function mostrarTela(nome) {
    $$('.tela').forEach(t => t.hidden = true);
    const el = document.getElementById('tela-' + nome);
    if (el) el.hidden = false;
    document.body.dataset.tela = nome;
    const [t, s] = TITULOS[nome] || TITULOS.inicio;
    const tt = $('#topoTitulo');
    const ts = $('#topoSub');
    if (tt) tt.textContent = t;
    if (ts) ts.textContent = s || '';
  }

  const TITULOS = {
    carregando: ['Relatório Diário', ''],
    cadastro: ['Primeiro acesso', 'Seus dados e veículos'],
    inicio: ['Relatório Diário', 'Offline · Dados no seu celular'],
    ficha: ['Ficha completa', ''],
    encerrar: ['Encerrar o dia', ''],
  };

  // ---------- estado ----------
  let perfil = null;
  let veiculos = [];
  let frAtual = null;

  // ---------- aviso ----------
  function avisar(msg, tipo) {
    const t = $('#toast');
    if (!t) return;
    t.textContent = msg;
    t.className = 'aviso-flutuante toast' + (tipo ? ' ' + tipo : '');
    t.hidden = false;
    setTimeout(() => { t.hidden = true; }, 3000);
  }

  // ---------- botão voltar Android ----------
  function voltarUmPasso() {
    const folha = $$('.folha').find(f => !f.hidden);
    if (folha) { const fundo = folha.querySelector('[data-fechar]'); if (fundo) { fundo.click(); return true; } folha.hidden = true; return true; }
    if (!$('#btnVoltar').hidden) { $('#btnVoltar').click(); return true; }
    return false;
  }
  if (global.Capacitor && Capacitor.Plugins.App) {
    Capacitor.Plugins.App.addListener('backButton', () => { if (!voltarUmPasso()) Capacitor.Plugins.App.minimizeApp(); });
  } else {
    global.addEventListener('popstate', voltarUmPasso);
  }

  // ---------- cadastro ----------
  async function lerDadosIniciais() {
    try {
      perfil = await Db.lerPerfil();
    } catch (e) {
      console.warn('[FR] lerPerfil falhou:', e);
      perfil = null;
    }
    try {
      veiculos = await Db.lerVeiculos();
    } catch (e) {
      console.warn('[FR] lerVeiculos falhou:', e);
      veiculos = [];
    }
  }

  function montarListaVeiculos() {
    const el = $('#listaVeiculos');
    if (!el) return;
    if (veiculos.length === 0) {
      el.innerHTML = '';
      return;
    }
    el.innerHTML = veiculos.map(v => `
      <div class="chip" style="background:var(--cinza-claro);padding:6px 10px;border-radius:6px;margin:4px 0;display:flex;justify-content:space-between;align-items:center;">
        <span>${v.tombamento || ''} - ${v.marca || ''} ${v.modelo || ''} (${v.placa || ''})</span>
        <button class="btn-texto" data-excluir-veic="${v.id}">Remover</button>
      </div>
    `).join('');
    el.querySelectorAll('[data-excluir-veic]').forEach(b => {
      b.addEventListener('click', async () => {
        try {
          await Db.excluirVeiculo(b.dataset.excluirVeic);
          veiculos = await Db.lerVeiculos();
          montarListaVeiculos();
        } catch (e) { avisar('Erro ao remover veículo', 'erro'); }
      });
    });
  }

  $('#btnCadastroVeiculos').addEventListener('click', () => {
    $('#etapa-perfil').hidden = true;
    $('#etapa-veiculos').hidden = false;
  });

  $('#btnAddVeiculo').addEventListener('click', async () => {
    const v = {
      tombamento: $('#veicTombamento').value.trim(),
      marca: $('#veicMarca').value.trim(),
      modelo: $('#veicModelo').value.trim(),
      placa: $('#veicPlaca').value.trim().toUpperCase(),
      ativo: true,
    };
    if (!v.marca && !v.modelo && !v.placa) { avisar('Preencha ao menos marca, modelo ou placa', 'erro'); return; }
    try {
      await Db.salvarVeiculo(v);
      veiculos = await Db.lerVeiculos();
      montarListaVeiculos();
      $('#veicTombamento').value = ''; $('#veicMarca').value = ''; $('#veicModelo').value = ''; $('#veicPlaca').value = '';
    } catch (e) { avisar('Erro ao salvar veículo', 'erro'); }
  });

  $('#btnConcluirCadastro').addEventListener('click', async () => {
    const p = {
      rgf: $('#perfilRgf').value.trim(),
      nome: $('#perfilNome').value.trim(),
      cargo: $('#perfilCargo').value.trim(),
    };
    if (!p.rgf || !p.nome) { avisar('Preencha RGF e nome', 'erro'); return; }
    if (veiculos.length === 0) { avisar('Cadastre ao menos um veículo', 'erro'); return; }
    try {
      await Db.gravarPerfil(p);
      perfil = p;
      entrarApp();
    } catch (e) { avisar('Erro ao salvar cadastro', 'erro'); }
  });

  function entrarApp() {
    const mq = $('#menuQuem');
    if (mq) mq.textContent = `${perfil.nome} · RGF ${perfil.rgf} · ${perfil.cargo}`;
    mostrarTela('inicio');
    renderInicio();
  }

  // ---------- início ----------
  function renderInicio() {
    const el = $('#inicio');
    if (!el) return;
    let html = `
      <div class="cartao">
        <div class="cartao-corpo">
          <h3 class="secao">Veículos cadastrados</h3>
          ${veiculos.length === 0
            ? '<p style="color:var(--texto-sec);text-align:center">Nenhum veículo cadastrado</p>'
            : veiculos.map(v => `
              <div class="chip" style="background:var(--cinza-claro);padding:10px 12px;border-radius:8px;margin:6px 0;display:flex;justify-content:space-between;align-items:center;">
                <div>
                  <div style="font-weight:700">${v.marca || ''} ${v.modelo || ''}</div>
                  <div style="font-size:0.9rem;color:var(--texto-sec)">${v.tombamento || ''} · ${v.placa || ''}</div>
                </div>
                <button class="btn btn-principal" style="padding:8px 14px;font-size:0.9rem" data-iniciar-fr="${v.id}">Iniciar FR</button>
              </div>
            `).join('')
          }
        </div>
      </div>
    `;
    el.innerHTML = html;
    el.querySelectorAll('[data-iniciar-fr]').forEach(b => {
      b.addEventListener('click', () => iniciarFr(b.dataset.iniciarFr));
    });
  }

  function iniciarFr(veiculoId) {
    const v = veiculos.find(x => x.id === veiculoId);
    if (!v) return;
    frAtual = {
      id: Db.novoId('fr'),
      veiculoId: v.id,
      veiculo: { tombamento: v.tombamento, marca: v.marca, modelo: v.modelo, placa: v.placa },
      condutor: perfil.nome,
      rgf: perfil.rgf,
      cargo: perfil.cargo,
      data: new Date().toISOString().slice(0, 10),
      status: 'aberta',
      criadoEm: Date.now(),
      atualizadoEm: Date.now(),
      itinerario: [],
    };
    mostrarTela('ficha');
    renderFicha();
  }

  // ---------- ficha ----------
  function renderFicha() {
    if (!frAtual) return;
    const form = $('#form');
    if (!form) return;

    $('#fichaVeiculos').innerHTML = `
      <div class="chip" style="background:var(--cinza-claro);padding:8px 12px;border-radius:6px;">
        <strong>${frAtual.veiculo.marca || ''} ${frAtual.veiculo.modelo || ''}</strong><br>
        <span style="font-size:0.9rem;color:var(--texto-sec)">${frAtual.veiculo.tombamento || ''} · ${frAtual.veiculo.placa || ''}</span>
      </div>
    `;

    $('#fichaCondutor').innerHTML = `
      <div><span>Nome</span><b>${frAtual.condutor}</b></div>
      <div><span>RGF</span><b>${frAtual.rgf}</b></div>
      <div><span>Cargo</span><b>${frAtual.cargo}</b></div>
    `;

    preencherCampo('data', frAtual.data);
    preencherCampo('descricao', frAtual.descricao);
    preencherCampo('partida_km', frAtual.partida_km);
    preencherCampo('partida_hora', frAtual.partida_hora);
    preencherCampo('portaria_hora', frAtual.portaria_hora);
    preencherCampo('retorno_km', frAtual.retorno_km);
    preencherCampo('retorno_hora', frAtual.retorno_hora);
    preencherCampo('defeitos', frAtual.defeitos);
    preencherCampo('ocorrencias', frAtual.ocorrencias);

    if (frAtual.combustivel) {
      $$('[data-grupo="combustivel"] button').forEach(b => {
        const sel = b.dataset.valor === frAtual.combustivel;
        b.style.borderColor = sel ? 'var(--primario)' : 'var(--borda)';
        b.style.background = sel ? 'var(--primario)' : 'var(--fundo)';
        b.style.color = sel ? '#000' : 'var(--texto)';
      });
    }

    renderParadas();
    renderChecklist();
  }

  function preencherCampo(nome, valor) {
    const el = $('#form').querySelector('[name="' + nome + '"]');
    if (el && valor !== undefined && valor !== null) el.value = valor;
  }

  $$('#form [name]').forEach(el => {
    el.addEventListener('input', () => salvarFichaAtual());
  });

  $$('[data-grupo="combustivel"] button').forEach(b => {
    b.addEventListener('click', () => {
      frAtual.combustivel = b.dataset.valor;
      salvarFichaAtual();
      renderFicha();
    });
  });

  function salvarFichaAtual() {
    if (!frAtual) return;
    const dados = {};
    $$('#form [name]').forEach(el => {
      dados[el.name] = el.value;
    });
    Object.assign(frAtual, dados);
    frAtual.atualizadoEm = Date.now();
    Db.salvarFr(frAtual).catch(() => {});
  }

  function renderParadas() {
    const el = $('#paradas');
    if (!el) return;
    el.innerHTML = (frAtual.itinerario || []).map((p, i) => `
      <li>
        <strong>Parada ${i + 1}</strong> - ${p.local || ''} (${p.chegada || ''} → ${p.saida || ''})
      </li>
    `).join('') || '<li style="color:var(--texto-sec)">Nenhuma parada ainda</li>';
  }

  $('#btnParada').addEventListener('click', () => {
    const local = prompt('Nome do local da parada:');
    if (!local) return;
    const agora = new Date();
    const hh = String(agora.getHours()).padStart(2, '0');
    const mm = String(agora.getMinutes()).padStart(2, '0');
    frAtual.itinerario = frAtual.itinerario || [];
    frAtual.itinerario.push({ local, chegada: hh + ':' + mm, saida: '' });
    salvarFichaAtual();
    renderParadas();
  });

  function renderChecklist() {
    const el = $('#fichaChecklist');
    if (!el) return;
    const itens = [
      'Pneus (calibragem e desgaste)',
      'Óleo e fluídos',
      'Faróis e luzes',
      'Freios',
      'Espelhos retrovisores',
      'Cinto de segurança',
      'Extintor',
      'Triângulo e macaco',
    ];
    el.innerHTML = itens.map(item => `
      <label style="display:flex;align-items:center;gap:8px;margin:6px 0;">
        <input type="checkbox" name="check_${item}" ${frAtual.checklist && frAtual.checklist[item] ? 'checked' : ''}>
        <span>${item}</span>
      </label>
    `).join('');
    el.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      cb.addEventListener('change', () => {
        frAtual.checklist = frAtual.checklist || {};
        frAtual.checklist[cb.name.replace('check_', '')] = cb.checked;
        salvarFichaAtual();
      });
    });
  }

  // ---------- encerrar ----------
  $('#btnEncerrar').addEventListener('click', async () => {
    if (!frAtual) return;
    try {
      await Db.salvarFr(frAtual);
      frAtual.status = 'fechada';
      frAtual.fechadoEm = Date.now();
      await Db.salvarFr(frAtual);
      avisar('FR encerrada e salva no celular');
      mostrarTela('inicio');
      renderInicio();
      frAtual = null;
    } catch (e) { avisar('Erro ao encerrar FR', 'erro'); }
  });

  // ---------- PDF ----------
  $('#btnFichaPdf').addEventListener('click', async () => {
    if (!frAtual) return;
    try {
      await salvarFichaAtual();
      const pdf = await gerarPdf(frAtual);
      const blob = await pdf.output('blob');
      const url = URL.createObjectURL(blob);
      $('#folhaPdfTexto').textContent = 'FR de ' + (frAtual.veiculo.placa || 'veículo') + ' - ' + frAtual.data;
      $('#folhaPdf').hidden = false;
      $('#btnAbrirPdf').onclick = () => { window.open(url, '_blank'); };
      $('#btnCompartilharPdf').onclick = async () => {
        try { await navigator.share({ title: 'FR Offline', text: 'Relatório Diário', url }); }
        catch (e) { avisar('Não foi possível compartilhar', 'erro'); }
      };
      $('#btnImprimirPdf').onclick = () => { window.print(); };
    } catch (e) { avisar('Erro ao gerar PDF', 'erro'); }
  });

  // ---------- menu ----------
  $('#btnMenu').addEventListener('click', () => {
    $('#folhaMenu').hidden = false;
  });
  $$('[data-fechar]').forEach(b => {
    b.addEventListener('click', () => {
      const folha = b.closest('.folha');
      if (folha) folha.hidden = true;
    });
  });

  $('#btnMenuFicha').addEventListener('click', () => {
    $('#folhaMenu').hidden = true;
    if (frAtual) { mostrarTela('ficha'); renderFicha(); }
  });

  $('#btnMenuExportar').addEventListener('click', async () => {
    $('#folhaMenu').hidden = true;
    try {
      const dados = await Db.exportarTudo();
      const blob = new Blob([JSON.stringify(dados, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'fr-offline-backup-' + new Date().toISOString().slice(0, 10) + '.json';
      a.click();
      avisar('Backup exportado');
    } catch (e) { avisar('Erro ao exportar', 'erro'); }
  });

  $('#btnMenuImportar').addEventListener('click', async () => {
    $('#folhaMenu').hidden = true;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const texto = await file.text();
      try {
        const dados = JSON.parse(texto);
        await Db.importarTudo(dados);
        perfil = await Db.lerPerfil();
        veiculos = await Db.lerVeiculos();
        const mq = $('#menuQuem');
        if (mq) mq.textContent = `${perfil.nome} · RGF ${perfil.rgf} · ${perfil.cargo}`;
        renderInicio();
        avisar('Dados importados');
      } catch (err) { avisar('Arquivo inválido', 'erro'); }
    };
    input.click();
  });

  $('#btnMenuLimpar').addEventListener('click', async () => {
    $('#folhaMenu').hidden = true;
    if (!(await confirmar('Limpar tudo?', 'Isso apaga perfil, veículos e FRs deste celular. Não tem como desfazer.'))) return;
    try {
      await Db.limparTudo();
      perfil = null; veiculos = []; frAtual = null;
      mostrarTela('cadastro');
      montarListaVeiculos();
      avisar('Todos os dados foram apagados');
    } catch (e) { avisar('Erro ao limpar', 'erro'); }
  });

  $('#btnAnimacoes').addEventListener('click', () => {
    avisar('Animações desligadas nesta versão');
  });

  // ---------- confirma ----------
  function confirmar(titulo, texto) {
    return new Promise((ok) => {
      $('#confirmaTitulo').textContent = titulo;
      $('#confirmaTexto').textContent = texto;
      $('#folhaConfirma').hidden = false;
      $('#confirmaSim').onclick = () => { $('#folhaConfirma').hidden = true; ok(true); };
      $$('#folhaConfirma [data-fechar]').forEach(b => {
        b.onclick = () => { $('#folhaConfirma').hidden = true; ok(false); };
      });
    });
  }

  // ---------- versão ----------
  const v = $('#versao');
  if (v) v.textContent = 'FR Offline · v' + VERSAO;

  // ---------- iniciar ----------
  async function iniciar() {
    mostrarTela('carregando');
    await lerDadosIniciais();
    if (perfil && veiculos.length > 0) {
      entrarApp();
    } else {
      mostrarTela('cadastro');
      montarListaVeiculos();
    }
  }
  iniciar().catch(e => {
    console.error('[FR Offline] iniciar falhou:', e);
    // Mesmo com erro, mostra a tela de cadastro para o usuário não ficar travado
    mostrarTela('cadastro');
    montarListaVeiculos();
    avisar('Erro ao abrir. Tente preencher o cadastro mesmo assim.', 'erro');
  });

  global.FR = { mostrarTela, avisar, perfil: () => perfil, veiculos: () => veiculos, frAtual: () => frAtual };
})(window);
