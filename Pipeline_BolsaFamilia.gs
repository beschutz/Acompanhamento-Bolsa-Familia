/**
 * 🏭 PIPELINE COMPLETO — CRIAÇÃO DE PLANILHAS POR UNIDADE DE SAÚDE
 *
 * Fluxo orquestrado em três etapas sequenciais:
 *
 *   1. etapaCriarPlanilhasPorUnidade()
 *      Lê a planilha consolidada (saída do script Python), agrupa pacientes
 *      por Unidade de Saúde e cria uma planilha formatada para cada unidade
 *      a partir do template definido em Config_Pipeline.gs.
 *
 *   2. etapaDistribuirPorRegiao()
 *      Para cada planilha criada na etapa anterior, determina a região
 *      (LESTE / NORTE / OESTE / SUL) pelo dicionário de palavras-chave e
 *      move o arquivo para a pasta regional correspondente.
 *
 *   3. etapaCorrigirValidacoes()
 *      Percorre todas as planilhas nas pastas regionais e (re)aplica as
 *      regras de validação de dados do template, sem apagar o conteúdo
 *      já preenchido pelas equipes de saúde.
 *
 * Cada etapa é idempotente: usa checkpoints (PropertiesService) para
 * retomar de onde parou após um timeout, sem criar duplicatas.
 *
 * Pré-requisitos:
 *   - Config_Pipeline.gs preenchido (IDs de pastas, template, vigência)
 *   - Utils_Pipeline.gs carregado (funções auxiliares)
 *   - ConstrutorPlanilhas.gs carregado (construtor_criarPlanilha, etc.)
 */

// =============================================================================
// ORQUESTRADOR PRINCIPAL
// =============================================================================

/**
 * Executa o pipeline completo (3 etapas) em sequência.
 * Interrompe e reporta se qualquer etapa precisar de múltiplas rodadas.
 * @returns {string} Mensagem de status.
 */
function runPipelineCompleto() {
  logPadrao('PIPELINE', 'Iniciando pipeline completo...');

  // ── Garantir espaço na quota antes de iniciar ────────────────────────────
  // Se a quota estiver perto do limite, limpa checkpoints e dados de alto volume
  // para evitar o erro "property storage quota exceeded" durante a execução.
  _pipeline_garantirQuotaDisponivel_();

  // ── Auto-reset quando todas as etapas já estão CONCLUIDAS ────────────────
  // Indica que um ciclo anterior terminou com sucesso. Limpa os checkpoints
  // automaticamente para que o novo ciclo reprocesse tudo do zero.
  const keys = CONFIG_PIPELINE.checkpointKeys;
  const cpCriar      = loadCheckpoint(keys.criar);
  const cpDistribuir = loadCheckpoint(keys.distribuir);
  const cpValidacoes = loadCheckpoint(keys.validacoes);
  const todasConcluidas =
    cpCriar      && cpCriar.fase      === 'CONCLUIDO' &&
    cpDistribuir && cpDistribuir.fase === 'CONCLUIDO' &&
    cpValidacoes && cpValidacoes.fase === 'CONCLUIDO';

  if (todasConcluidas) {
    logPadrao('PIPELINE', 'Ciclo anterior já concluído — reiniciando checkpoints para novo ciclo.', 'AVISO');
    clearAllPipelineCheckpoints();
  }

  const r1 = etapaCriarPlanilhasPorUnidade();
  if (!r1.concluido) {
    logPadrao('PIPELINE', 'Etapa 1 pausada. Reexecute para continuar.', 'AVISO');
    return r1.msg;
  }
  logPadrao('PIPELINE', 'Etapa 1 concluída: ' + r1.msg);

  const r2 = etapaDistribuirPorRegiao();
  if (!r2.concluido) {
    logPadrao('PIPELINE', 'Etapa 2 pausada. Reexecute para continuar.', 'AVISO');
    return r2.msg;
  }
  logPadrao('PIPELINE', 'Etapa 2 concluída: ' + r2.msg);

  const r3 = etapaCorrigirValidacoes();
  if (!r3.concluido) {
    logPadrao('PIPELINE', 'Etapa 3 pausada. Reexecute para continuar.', 'AVISO');
    return r3.msg;
  }
  logPadrao('PIPELINE', 'Etapa 3 concluída: ' + r3.msg);

  logPadrao('PIPELINE', '🎉 Pipeline completo finalizado com sucesso!');
  return 'Pipeline completo finalizado com sucesso!';
}

/**
 * Verifica se a quota de ScriptProperties está próxima do limite (> 80 %).
 * Se estiver, executa uma limpeza automática de dados de alto volume
 * (checkpoints legados, templates, log de auditoria) para garantir espaço.
 * @private
 */
function _pipeline_garantirQuotaDisponivel_() {
  try {
    const info = getScriptPropertiesUsageInfo();
    const LIMITE_ALERTA = 0.80; // 80 % da quota de 500 KB
    const uso = info.totalBytes / (info.quotaKB * 1024);

    if (uso > LIMITE_ALERTA) {
      logPadrao('PIPELINE',
        'Quota de propriedades em ' + info.percentual + ' (' + info.totalKB + ' KB / ' + info.quotaKB + ' KB). ' +
        'Iniciando limpeza automática para liberar espaço…', 'AVISO');
      limparPropertiesEmergencia(true); // mantém estatísticas, remove dados de alto volume
      const infoPos = getScriptPropertiesUsageInfo();
      logPadrao('PIPELINE',
        'Quota após limpeza: ' + infoPos.totalKB + ' KB / ' + info.quotaKB + ' KB (' + infoPos.percentual + ').');
    }
  } catch (e) {
    // Falha no diagnóstico não deve travar o pipeline
    logPadrao('PIPELINE', 'Aviso: não foi possível verificar quota de propriedades — ' + e.message, 'AVISO');
  }
}

// =============================================================================
// ETAPA 1 — CRIAR PLANILHAS POR UNIDADE
// =============================================================================

/**
 * Lê a planilha consolidada, agrupa por unidade e cria uma planilha para
 * cada unidade (com layout do template) na pasta de origem configurada.
 *
 * Idempotência: armazena no checkpoint um mapa {nomeUnidade → ssId}.
 * Se já existir entrada para a unidade, ela é pulada.
 *
 * @returns {{ concluido: boolean, msg: string, criadas: number }}
 */
function etapaCriarPlanilhasPorUnidade() {
  const MOD = 'CRIAR';
  const cfg = CONFIG_PIPELINE;
  const cpKey = cfg.checkpointKeys.criar;
  const budget = withTimeBudget(Date.now());

  // ── Carregar ou inicializar checkpoint ────────────────────────────────────
  let cp = loadCheckpoint(cpKey) || { fase: 'MAPEAMENTO', lista: [], indice: 0, criadas: {} };

  // ── Migração: checkpoint legado armazena objetos { nome, pacientes } em lista ─
  // Converte para o formato enxuto (apenas nomes) para liberar quota de propriedades.
  if (cp.lista.length > 0 && typeof cp.lista[0] === 'object' && cp.lista[0] !== null &&
      cp.lista[0].pacientes !== undefined) {
    logPadrao(MOD, 'Checkpoint legado detectado (contém dados de pacientes). Migrando para formato compacto…', 'AVISO');
    cp.lista = cp.lista.map(function(item) { return item.nome || ''; }).filter(Boolean);
    saveCheckpoint(cpKey, cp);
    logPadrao(MOD, 'Migração de checkpoint concluída. Quota liberada.');
  }

  if (cp.fase === 'MAPEAMENTO') {
    logPadrao(MOD, 'Carregando dados da planilha consolidada...');

    if (!cfg.idPlanilhaConsolidada) {
      logPadrao(MOD, 'idPlanilhaConsolidada não configurado em Config_Pipeline.gs.', 'ERRO');
      return { concluido: false, msg: 'Erro: idPlanilhaConsolidada não configurado.' };
    }

    const ss = SpreadsheetApp.openById(cfg.idPlanilhaConsolidada);
    const aba = ss.getSheetByName(cfg.nomeAbaConsolidada);
    if (!aba) {
      logPadrao(MOD, 'Aba "' + cfg.nomeAbaConsolidada + '" não encontrada.', 'ERRO');
      return { concluido: false, msg: 'Erro: aba "' + cfg.nomeAbaConsolidada + '" não encontrada.' };
    }

    const dados = aba.getDataRange().getDisplayValues();
    if (dados.length < 2) {
      logPadrao(MOD, 'Planilha consolidada sem dados.', 'ERRO');
      return { concluido: false, msg: 'Erro: planilha consolidada sem dados.' };
    }

    // ── Mapeamento dinâmico por cabeçalho (robusto a reordenação de colunas) ──
    const headerRow = dados[0];
    const colIdx = _pipeline_mapearColunasPorCabecalho_(headerRow, cfg.colunasConsolidada, MOD);
    const colUN = colIdx.NOME_UNIDADE;
    if (colUN === undefined || colUN === null) {
      logPadrao(MOD, 'Coluna NOME_UNIDADE não encontrada no cabeçalho da planilha consolidada.', 'ERRO');
      return { concluido: false, msg: 'Erro: coluna NOME_UNIDADE não encontrada.' };
    }

    const linhas = dados.slice(1); // Remove cabeçalho

    // Extrai apenas os nomes de unidades (sem dados de pacientes).
    // Os dados de pacientes são carregados sob demanda durante o PROCESSAMENTO
    // para evitar estouro da quota de armazenamento de propriedades (500 KB).
    const nomesVistos = {};
    const nomesOrdenados = [];
    for (const l of linhas) {
      const nome = String(l[colUN] || '').trim();
      if (nome && !nomesVistos[nome]) {
        nomesVistos[nome] = true;
        nomesOrdenados.push(nome);
      }
    }

    cp.lista   = nomesOrdenados; // Apenas strings — NÃO armazena dados de pacientes
    cp.indice  = 0;
    cp.criadas = {};
    cp.fase    = 'PROCESSAMENTO';
    cp.colIdx  = colIdx; // Persiste o mapeamento no checkpoint
    saveCheckpoint(cpKey, cp);

    logPadrao(MOD, cp.lista.length + ' unidades mapeadas.');
  }

  if (cp.fase === 'PROCESSAMENTO') {
    // Carregar template uma vez
    let tpl;
    try {
      tpl = (cfg.templateId === '__padrao__')
        ? construtor_templatePadrao()
        : construtor_carregarTemplate(cfg.templateId);
    } catch (e) {
      logPadrao(MOD, 'Erro ao carregar template: ' + e.message, 'ERRO');
      return { concluido: false, msg: 'Erro ao carregar template: ' + e.message };
    }

    const pastaOrigem = cfg.pastaOrigemId
      ? DriveApp.getFolderById(cfg.pastaOrigemId)
      : DriveApp.getRootFolder();

    // Mapeamento de colunas do checkpoint (garante consistência entre rodadas)
    const colIdx = cp.colIdx || cfg.colunasConsolidada;

    // Cache em memória dos dados da planilha consolidada agrupados por unidade.
    // Carregado uma única vez por execução — NÃO é persistido em propriedades.
    let gruposPacientes = null;

    function _obterPacientesDaUnidade_(nomeUnidade) {
      if (!gruposPacientes) {
        if (!cfg.idPlanilhaConsolidada) throw new Error('idPlanilhaConsolidada não configurado.');
        const ss  = SpreadsheetApp.openById(cfg.idPlanilhaConsolidada);
        const aba = ss.getSheetByName(cfg.nomeAbaConsolidada);
        if (!aba) throw new Error('Aba "' + cfg.nomeAbaConsolidada + '" não encontrada.');
        const linhasComHeader = aba.getDataRange().getDisplayValues();
        const linhas = linhasComHeader.slice(1);
        const colUN  = colIdx.NOME_UNIDADE;
        gruposPacientes = {};
        for (const l of linhas) {
          const nome = String(l[colUN] || '').trim();
          if (nome) {
            if (!gruposPacientes[nome]) gruposPacientes[nome] = [];
            gruposPacientes[nome].push(l);
          }
        }
      }
      return gruposPacientes[nomeUnidade] || [];
    }

    while (cp.indice < cp.lista.length) {
      if (budget.exceeded()) {
        saveCheckpoint(cpKey, cp);
        const msg = 'Pausa de segurança [' + cp.indice + '/' + cp.lista.length + ']. Reexecute para continuar.';
        logPadrao(MOD, msg, 'AVISO');
        return { concluido: false, msg: msg, criadas: Object.keys(cp.criadas).length };
      }

      const nomeUnidade = cp.lista[cp.indice];
      logPadrao(MOD, '[' + (cp.indice + 1) + '/' + cp.lista.length + '] Processando: ' + nomeUnidade);

      // Idempotência: pula apenas unidades criadas COM SUCESSO.
      // Unidades com erro anterior (valor começa com 'ERRO:') são reprocessadas.
      const registroAnterior = cp.criadas[nomeUnidade];
      const jaCriadaComSucesso = registroAnterior && !String(registroAnterior).startsWith('ERRO:');

      if (!jaCriadaComSucesso) {
        try {
          const pacientes = _obterPacientesDaUnidade_(nomeUnidade);
          const ssId = _pipeline_criarPlanilhaUnidade(nomeUnidade, pacientes, tpl, pastaOrigem, cfg, colIdx);
          cp.criadas[nomeUnidade] = ssId;
          logPadrao(MOD, 'Planilha criada: ' + nomeUnidade + ' (' + ssId + ')');
        } catch (e) {
          logPadrao(MOD, 'Erro em "' + nomeUnidade + '": ' + e.message, 'ERRO');
          // Registra o erro mas continua para não travar o pipeline.
          // Na próxima execução a unidade será reprocessada automaticamente.
          cp.criadas[nomeUnidade] = 'ERRO:' + e.message;
        }
      } else {
        logPadrao(MOD, 'Já criada (checkpoint): ' + nomeUnidade);
      }

      cp.indice++;
      saveCheckpoint(cpKey, cp);
    }

    cp.fase = 'CONCLUIDO';
    saveCheckpoint(cpKey, cp);
  }

  const totalCriadas = Object.values(cp.criadas).filter(function(v) { return !String(v).startsWith('ERRO:'); }).length;
  logPadrao(MOD, 'Etapa concluída. Planilhas criadas: ' + totalCriadas + '/' + cp.lista.length);
  return { concluido: true, msg: totalCriadas + ' planilhas criadas.', criadas: totalCriadas };
}

/**
 * Constrói mapeamento nome-de-coluna → índice lendo o cabeçalho real da planilha.
 * Faz correspondência case-insensitive e com normalização de espaços.
 * Emite log de aviso para colunas esperadas que não forem encontradas, e
 * usa o índice fixo do cfg como fallback para manter compatibilidade.
 *
 * @param {Array<string>} headerRow   Primeira linha da planilha consolidada.
 * @param {Object}        cfgColunas  Objeto de índices fixos de Config_Pipeline.gs.
 * @param {string}        mod         Prefixo de log.
 * @returns {Object}  Mapeamento { NOME_COLUNA → índice_numérico }.
 * @private
 */
function _pipeline_mapearColunasPorCabecalho_(headerRow, cfgColunas, mod) {
  // Normaliza um nome de coluna: maiúsculas, sem acentos, espaços → sublinhado
  function norm(s) {
    return String(s || '')
      .trim()
      .toUpperCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, '_');
  }

  // Monta índice invertido: nome_normalizado → posição
  const headerNorm = headerRow.map(norm);

  const resultado = {};
  for (const chave in cfgColunas) {
    // Tenta encontrar pelo nome exato normalizado
    const idx = headerNorm.indexOf(norm(chave));
    if (idx >= 0) {
      resultado[chave] = idx;
    } else {
      // Fallback: usa índice fixo do config mas emite aviso
      const fallback = cfgColunas[chave];
      resultado[chave] = fallback;
      logPadrao(mod,
        'Coluna "' + chave + '" não encontrada no cabeçalho da planilha consolidada. ' +
        'Usando índice fixo ' + fallback + ' como fallback. ' +
        'Cabeçalho encontrado: [' + headerRow.slice(0, 20).join(', ') + ']',
        'AVISO');
    }
  }
  return resultado;
}

/**
 * Cria uma única planilha para a unidade, aplica o template e escreve os
 * dados dos pacientes em batch.
 * @private
 */
function _pipeline_criarPlanilhaUnidade(nomeUnidade, pacientes, tpl, pastaOrigem, cfg, colIdx) {
  // colIdx: mapeamento dinâmico por cabeçalho (pode ser igual a cfg.colunasConsolidada)
  const cols = colIdx || cfg.colunasConsolidada;

  // ── Determina pasta de destino ──────────────────────────────────────────
  // Prioridade: 1) pastasUnidades[nomeUnidade]  2) pastaOrigem (regional depois)
  let pastaDestino = pastaOrigem;
  const pastasUnidades = cfg.pastasUnidades || {};
  const pastaUnidadeId = pastasUnidades[nomeUnidade];
  if (pastaUnidadeId) {
    try {
      pastaDestino = DriveApp.getFolderById(pastaUnidadeId);
      logPadrao('CRIAR', 'Pasta específica da unidade encontrada para "' + nomeUnidade + '".');
    } catch (e) {
      logPadrao('CRIAR',
        'Pasta específica configurada para "' + nomeUnidade + '" (ID: ' + pastaUnidadeId +
        ') não acessível. Usando pasta de origem padrão. Erro: ' + e.message, 'AVISO');
    }
  } else if (Object.keys(pastasUnidades).length > 0) {
    // Mapeamento existe mas não tem entry para esta unidade → aviso, usa fallback
    logPadrao('CRIAR',
      'Nenhuma pasta específica configurada para a unidade "' + nomeUnidade +
      '". Usando pasta de origem padrão.', 'AVISO');
  }

  // Cria nova planilha na pasta de destino
  const ss = SpreadsheetApp.create(nomeUnidade);
  const ssId = ss.getId();

  // Move para a pasta de destino (por padrão fica em "Meu Drive")
  const file = DriveApp.getFileById(ssId);
  if (pastaDestino.getId() !== DriveApp.getRootFolder().getId()) {
    pastaDestino.addFile(file);
    DriveApp.getRootFolder().removeFile(file);
  } else if (cfg.pastaOrigemId) {
    pastaOrigem.addFile(file);
    DriveApp.getRootFolder().removeFile(file);
  }

  // Aplica o template de layout (layout, validações, formatação condicional)
  construtor_criarPlanilha(tpl, ssId, cfg.nomeAbaVigencia);

  // Reabre para escrever os dados (construtor_criarPlanilha já fez flush)
  const sheet = SpreadsheetApp.openById(ssId).getSheetByName(cfg.nomeAbaVigencia);
  if (!sheet) {
    // A aba não foi encontrada pelo nome configurado em nomeAbaVigencia.
    // Causa mais comum: o template usa um nomeAba diferente do que está em
    // Config_Pipeline.gs (nomeAbaVigencia). Verifique se ambos coincidem.
    const abasExistentes = SpreadsheetApp.openById(ssId).getSheets().map(function(s) { return s.getName(); });
    logPadrao('CRIAR',
      'Aba "' + cfg.nomeAbaVigencia + '" não encontrada em "' + nomeUnidade + '" após criação. ' +
      'Abas existentes: [' + abasExistentes.join(', ') + ']. ' +
      'Verifique se nomeAbaVigencia em Config_Pipeline.gs coincide com o nomeAba do template no Construtor.',
      'ERRO');
    return ssId; // planilha criada mas sem dados
  }

  // Linha de início dos dados = faixas + bloco-títulos + cabeçalho + 1
  const linhaInicio = (tpl.config.faixas || []).length + 3;

  // Monta a matriz de dados para escrita em batch.
  // A ordem das colunas deve coincidir exatamente com o template padrão
  // definido em ConstrutorPlanilhas.gs (bloco_identificacao → bloco_acomp_us
  // → bloco_criancas → bloco_gestantes → bloco_contato → bloco_extras).
  const matriz = pacientes.map(function(l) {
    return [
      l[cols.NIS]           || '',  // Col  1: NIS
      l[cols.CPF]           || '',  // Col  2: CPF
      l[cols.NOME_PACIENTE] || '',  // Col  3: NOME
      l[cols.DATA_NASC]     || '',  // Col  4: DATA NASCIMENTO
      '',                            // Col  5: ACOMP. NA US (a preencher pela equipe)
      l[cols.DATA_ACOMP]    || '',  // Col  6: DATA ACOMPANHAMENTO
      l[cols.PESO]          || '',  // Col  7: PESO (kg)
      l[cols.ALTURA]        || '',  // Col  8: ALTURA (cm)
      l[cols.VACINACAO]     || '',  // Col  9: VACINA
      '',                            // Col 10: MOTIVO NÃO VACINAÇÃO (vazio)
      l[cols.GESTANTE]      || '',  // Col 11: GESTANTE
      l[cols.DUM]           || '',  // Col 12: DUM
      l[cols.PRE_NATAL]     || '',  // Col 13: PRÉ-NATAL
      '',                            // Col 14: TELEFONE (vazio)
      '',                            // Col 15: ENDEREÇO (vazio)
      '',                            // Col 16: ACOMP. NO E-GESTOR (a preencher)
      ''                             // Col 17: OBSERVAÇÕES (vazio)
    ];
  });

  if (matriz.length > 0) {
    // Garante linhas suficientes
    const maxRows = sheet.getMaxRows();
    const needed  = linhaInicio - 1 + matriz.length;
    if (needed > maxRows) {
      sheet.insertRowsAfter(maxRows, needed - maxRows);
    }

    // Escrita em batch (minimiza chamadas de API)
    sheet.getRange(linhaInicio, 1, matriz.length, matriz[0].length)
      .setNumberFormat('@')  // Texto → preserva zeros à esquerda
      .setValues(matriz);

    // Altura das linhas de dados
    const altDados = (tpl.config.alturaLinhasDados || 21);
    for (let r = linhaInicio; r < linhaInicio + matriz.length; r++) {
      sheet.setRowHeight(r, altDados);
    }
  }

  SpreadsheetApp.flush();
  return ssId;
}

// =============================================================================
// ETAPA 2 — DISTRIBUIR POR REGIÃO
// =============================================================================

/**
 * Para cada planilha criada pela etapa 1, determina a região pela
 * correspondência de palavras-chave e move o arquivo para a pasta regional.
 * Registra unidades não reconhecidas para auditoria.
 *
 * @returns {{ concluido: boolean, msg: string, movidas: number, naoReconhecidas: string[] }}
 */
function etapaDistribuirPorRegiao() {
  const MOD = 'DISTRIBUIR';
  const cfg = CONFIG_PIPELINE;
  const cpKey = cfg.checkpointKeys.distribuir;
  const budget = withTimeBudget(Date.now());

  let cp = loadCheckpoint(cpKey) || { fase: 'MAPEAMENTO', lista: [], indice: 0, movidas: 0, naoReconhecidas: [] };

  if (cp.fase === 'MAPEAMENTO') {
    // Usa o checkpoint da etapa 1 para obter a lista de planilhas criadas
    const cpCriar = loadCheckpoint(cfg.checkpointKeys.criar);
    if (!cpCriar || !cpCriar.criadas) {
      return { concluido: false, msg: 'Etapa 1 (criar) não concluída. Execute-a primeiro.' };
    }

    // Monta lista: [{ nome, ssId }] — exclui itens com erro
    cp.lista = Object.entries(cpCriar.criadas)
      .filter(function(e) { return !String(e[1]).startsWith('ERRO:'); })
      .map(function(e) { return { nome: e[0], ssId: e[1], movida: false }; });

    cp.indice = 0;
    cp.movidas = 0;
    cp.naoReconhecidas = [];
    cp.fase = 'PROCESSAMENTO';
    saveCheckpoint(cpKey, cp);
    logPadrao(MOD, cp.lista.length + ' planilhas para distribuir.');
  }

  if (cp.fase === 'PROCESSAMENTO') {
    while (cp.indice < cp.lista.length) {
      if (budget.exceeded()) {
        saveCheckpoint(cpKey, cp);
        const msg = 'Pausa de segurança [' + cp.indice + '/' + cp.lista.length + ']. Reexecute para continuar.';
        logPadrao(MOD, msg, 'AVISO');
        return { concluido: false, msg: msg, movidas: cp.movidas, naoReconhecidas: cp.naoReconhecidas };
      }

      const item = cp.lista[cp.indice];
      logPadrao(MOD, '[' + (cp.indice + 1) + '/' + cp.lista.length + '] ' + item.nome);

      if (!item.movida) {
        const regiao = _pipeline_determinarRegiao(item.nome, cfg.dicionarioRegioes);

        if (!regiao) {
          logPadrao(MOD, 'Região não reconhecida: "' + item.nome + '"', 'AVISO');
          if (cp.naoReconhecidas.indexOf(item.nome) < 0) {
            cp.naoReconhecidas.push(item.nome);
          }
        } else {
          try {
            _pipeline_moverParaRegiao(item.ssId, regiao, cfg.pastasRegionais);
            cp.lista[cp.indice].movida = true;
            cp.lista[cp.indice].folderId = (cfg.pastasRegionais || {})[regiao] || '';
            cp.movidas++;
            logPadrao(MOD, '"' + item.nome + '" → ' + regiao);
          } catch (e) {
            logPadrao(MOD, 'Erro ao mover "' + item.nome + '": ' + e.message, 'ERRO');
          }
        }
      } else {
        logPadrao(MOD, 'Já movida (checkpoint): ' + item.nome);
      }

      cp.indice++;
      saveCheckpoint(cpKey, cp);
    }

    cp.fase = 'CONCLUIDO';
    saveCheckpoint(cpKey, cp);
  }

  if (cp.naoReconhecidas.length > 0) {
    logPadrao(MOD, 'Unidades não reconhecidas (' + cp.naoReconhecidas.length + '): ' +
      cp.naoReconhecidas.join(' | '), 'AVISO');
  }

  logPadrao(MOD, 'Etapa concluída. Movidas: ' + cp.movidas + '. Não reconhecidas: ' + cp.naoReconhecidas.length);
  return {
    concluido: true,
    msg: cp.movidas + ' planilhas distribuídas. Não reconhecidas: ' + cp.naoReconhecidas.length,
    movidas: cp.movidas,
    naoReconhecidas: cp.naoReconhecidas
  };
}

/**
 * Determina a região de uma unidade pelo dicionário de palavras-chave.
 * @param {string} nomeUnidade
 * @param {Object} dicionario  { REGIAO: [string, ...] }
 * @returns {string|null}      Nome da região ou null se não reconhecida.
 * @private
 */
function _pipeline_determinarRegiao(nomeUnidade, dicionario) {
  const nomeNorm = normalizarTextoSemAcento(nomeUnidade);
  for (const regiao in dicionario) {
    const termos = dicionario[regiao];
    for (const termo of termos) {
      if (nomeNorm.indexOf(normalizarTextoSemAcento(termo)) >= 0) {
        return regiao;
      }
    }
  }
  return null;
}

/**
 * Move o arquivo Drive da planilha para a pasta regional correspondente.
 * @private
 */
function _pipeline_moverParaRegiao(ssId, regiao, pastasRegionais) {
  const pastaId = (pastasRegionais || {})[regiao];
  if (!pastaId) {
    throw new Error('Pasta regional "' + regiao + '" não configurada em Config_Pipeline.gs.');
  }

  const file    = DriveApp.getFileById(ssId);
  const destino = DriveApp.getFolderById(pastaId);

  // Adiciona à pasta de destino
  destino.addFile(file);

  // Remove de todas as pastas anteriores (exceto destino)
  const parents = file.getParents();
  while (parents.hasNext()) {
    const p = parents.next();
    if (p.getId() !== pastaId) {
      p.removeFile(file);
    }
  }
}

// =============================================================================
// ETAPA 3 — CORRIGIR VALIDAÇÕES
// =============================================================================

/**
 * Percorre todas as planilhas nas pastas regionais e (re)aplica as regras
 * de validação de dados do template, SEM apagar dados existentes.
 *
 * Útil para corrigir validações após adição de linhas manuais ou
 * quando a vigência anterior usava um conjunto diferente de opções.
 *
 * @returns {{ concluido: boolean, msg: string, corrigidas: number }}
 */
function etapaCorrigirValidacoes() {
  const MOD = 'VALIDACOES';
  const cfg = CONFIG_PIPELINE;
  const cpKey = cfg.checkpointKeys.validacoes;
  const budget = withTimeBudget(Date.now());

  let cp = loadCheckpoint(cpKey) || { fase: 'MAPEAMENTO', lista: [], indice: 0, corrigidas: 0 };

  if (cp.fase === 'MAPEAMENTO') {
    logPadrao(MOD, 'Mapeando planilhas nas pastas regionais...');

    const arquivos = [];
    const regioes = Object.keys(cfg.pastasRegionais);
    const blacklist = typeof BLACKLIST_ARQUIVOS !== 'undefined' ? BLACKLIST_ARQUIVOS : [];
    // BLACKLIST_ARQUIVOS é definido em "Painel Mestre 2.0.gs": ["MODELO","TEMPLATE","EXEMPLO",...]
    // Planilhas cujo nome contiver qualquer um desses termos são ignoradas.

    for (const regiao of regioes) {
      const pastaId = cfg.pastasRegionais[regiao];
      if (!pastaId) continue;

      try {
        const pasta = DriveApp.getFolderById(pastaId);
        const files = pasta.getFilesByType(MimeType.GOOGLE_SHEETS);
        while (files.hasNext()) {
          const f = files.next();
          const nomeUpper = f.getName().toUpperCase();
          const ehBlacklist = blacklist.some(function(t) { return nomeUpper.indexOf(t) >= 0; });
          if (!ehBlacklist) {
            arquivos.push({ id: f.getId(), nome: f.getName(), regiao: regiao });
          }
        }
      } catch (e) {
        logPadrao(MOD, 'Erro ao acessar pasta "' + regiao + '": ' + e.message, 'AVISO');
      }
    }

    cp.lista   = arquivos;
    cp.indice  = 0;
    cp.corrigidas = 0;
    cp.fase    = 'PROCESSAMENTO';
    saveCheckpoint(cpKey, cp);
    logPadrao(MOD, cp.lista.length + ' planilhas mapeadas.');
  }

  if (cp.fase === 'PROCESSAMENTO') {
    // Carrega template uma vez para obter regrasValidacao e config
    let tpl;
    try {
      tpl = (cfg.templateId === '__padrao__')
        ? construtor_templatePadrao()
        : construtor_carregarTemplate(cfg.templateId);
    } catch (e) {
      logPadrao(MOD, 'Erro ao carregar template: ' + e.message, 'ERRO');
      return { concluido: false, msg: 'Erro ao carregar template: ' + e.message };
    }

    const regrasValidacao = tpl.regrasValidacao || [];
    const tplCfg          = tpl.config           || {};

    while (cp.indice < cp.lista.length) {
      if (budget.exceeded()) {
        saveCheckpoint(cpKey, cp);
        const msg = 'Pausa de segurança [' + cp.indice + '/' + cp.lista.length + ']. Reexecute para continuar.';
        logPadrao(MOD, msg, 'AVISO');
        return { concluido: false, msg: msg, corrigidas: cp.corrigidas };
      }

      const item = cp.lista[cp.indice];
      logPadrao(MOD, '[' + (cp.indice + 1) + '/' + cp.lista.length + '] ' + item.nome);

      try {
        _pipeline_corrigirValidacoesPlanilha(item.id, cfg.nomeAbaVigencia, regrasValidacao, tplCfg);
        cp.corrigidas++;
      } catch (e) {
        logPadrao(MOD, 'Erro em "' + item.nome + '": ' + e.message, 'ERRO');
      }

      cp.indice++;
      saveCheckpoint(cpKey, cp);
    }

    cp.fase = 'CONCLUIDO';
    saveCheckpoint(cpKey, cp);
  }

  logPadrao(MOD, 'Etapa concluída. Corrigidas: ' + cp.corrigidas + '/' + cp.lista.length);
  return { concluido: true, msg: cp.corrigidas + ' planilhas corrigidas.', corrigidas: cp.corrigidas };
}

/**
 * Reaplica regras de validação em uma planilha sem apagar os dados.
 * @private
 */
function _pipeline_corrigirValidacoesPlanilha(ssId, nomeAba, regrasValidacao, tplCfg) {
  const ss = SpreadsheetApp.openById(ssId);

  // Aceita o nome da aba configurado ou qualquer variação conhecida
  const nomesAlternativos = [
    nomeAba,
    'MAPA INDIVIDUALIZADO VIGÊNCIA 1/2026',
    'MAPA INDIVIDUALIZADO VIGÊNCIA 2026/1',
    'MAPA POR FAMILIA 1/2026',
    'MAPA POR FAMILIA 2026/1',
    'MAPA OFICIAL 2026/1'
  ];

  let sheet = null;
  for (const n of nomesAlternativos) {
    sheet = ss.getSheetByName(n);
    if (sheet) break;
  }

  if (!sheet) {
    throw new Error('Nenhuma aba padrão encontrada em "' + ss.getName() + '".');
  }

  // Aplica as regras sem tocar nos dados (usa funções do ConstrutorPlanilhas.gs)
  if (regrasValidacao.length > 0) {
    construtor_aplicarValidacao_(sheet, regrasValidacao, tplCfg);
  }

  SpreadsheetApp.flush();
}
