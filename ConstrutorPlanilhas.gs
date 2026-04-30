/**
 * 🧩 MÓDULO CONSTRUTOR DE PLANILHAS
 * Cria e gerencia templates de layout visual baseados no modelo de referência
 * do Acompanhamento de Condicionalidades - Bolsa Família (SMS/Porto Alegre).
 */

// =============================================================================
// 1. PERSISTÊNCIA DE TEMPLATES (ScriptProperties)
// =============================================================================

const CONSTRUTOR_INDEX_KEY_    = 'CONSTRUTOR_TEMPLATES_INDEX';
const CONSTRUTOR_TPL_PREFIX_   = 'CONSTRUTOR_TPL_';
const CONSTRUTOR_MAX_TPL_BYTES = 48000; 

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
// 2. TEMPLATE PADRÃO (Idêntico ao Print 1 do Usuário)
// =============================================================================

function construtor_templatePadrao() {
  return {
    id: '__padrao__',
    nome: 'Modelo Padrão',
    config: {
      nomeAba: 'MAPA INDIVIDUALIZADO VIGÊNCIA 1/2026',
      faixas: [
        {
          texto: 'PACIENTE ACOMPANHADO NA US',
          bgColor: '#ffd966',
          fontColor: '#000000',
          negrito: true,
          altura: 30
        },
        {
          texto: 'PACIENTE ACOMPANHADO NO EGESTOR',
          bgColor: '#93c47d',
          fontColor: '#000000',
          negrito: true,
          altura: 30
        },
        {
          texto: 'PACIENTE FORA DE ÁREA',
          bgColor: '#6fa8dc',
          fontColor: '#000000',
          negrito: true,
          altura: 28
        },
        {
          texto: 'PACIENTE NÃO LOCALIZADO/NÃO RECEBE',
          bgColor: '#e06666',
          fontColor: '#000000',
          negrito: true,
          altura: 28
        }
      ],
      blocos: [
        {
          id: 'bloco_identificacao',
          titulo: 'IDENTIFICAÇÃO',
          bgColor: '#dd7e6b',
          fontColor: '#FFFFFF',
          colunas: [
            { id: 'nis',   titulo: 'NIS',             largura: 110 },
            { id: 'cpf',   titulo: 'CPF',             largura: 110 },
            { id: 'nome',  titulo: 'NOME',            largura: 250 },
            { id: 'nasc',  titulo: 'DATA NASCIMENTO', largura: 110 }
          ]
        },
        {
          id: 'bloco_acomp_us',
          titulo: 'ACOMPANHAMENTO US',
          bgColor: '#a4c2f4',
          fontColor: '#FFFFFF',
          colunas: [
            { id: 'acomp_us',   titulo: 'ACOMPANHADO NA US',   largura: 120 },
            { id: 'data_acomp', titulo: 'DATA ACOMPANHAMENTO', largura: 130 },
            { id: 'peso',       titulo: 'PESO (kg)',           largura: 80 },
            { id: 'altura',     titulo: 'ALTURA (cm)',         largura: 80 }
          ]
        },
        {
          id: 'bloco_criancas',
          titulo: 'CRIANÇAS ATÉ 8 ANOS',
          bgColor: '#b6d7a8',
          fontColor: '#FFFFFF',
          colunas: [
            { id: 'vacina',        titulo: 'VACINA',               largura: 100 },
            { id: 'motivo_vacina', titulo: 'MOTIVO NÃO VACINAÇÃO', largura: 150 }
          ]
        },
        {
          id: 'bloco_gestantes',
          titulo: 'GESTANTES',
          bgColor: '#b4a7d6',
          fontColor: '#FFFFFF',
          colunas: [
            { id: 'gestante',  titulo: 'GESTANTE',  largura: 90 },
            { id: 'dum',       titulo: 'DUM',       largura: 90 },
            { id: 'pre_natal', titulo: 'PRÉ-NATAL', largura: 90 }
          ]
        },
        {
          id: 'bloco_contato',
          titulo: 'INFORMAÇÕES DE CONTATO',
          bgColor: '#a2c4c9',
          fontColor: '#FFFFFF',
          colunas: [
            { id: 'telefone', titulo: 'TELEFONE', largura: 110 },
            { id: 'endereco', titulo: 'ENDEREÇO', largura: 160 }
          ]
        },
        {
          id: 'bloco_extras',
          titulo: 'EXTRAS',
          bgColor: '#d5a6bd',
          fontColor: '#FFFFFF',
          colunas: [
            { id: 'egestor', titulo: 'ACOMPANHADO NO EGESTOR', largura: 150 },
            { id: 'obs',     titulo: 'OBSERVAÇÕES',            largura: 160 }
          ]
        }
      ],
      alturaLinhaCabecalho: 46,
      alturaLinhasDados: 21,
      congelarLinhas: 6,
      bordas: true
    },
    regrasValidacao: [
      { colId: 'acomp_us',  tipo: 'lista', valores: ['SIM', 'NÃO'] },
      { colId: 'vacina',    tipo: 'lista', valores: ['SIM', 'NÃO'] },
      { colId: 'gestante',  tipo: 'lista', valores: ['SIM', 'NÃO'] },
      { colId: 'pre_natal', tipo: 'lista', valores: ['SIM', 'NÃO'] },
      { colId: 'egestor',   tipo: 'lista', valores: ['SIM', 'NÃO'] }
    ],
    formatacaoCondicional: [
      { formula: 'EXATO($E2,"SIM")', bgColor: '#ffd966', fontColor: '#000000', descricao: 'Acomp. US SIM' },
      { formula: 'EXATO($P2,"SIM")', bgColor: '#93c47d', fontColor: '#000000', descricao: 'E-Gestor SIM' },
      { formula: 'EXATO($P2,"NÃO")', bgColor: '#FFCCCC', fontColor: '#9C0006', descricao: 'E-Gestor NÃO' },
      { formula: 'EXATO($E2,"NÃO")', bgColor: '#FCE4D6', fontColor: '#833C00', descricao: 'Acomp. US NÃO' }
    ],
    protecoes: [
      {
        tipo: 'coluna',
        colIds: ['nis', 'cpf', 'nome', 'nasc'],
        descricao: 'Identificação — não editar manualmente'
      }
    ]
  };
}

// =============================================================================
// 3. MOTOR DE CONSTRUÇÃO DE PLANILHA
// =============================================================================

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

  const numFaixas   = faixas.length;          
  const linhaBloco  = numFaixas + 1;           
  const linhaCols   = numFaixas + 2;           

  const curCols = sheet.getMaxColumns();
  if (totalCols > curCols) {
    sheet.insertColumnsAfter(curCols, totalCols - curCols);
  }

  // ── Faixas superiores ────────────────────────────────────────────────────
  faixas.forEach(function(faixa, i) {
    var row = i + 1;
    sheet.setRowHeight(row, faixa.altura || 28);
    
    // CORREÇÃO: Mescla apenas as colunas A, B e C (1 a 3) como no Print 1
    try { sheet.getRange(row, 1, 1, 3).merge(); } catch(e) {}
    
    var c = sheet.getRange(row, 1);
    c.setValue(faixa.texto || '');
    c.setBackground(faixa.bgColor || '#1F3864');
    c.setFontColor(faixa.fontColor || '#FFFFFF');
    c.setFontSize(11);
    c.setFontWeight(faixa.negrito !== false ? 'bold' : 'normal');
    c.setFontStyle('italic'); // CORREÇÃO: Adicionado itálico
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
    c.setFontStyle('italic'); // CORREÇÃO: Adicionado itálico
    c.setHorizontalAlignment('center');
    c.setVerticalAlignment('middle');
    offset += nc;
  });

  // ── Cabeçalhos de colunas ────────────────────────────────────────────────
  sheet.setRowHeight(linhaCols, cfg.alturaLinhaCabecalho || 46);
  offset = 1;
  blocos.forEach(function(bloco) {
    (bloco.colunas || []).forEach(function(col) {
      sheet.setColumnWidth(offset, col.largura || 100);
      var c = sheet.getRange(linhaCols, offset);
      c.setValue(col.titulo || '');
      
      // CORREÇÃO: Fundo clarinho e texto preto em itálico, idêntico ao Print 1
      c.setBackground('#f3f3f3');
      c.setFontColor('#000000');
      c.setFontSize(8);
      c.setFontWeight('bold');
      c.setFontStyle('italic');
      
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
                 '#000000', SpreadsheetApp.BorderStyle.SOLID);
  }

  // ── Congelar linhas ──────────────────────────────────────────────────────
  var freeze = cfg.congelarLinhas != null ? cfg.congelarLinhas : linhaCols;
  sheet.setFrozenRows(freeze);

  // ── Pré-formatar linhas de dados ─────────────────────────────────────────
  var altDados  = cfg.alturaLinhasDados || 21;
  var maxRows   = sheet.getMaxRows();
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
  return (cfg.faixas || []).length + 3;
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
