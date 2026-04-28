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
 * @param {string} chave
 * @param {Object} dados
 */
function saveCheckpoint(chave, dados) {
  PropertiesService.getScriptProperties().setProperty(chave, JSON.stringify(dados));
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
