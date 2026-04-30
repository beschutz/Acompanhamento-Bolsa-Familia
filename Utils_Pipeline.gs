/**
 * 🛠️ UTILITÁRIOS COMPARTILHADOS DO PIPELINE
 *
 * Funções auxiliares usadas por todos os módulos do pipeline:
 *   - Normalização de texto sem acento
 *   - Controle de orçamento de tempo (proteção contra timeout)
 *   - Checkpoint / memória persistente via PropertiesService
 *   - Log padronizado
 */

// =============================================================================
// Normalização de Texto
// =============================================================================

/**
 * Remove acentos e converte para maiúsculo.
 * Usado para comparações robustas de nomes de unidades e regiões.
 * @param {string} text
 * @returns {string}
 */
function normalizarTextoSemAcento(text) {
  if (!text) return '';
  return String(text)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();
}

// =============================================================================
// Controle de Orçamento de Tempo
// =============================================================================

/**
 * Retorna um objeto para verificar se o orçamento de tempo foi consumido.
 * @param {number} startTs    Timestamp de início (Date.now())
 * @param {number} [budgetMs] Orçamento em ms (padrão: CONFIG_PIPELINE.timeBudgetMs)
 * @returns {{ elapsed: function, remaining: function, exceeded: function }}
 */
function withTimeBudget(startTs, budgetMs) {
  const budget = budgetMs || CONFIG_PIPELINE.timeBudgetMs;
  return {
    elapsed:   function() { return Date.now() - startTs; },
    remaining: function() { return budget - (Date.now() - startTs); },
    exceeded:  function() { return (Date.now() - startTs) >= budget; }
  };
}

// =============================================================================
// Checkpoint / Memória (PropertiesService)
// =============================================================================

/**
 * Carrega um checkpoint salvo em ScriptProperties.
 * @param {string} chave
 * @returns {Object|null}
 */
function loadCheckpoint(chave) {
  const raw = PropertiesService.getScriptProperties().getProperty(chave);
  return raw ? JSON.parse(raw) : null;
}

/**
 * Salva o estado atual do checkpoint em ScriptProperties.
 * Se a quota estiver esgotada, tenta uma limpeza de emergência e repete.
 * Em último caso, registra aviso no log mas não interrompe o pipeline.
 * @param {string} chave
 * @param {Object} dados
 */
function saveCheckpoint(chave, dados) {
  const json = JSON.stringify(dados);
  try {
    PropertiesService.getScriptProperties().setProperty(chave, json);
  } catch (e) {
    if (String(e.message || '').indexOf('property storage quota') >= 0) {
      logPadrao('UTILS',
        'Quota de propriedades excedida ao salvar checkpoint "' + chave + '". ' +
        'Tentando limpeza de emergência…', 'AVISO');
      try {
        limparPropertiesEmergencia(true);
        PropertiesService.getScriptProperties().setProperty(chave, json);
        logPadrao('UTILS', 'Checkpoint "' + chave + '" salvo após limpeza.');
      } catch (e2) {
        logPadrao('UTILS',
          'Não foi possível salvar checkpoint "' + chave + '" mesmo após limpeza. ' +
          'Pipeline continua sem persistência de ponto de retomada. Erro: ' + e2.message, 'AVISO');
      }
    } else {
      throw e;
    }
  }
}

/**
 * Remove um checkpoint de ScriptProperties.
 * @param {string} chave
 */
function clearCheckpoint(chave) {
  PropertiesService.getScriptProperties().deleteProperty(chave);
}

/**
 * Remove todos os checkpoints do pipeline de uma vez.
 */
function clearAllPipelineCheckpoints() {
  const keys = CONFIG_PIPELINE.checkpointKeys;
  clearCheckpoint(keys.criar);
  clearCheckpoint(keys.distribuir);
  clearCheckpoint(keys.validacoes);
  clearCheckpoint(keys.ingestao);
  logPadrao('UTILS', 'Todos os checkpoints do pipeline foram removidos.');
}

// =============================================================================
// Diagnóstico de Quota de Propriedades
// =============================================================================

/**
 * Estima o uso atual do armazenamento de ScriptProperties e retorna um
 * relatório por chave.
 *
 * Apps Script tem um limite de ~500 KB de armazenamento total de propriedades
 * de script (soma de todas as chaves + valores).
 *
 * Nota: o cálculo de bytes é uma estimativa baseada no número de caracteres
 * (1 char ≈ 1 byte para ASCII). Conteúdo com muitos caracteres não-ASCII pode
 * ser ligeiramente subestimado.
 *
 * @returns {{ totalBytes: number, totalKB: string, quotaKB: number, percentual: string,
 *             propriedades: Array<{ chave: string, bytes: number, kb: string }> }}
 */
function getScriptPropertiesUsageInfo() {
  const QUOTA_KB = 500;
  const props = PropertiesService.getScriptProperties();
  const all   = props.getProperties();
  const resultado = [];
  let totalBytes = 0;

  for (const chave in all) {
    const bytes = chave.length + (all[chave] || '').length;
    totalBytes += bytes;
    resultado.push({
      chave:  chave,
      bytes:  bytes,
      kb:     (bytes / 1024).toFixed(2)
    });
  }

  resultado.sort(function(a, b) { return b.bytes - a.bytes; });

  return {
    totalBytes:   totalBytes,
    totalKB:      (totalBytes / 1024).toFixed(2),
    quotaKB:      QUOTA_KB,
    percentual:   ((totalBytes / (QUOTA_KB * 1024)) * 100).toFixed(1) + '%',
    propriedades: resultado
  };
}

/**
 * Limpeza de emergência: remove checkpoints do pipeline e quaisquer outras
 * chaves de alto volume que possam causar estouro da quota.
 *
 * Use quando o pipeline travar com "You have exceeded the property storage quota".
 *
 * @param {boolean} [manterEstatisticas=true]  Se false, também limpa STATS_* e CACHE_*.
 * @returns {{ removidas: string[], totalAntes: number, totalDepois: number }}
 */
function limparPropertiesEmergencia(manterEstatisticas) {
  const manter = manterEstatisticas !== false;
  const props  = PropertiesService.getScriptProperties();
  const all    = props.getProperties();

  const PREFIXOS_PIPELINE = [
    'PIPELINE_',       // Checkpoints do pipeline
    'CONSTRUTOR_TPL_'  // Templates armazenados em propriedades
  ];
  const CHAVES_EXATAS_PIPELINE = [
    'CONSTRUTOR_TEMPLATES_INDEX',
    'COND_RULES_AUDIT_LOG'
  ];
  const PREFIXOS_STATS = ['STATS_', 'CACHE_'];

  const infoAntes = getScriptPropertiesUsageInfo();
  const removidas = [];

  for (const chave in all) {
    const ehPipeline = PREFIXOS_PIPELINE.some(function(p) { return chave.indexOf(p) === 0; }) ||
                       CHAVES_EXATAS_PIPELINE.indexOf(chave) >= 0;
    const ehStats    = PREFIXOS_STATS.some(function(p) { return chave.indexOf(p) === 0; });

    if (ehPipeline || (!manter && ehStats)) {
      props.deleteProperty(chave);
      removidas.push(chave);
    }
  }

  const infoDepois = getScriptPropertiesUsageInfo();
  logPadrao('UTILS',
    'Limpeza de emergência: ' + removidas.length + ' chave(s) removida(s). ' +
    'Antes: ' + infoAntes.totalKB + ' KB → Depois: ' + infoDepois.totalKB + ' KB.'
  );

  return {
    removidas:    removidas,
    totalAntes:   infoAntes.totalBytes,
    totalDepois:  infoDepois.totalBytes
  };
}

/**
 * Retorna um resumo do estado dos checkpoints.
 * @returns {Object}
 */
function getPipelineStatus() {
  const keys = CONFIG_PIPELINE.checkpointKeys;
  const cp = {
    criar:      loadCheckpoint(keys.criar),
    distribuir: loadCheckpoint(keys.distribuir),
    validacoes: loadCheckpoint(keys.validacoes),
    ingestao:   loadCheckpoint(keys.ingestao)
  };
  return {
    criar: cp.criar
      ? { fase: cp.criar.fase, progresso: cp.criar.indice + '/' + (cp.criar.lista || []).length }
      : { fase: 'NAO_INICIADO', progresso: '0/0' },
    distribuir: cp.distribuir
      ? { fase: cp.distribuir.fase, progresso: cp.distribuir.indice + '/' + (cp.distribuir.lista || []).length }
      : { fase: 'NAO_INICIADO', progresso: '0/0' },
    validacoes: cp.validacoes
      ? { fase: cp.validacoes.fase, progresso: cp.validacoes.indice + '/' + (cp.validacoes.lista || []).length }
      : { fase: 'NAO_INICIADO', progresso: '0/0' },
    ingestao: cp.ingestao
      ? { ts: cp.ingestao.ts, unidades: cp.ingestao.unidades || 0, pacientes: cp.ingestao.pacientes || 0 }
      : null
  };
}

// =============================================================================
// Log Padronizado
// =============================================================================

/**
 * Registra uma mensagem formatada no Logger do Apps Script.
 * @param {string} modulo  Nome do módulo (ex.: 'CRIAR', 'DISTRIBUIR')
 * @param {string} mensagem
 * @param {string} [nivel] 'INFO' (padrão), 'AVISO' ou 'ERRO'
 */
function logPadrao(modulo, mensagem, nivel) {
  const ts = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM HH:mm:ss');
  const emoji = nivel === 'ERRO' ? '❌' : nivel === 'AVISO' ? '⚠️' : '✅';
  Logger.log('[' + ts + '] [' + modulo + '] ' + emoji + ' ' + mensagem);
}
