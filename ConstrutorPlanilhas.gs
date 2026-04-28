/**
 * 🧩 MÓDULO CONSTRUTOR DE PLANILHAS
 * Cria e gerencia templates de layout visual baseados no modelo de referência
 * do Acompanhamento de Condicionalidades - Bolsa Família (SMS/Porto Alegre).
 *
 * Exposição via api.gs:
 *   list_templates, get_template, save_template, delete_template,
 *   create_sheet_from_template
 */

// =============================================================================
// 1. PERSISTÊNCIA DE TEMPLATES (ScriptProperties)
// =============================================================================

const CONSTRUTOR_INDEX_KEY_    = 'CONSTRUTOR_TEMPLATES_INDEX';
const CONSTRUTOR_TPL_PREFIX_   = 'CONSTRUTOR_TPL_';
const CONSTRUTOR_MAX_TPL_BYTES = 48000; // ~48 KB por template

function construtor_listarTemplates() {
  const raw = PropertiesService.getScriptProperties().getProperty(CONSTRUTOR_INDEX_KEY_);
  return raw ? JSON.parse(raw) : [];
}

function construtor_salvarTemplate(id, template) {
  const props = PropertiesService.getScriptProperties();
  const json = JSON.stringify(template);
  if (json.length > CONSTRUTOR_MAX_TPL_BYTES) {
    throw new Error('Template muito grande para armazenar (limite ~48 KB). Reduza blocos ou regras.');
  }

  let idx = construtor_listarTemplates();
  const pos = idx.findIndex(t => t.id === id);
  const ts  = new Date().toISOString();
  const entry = { id, nome: template.nome || 'Sem nome', atualizadoEm: ts };

  if (pos >= 0) {
    idx[pos] = Object.assign({}, idx[pos], entry);
  } else {
    entry.criadoEm = ts;
    idx.push(entry);
  }

  props.setProperty(CONSTRUTOR_INDEX_KEY_, JSON.stringify(idx));
  props.setProperty(CONSTRUTOR_TPL_PREFIX_ + id, json);
  return { id, index: idx };
}

function construtor_carregarTemplate(id) {
  const raw = PropertiesService.getScriptProperties().getProperty(CONSTRUTOR_TPL_PREFIX_ + id);
  if (!raw) throw new Error('Template "' + id + '" não encontrado.');
  return JSON.parse(raw);
}

function construtor_deletarTemplate(id) {
  const props = PropertiesService.getScriptProperties();
  props.deleteProperty(CONSTRUTOR_TPL_PREFIX_ + id);
  const idx = construtor_listarTemplates().filter(t => t.id !== id);
  props.setProperty(CONSTRUTOR_INDEX_KEY_, JSON.stringify(idx));
}

// =============================================================================
// 2. TEMPLATE PADRÃO (idêntico ao modelo de referência)
// =============================================================================

function construtor_templatePadrao() {
  return {
    id: '__padrao__',
    nome: 'Modelo Padrão (Vigência 1/2026)',
    config: {
      nomeAba: 'MAPA INDIVIDUALIZADO VIGÊNCIA 1/2026',
      faixas: [
        {
          texto: 'PREFEITURA MUNICIPAL DE PORTO ALEGRE — SECRETARIA MUNICIPAL DE SAÚDE',
          bgColor: '#1F3864',
          fontColor: '#FFFFFF',
          negrito: true,
          altura: 30
        },
        {
          texto: 'ACOMPANHAMENTO DE CONDICIONALIDADES DO BOLSA FAMÍLIA — VIGÊNCIA 1/2026',
          bgColor: '#2E75B6',
          fontColor: '#FFFFFF',
          negrito: true,
          altura: 30
        }
      ],
      blocos: [
        {
          id: 'bloco_identificacao',
          titulo: 'IDENTIFICAÇÃO',
          bgColor: '#4472C4',
          fontColor: '#FFFFFF',
          colunas: [
            { id: 'nis',   titulo: 'NIS',           largura: 125 },
            { id: 'cns',   titulo: 'CNS',           largura: 130 },
            { id: 'cpf',   titulo: 'CPF',           largura: 115 },
            { id: 'nome',  titulo: 'NOME COMPLETO', largura: 220 },
            { id: 'nasc',  titulo: 'NASC.',         largura: 88  },
            { id: 'idade', titulo: 'IDADE',         largura: 58  }
          ]
        },
        {
          id: 'bloco_acomp_us',
          titulo: 'ACOMPANHAMENTO US',
          bgColor: '#375623',
          fontColor: '#FFFFFF',
          colunas: [
            { id: 'acomp_us',   titulo: 'ACOMP. NA US',  largura: 100 },
            { id: 'data_acomp', titulo: 'DATA ACOMP.',   largura: 95  }
          ]
        },
        {
          id: 'bloco_medidas',
          titulo: 'MEDIDAS',
          bgColor: '#833C00',
          fontColor: '#FFFFFF',
          colunas: [
            { id: 'peso',   titulo: 'PESO (kg)',          largura: 80 },
            { id: 'altura', titulo: 'ALTURA/ESTATURA (m)', largura: 98 }
          ]
        },
        {
          id: 'bloco_saude',
          titulo: 'SAÚDE / GESTACIONAL',
          bgColor: '#00494B',
          fontColor: '#FFFFFF',
          colunas: [
            { id: 'vacina',    titulo: 'VACINAÇÃO EM DIA', largura: 100 },
            { id: 'gestante',  titulo: 'GESTANTE',         largura: 85  },
            { id: 'dum',       titulo: 'DUM',              largura: 88  },
            { id: 'pre_natal', titulo: 'PRÉ-NATAL',        largura: 90  }
          ]
        },
        {
          id: 'bloco_egestor',
          titulo: 'E-GESTOR',
          bgColor: '#3A1D5C',
          fontColor: '#FFFFFF',
          colunas: [
            { id: 'egestor', titulo: 'ACOMP. NO E-GESTOR', largura: 115 }
          ]
        }
      ],
      alturaLinhaCabecalho: 46,
      alturaLinhasDados: 21,
      congelarLinhas: 4,
      bordas: true
    },
    regrasValidacao: [
      { colId: 'acomp_us',   tipo: 'lista', valores: ['SIM', 'NÃO', 'EM ACOMP.'] },
      { colId: 'egestor',    tipo: 'lista', valores: ['SIM', 'NÃO'] },
      { colId: 'vacina',     tipo: 'lista', valores: ['SIM', 'NÃO', 'EM DIA', 'NÃO APLICÁVEL'] },
      { colId: 'gestante',   tipo: 'lista', valores: ['SIM', 'NÃO'] },
      { colId: 'pre_natal',  tipo: 'lista', valores: ['SIM', 'NÃO', 'EM ANDAMENTO', 'N/A'] }
    ],
    formatacaoCondicional: [
      {
        formula: 'EXATO($G2,"SIM")',
        bgColor: '#C6EFCE',
        fontColor: '#276221',
        descricao: 'Acompanhado na US = SIM → verde'
      },
      {
        formula: 'EXATO($P2,"SIM")',
        bgColor: '#C6EFCE',
        fontColor: '#276221',
        descricao: 'E-Gestor = SIM → verde'
      },
      {
        formula: 'EXATO($P2,"NÃO")',
        bgColor: '#FFCCCC',
        fontColor: '#9C0006',
        descricao: 'E-Gestor = NÃO → vermelho'
      },
      {
        formula: 'EXATO($G2,"NÃO")',
        bgColor: '#FCE4D6',
        fontColor: '#833C00',
        descricao: 'Não acompanhado na US → laranja claro'
      }
    ],
    protecoes: [
      {
        tipo: 'coluna',
        colIds: ['nis', 'cns', 'cpf', 'nome', 'nasc', 'idade'],
        descricao: 'Identificação — não editar manualmente'
      }
    ]
  };
}

// =============================================================================
// 3. MOTOR DE CONSTRUÇÃO DE PLANILHA
// =============================================================================

/**
 * Cria (ou recria) uma aba em uma planilha, aplicando layout + regras.
 * @param {Object|string} templateJson  Template completo (objeto ou JSON string).
 * @param {string|null}   spreadsheetId ID da planilha de destino (null = cria nova planilha).
 * @param {string|null}   nomeAba       Nome da aba (null = usa config.nomeAba do template).
 * @returns {{ spreadsheetId, spreadsheetUrl, sheetName }}
 */
function construtor_criarPlanilha(templateJson, spreadsheetId, nomeAba) {
  const tpl = (typeof templateJson === 'string') ? JSON.parse(templateJson) : templateJson;
  const cfg = tpl.config || {};

  const nomeAbaFinal = nomeAba || cfg.nomeAba || 'Nova Planilha';

  let ss;
  if (spreadsheetId) {
    ss = SpreadsheetApp.openById(spreadsheetId);
  } else {
    ss = SpreadsheetApp.create(nomeAbaFinal);
  }

  // Apaga aba se já existir para recriar limpa
  let sheet = ss.getSheetByName(nomeAbaFinal);
  if (sheet) {
    sheet.clear();
    sheet.clearFormats();
    sheet.clearConditionalFormatRules();
    sheet.getProtections(SpreadsheetApp.ProtectionType.RANGE).forEach(function(p) { p.remove(); });
    sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET).forEach(function(p) { p.remove(); });
  } else {
    sheet = ss.insertSheet(nomeAbaFinal);
  }

  construtor_aplicarLayout_(sheet, cfg);

  if (Array.isArray(tpl.regrasValidacao) && tpl.regrasValidacao.length > 0) {
    construtor_aplicarValidacao_(sheet, tpl.regrasValidacao, cfg);
  }
  if (Array.isArray(tpl.formatacaoCondicional) && tpl.formatacaoCondicional.length > 0) {
    construtor_aplicarFormatacaoCondicional_(sheet, tpl.formatacaoCondicional, cfg);
  }
  if (Array.isArray(tpl.protecoes) && tpl.protecoes.length > 0) {
    construtor_aplicarProtecoes_(sheet, tpl.protecoes, cfg);
  }

  SpreadsheetApp.flush();
  return {
    spreadsheetId: ss.getId(),
    spreadsheetUrl: ss.getUrl(),
    sheetName: nomeAbaFinal
  };
}

// ─── Layout ─────────────────────────────────────────────────────────────────

function construtor_aplicarLayout_(sheet, cfg) {
  const faixas  = cfg.faixas  || [];
  const blocos  = cfg.blocos  || [];
  const totalCols = blocos.reduce(function(s, b) { return s + (b.colunas || []).length; }, 0);

  if (totalCols === 0) return;

  // Linhas estruturais
  const numFaixas   = faixas.length;          // linhas 1..numFaixas
  const linhaBloco  = numFaixas + 1;           // linha dos títulos de blocos
  const linhaCols   = numFaixas + 2;           // linha dos títulos de colunas

  // Garantir colunas suficientes
  const curCols = sheet.getMaxColumns();
  if (totalCols > curCols) {
    sheet.insertColumnsAfter(curCols, totalCols - curCols);
  }

  // ── Faixas superiores ────────────────────────────────────────────────────
  faixas.forEach(function(faixa, i) {
    var row = i + 1;
    sheet.setRowHeight(row, faixa.altura || 28);
    if (totalCols > 1) {
      try { sheet.getRange(row, 1, 1, totalCols).merge(); } catch(e) {}
    }
    var c = sheet.getRange(row, 1);
    c.setValue(faixa.texto || '');
    c.setBackground(faixa.bgColor || '#1F3864');
    c.setFontColor(faixa.fontColor || '#FFFFFF');
    c.setFontSize(11);
    c.setFontWeight(faixa.negrito !== false ? 'bold' : 'normal');
    c.setHorizontalAlignment('center');
    c.setVerticalAlignment('middle');
    c.setWrap(true);
  });

  // ── Títulos dos blocos ───────────────────────────────────────────────────
  sheet.setRowHeight(linhaBloco, 26);
  var offset = 1;
  blocos.forEach(function(bloco) {
    var nc = (bloco.colunas || []).length;
    if (nc === 0) return;
    if (nc > 1) {
      try { sheet.getRange(linhaBloco, offset, 1, nc).merge(); } catch(e) {}
    }
    var c = sheet.getRange(linhaBloco, offset);
    c.setValue(bloco.titulo || '');
    c.setBackground(bloco.bgColor || '#4472C4');
    c.setFontColor(bloco.fontColor || '#FFFFFF');
    c.setFontSize(9);
    c.setFontWeight('bold');
    c.setHorizontalAlignment('center');
    c.setVerticalAlignment('middle');
    offset += nc;
  });

  // ── Cabeçalhos de colunas ────────────────────────────────────────────────
  sheet.setRowHeight(linhaCols, cfg.alturaLinhaCabecalho || 46);
  offset = 1;
  blocos.forEach(function(bloco) {
    var escuro = construtor_darkenColor_(bloco.bgColor || '#4472C4', 25);
    (bloco.colunas || []).forEach(function(col) {
      sheet.setColumnWidth(offset, col.largura || 100);
      var c = sheet.getRange(linhaCols, offset);
      c.setValue(col.titulo || '');
      c.setBackground(escuro);
      c.setFontColor(bloco.fontColor || '#FFFFFF');
      c.setFontSize(8);
      c.setFontWeight('bold');
      c.setHorizontalAlignment('center');
      c.setVerticalAlignment('middle');
      c.setWrap(true);
      offset++;
    });
  });

  // ── Bordas no cabeçalho ──────────────────────────────────────────────────
  if (cfg.bordas !== false) {
    sheet.getRange(1, 1, linhaCols, totalCols)
      .setBorder(true, true, true, true, true, true,
                 '#FFFFFF', SpreadsheetApp.BorderStyle.SOLID);
  }

  // ── Congelar linhas ──────────────────────────────────────────────────────
  var freeze = cfg.congelarLinhas != null ? cfg.congelarLinhas : linhaCols;
  sheet.setFrozenRows(freeze);

  // ── Pré-formatar linhas de dados ─────────────────────────────────────────
  var altDados  = cfg.alturaLinhasDados || 21;
  var maxRows   = sheet.getMaxRows();
  // Pré-formata até 200 linhas para evitar lentidão de chamadas individuais ao Sheets
  var batchSize = Math.min(200, maxRows - linhaCols);
  if (batchSize > 0) {
    for (var r = linhaCols + 1; r <= linhaCols + batchSize; r++) {
      sheet.setRowHeight(r, altDados);
    }
    if (cfg.bordas !== false) {
      sheet.getRange(linhaCols + 1, 1, batchSize, totalCols)
        .setBorder(null, true, null, true, true, null,
                   '#CCCCCC', SpreadsheetApp.BorderStyle.SOLID);
    }
  }
}

function construtor_darkenColor_(hex, amount) {
  try {
    var h = hex.replace('#', '');
    if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
    var r = Math.max(0, parseInt(h.substring(0,2), 16) - amount);
    var g = Math.max(0, parseInt(h.substring(2,4), 16) - amount);
    var b = Math.max(0, parseInt(h.substring(4,6), 16) - amount);
    return '#' + [r,g,b].map(function(v) { return v.toString(16).padStart(2,'0'); }).join('');
  } catch(e) { return hex; }
}

// ─── Helpers de mapeamento de colunas ────────────────────────────────────────

function construtor_colIndex_(cfg, colId) {
  var idx = 1;
  var blocos = cfg.blocos || [];
  for (var i = 0; i < blocos.length; i++) {
    var cols = blocos[i].colunas || [];
    for (var j = 0; j < cols.length; j++) {
      if (cols[j].id === colId) return idx;
      idx++;
    }
  }
  return null;
}

function construtor_linhaInicioDados_(cfg) {
  return (cfg.faixas || []).length + 3; // faixas + blocos + colunas + 1
}

// ─── Validação de dados ───────────────────────────────────────────────────────

function construtor_aplicarValidacao_(sheet, regras, cfg) {
  var linhaInicio = construtor_linhaInicioDados_(cfg);
  var numRows     = Math.max(1, sheet.getMaxRows() - linhaInicio + 1);

  regras.forEach(function(regra) {
    var colIdx = construtor_colIndex_(cfg, regra.colId);
    if (!colIdx) return;
    var range = sheet.getRange(linhaInicio, colIdx, numRows, 1);

    if (regra.tipo === 'lista') {
      var rule = SpreadsheetApp.newDataValidation()
        .requireValueInList(regra.valores || [], true)
        .setAllowInvalid(false)
        .setHelpText(regra.helpText || '')
        .build();
      range.setDataValidation(rule);
    }
  });
}

// ─── Formatação condicional ───────────────────────────────────────────────────

function construtor_aplicarFormatacaoCondicional_(sheet, regrasCF, cfg) {
  var linhaInicio = construtor_linhaInicioDados_(cfg);
  var totalCols   = (cfg.blocos || []).reduce(function(s, b) { return s + (b.colunas || []).length; }, 0);
  var numRows     = Math.max(1, sheet.getMaxRows() - linhaInicio + 1);

  sheet.setConditionalFormatRules([]);

  var newRules = regrasCF.map(function(regra) {
    var range = sheet.getRange(linhaInicio, 1, numRows, totalCols);
    var builder = SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied('=' + regra.formula)
      .setRanges([range]);
    if (regra.bgColor)   builder = builder.setBackground(regra.bgColor);
    if (regra.fontColor) builder = builder.setFontColor(regra.fontColor);
    return builder.build();
  });

  if (newRules.length > 0) sheet.setConditionalFormatRules(newRules);
}

// ─── Proteções de intervalo ───────────────────────────────────────────────────

function construtor_aplicarProtecoes_(sheet, protecoes, cfg) {
  var linhaInicio = construtor_linhaInicioDados_(cfg);
  var numRows     = Math.max(1, sheet.getMaxRows() - linhaInicio + 1);

  protecoes.forEach(function(prot) {
    if (prot.tipo === 'coluna') {
      (prot.colIds || []).forEach(function(colId) {
        var colIdx = construtor_colIndex_(cfg, colId);
        if (!colIdx) return;
        var range = sheet.getRange(linhaInicio, colIdx, numRows, 1);
        var protection = range.protect();
        protection.setDescription(prot.descricao || 'Protegido pelo Construtor de Planilhas');
        protection.setWarningOnly(true);
      });
    }
  });
}

// =============================================================================
// 4. HANDLERS DE API (chamados por api.gs)
// =============================================================================

function handleListTemplates_() {
  try {
    return { ok: true, data: construtor_listarTemplates() };
  } catch(e) {
    return { ok: false, err: e.message };
  }
}

function handleGetTemplate_(params) {
  try {
    var id = params.id || '';
    if (id === '__padrao__' || !id) return { ok: true, data: construtor_templatePadrao() };
    return { ok: true, data: construtor_carregarTemplate(id) };
  } catch(e) {
    return { ok: false, err: e.message };
  }
}

function handleSaveTemplate_(params) {
  try {
    var tpl = JSON.parse(params.template_json || '{}');
    if (!tpl.id) tpl.id = 'tpl_' + Date.now();
    var result = construtor_salvarTemplate(tpl.id, tpl);
    return { ok: true, id: tpl.id, data: result };
  } catch(e) {
    return { ok: false, err: e.message };
  }
}

function handleDeleteTemplate_(params) {
  try {
    construtor_deletarTemplate(params.id || '');
    return { ok: true };
  } catch(e) {
    return { ok: false, err: e.message };
  }
}

function handleCreateSheetFromTemplate_(params) {
  try {
    var tpl;
    if (params.template_json) {
      tpl = JSON.parse(params.template_json);
    } else if (params.template_id) {
      if (params.template_id === '__padrao__') {
        tpl = construtor_templatePadrao();
      } else {
        tpl = construtor_carregarTemplate(params.template_id);
      }
    } else {
      tpl = construtor_templatePadrao();
    }

    var result = construtor_criarPlanilha(
      tpl,
      params.spreadsheet_id || null,
      params.nome_aba || null
    );
    return { ok: true, data: result };
  } catch(e) {
    return { ok: false, err: e.message };
  }
}
