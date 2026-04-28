/**
 * 📥 INGESTÃO DE MAPAS — Parser de "Falso XLS" (HTML)
 *
 * Recebe arquivos .xls baixados do portal BFA (que são HTML disfarçados),
 * faz o parsing no servidor, extrai:
 *   - Código do Mapa
 *   - Unidade / EAS
 *   - Dados dos pacientes (NIS, Nome, Data de Nascimento)
 * e persiste tudo na planilha consolidada configurada em Config_Pipeline.gs,
 * pronta para ser consumida pelo Pipeline de criação de planilhas por unidade.
 *
 * Pré-requisito:
 *   - Config_Pipeline.gs com idPlanilhaConsolidada e nomeAbaConsolidada
 *     preenchidos, ou a aba será criada automaticamente se o campo
 *     idPlanilhaConsolidada estiver configurado.
 */

// =============================================================================
// PONTO DE ENTRADA PRINCIPAL
// =============================================================================

/**
 * Processa um lote de arquivos recebidos do Painel Web.
 *
 * @param {Array<{nome: string, conteudo: string}>} arquivos
 *   Array de objetos com nome do arquivo e conteúdo textual (HTML/XLS).
 * @returns {{
 *   ok: boolean,
 *   recebidos: number,
 *   processados: number,
 *   invalidos: number,
 *   unidades: number,
 *   pacientes: number,
 *   erros: Array<{arquivo: string, erro: string}>
 * }}
 */
function ingestaoProcessarLote(arquivos) {
  const cfg = CONFIG_PIPELINE;

  if (!cfg.idPlanilhaConsolidada) {
    return {
      ok: false,
      err: 'idPlanilhaConsolidada não configurado em Config_Pipeline.gs. ' +
           'Preencha o ID da planilha consolidada antes de usar a ingestão.'
    };
  }

  const resultado = {
    recebidos:   arquivos.length,
    processados: 0,
    invalidos:   0,
    unidades:    0,
    pacientes:   0,
    erros:       []
  };

  const todasLinhas = [];

  for (const arq of arquivos) {
    try {
      const linhas = ingestao_parsearArquivo_(arq.nome, arq.conteudo);
      if (linhas.length === 0) {
        resultado.invalidos++;
        resultado.erros.push({ arquivo: arq.nome, erro: 'Nenhum paciente encontrado no arquivo.' });
      } else {
        resultado.processados++;
        resultado.pacientes += linhas.length;
        for (const l of linhas) todasLinhas.push(l);
      }
    } catch (e) {
      resultado.invalidos++;
      resultado.erros.push({ arquivo: arq.nome, erro: e.message });
      logPadrao('INGESTAO', 'Erro ao parsear "' + arq.nome + '": ' + e.message, 'ERRO');
    }
  }

  if (todasLinhas.length > 0) {
    ingestao_persistirNaPlanilha_(todasLinhas, cfg);
    const unidades = new Set(todasLinhas.map(function(l) { return l[0]; }));
    resultado.unidades = unidades.size;
  }

  // Salva checkpoint com resumo do último envio
  saveCheckpoint(cfg.checkpointKeys.ingestao, {
    ts:          new Date().toISOString(),
    recebidos:   resultado.recebidos,
    processados: resultado.processados,
    invalidos:   resultado.invalidos,
    unidades:    resultado.unidades,
    pacientes:   resultado.pacientes
  });

  logPadrao('INGESTAO',
    'Lote concluído — ' + resultado.processados + '/' + resultado.recebidos +
    ' arquivos | ' + resultado.unidades + ' unidades | ' + resultado.pacientes + ' pacientes'
  );

  return Object.assign({ ok: true }, resultado);
}

/**
 * Retorna o estado do último lote de ingestão ou null se nunca executado.
 * @returns {Object|null}
 */
function ingestao_getStatus() {
  return loadCheckpoint(CONFIG_PIPELINE.checkpointKeys.ingestao) || null;
}

// =============================================================================
// PARSER DE ARQUIVO
// =============================================================================

/**
 * Parseia um único arquivo "falso XLS" (HTML) e retorna as linhas de
 * pacientes no formato esperado pela planilha consolidada.
 *
 * Formato de saída (cada linha):
 *   [NOME_UNIDADE, NIS, CNS, CPF, NOME_PACIENTE, DATA_NASC, IDADE,
 *    DATA_ACOMP, VACINACAO, PESO, ALTURA, GESTANTE, PRE_NATAL, DUM]
 *
 * @param {string} nomeArquivo
 * @param {string} conteudo  Conteúdo textual do arquivo (pode estar em
 *                           quoted-printable parcial, ex.: =3D no lugar de =).
 * @returns {Array<Array<string>>}
 */
function ingestao_parsearArquivo_(nomeArquivo, conteudo) {
  // Sanitiza encoding artifacts comuns no quoted-printable
  const texto = String(conteudo || '')
    .replace(/=3D/g,  '=')
    .replace(/=\r\n/g, '')
    .replace(/=\n/g,   '');

  const linhasTabela = ingestao_extrairLinhasHTML_(texto);
  if (linhasTabela.length === 0) {
    logPadrao('INGESTAO', 'Sem linhas de tabela em: ' + nomeArquivo, 'AVISO');
    return [];
  }

  // Tenta extrair código do mapa a partir do nome do arquivo (fallback)
  let codigoMapa = 'N/A';
  const matchArq = nomeArquivo.match(/codigo_(\d+)/i);
  if (matchArq) codigoMapa = matchArq[1];

  let nomeUnidade = '';
  const pacientes   = [];

  for (let i = 0; i < linhasTabela.length; i++) {
    const linha = linhasTabela[i];

    // Varre todas as células procurando metadados
    for (let j = 0; j < linha.length; j++) {
      const celula = String(linha[j] || '');

      // Extrai Código do Mapa
      if (!matchArq && (celula.includes('C\u00f3digo do Mapa:') || celula.includes('Codigo do Mapa:'))) {
        const m = celula.match(/C[o\u00f3]digo do Mapa:\s*(\d+)/i);
        if (m) codigoMapa = m[1];
      }

      // Extrai nome da Unidade / EAS
      if (!nomeUnidade && (celula.includes('17 - EAS:') || celula.includes('17- EAS:'))) {
        const partes = celula.split('EAS:');
        if (partes.length > 1 && partes[1].trim()) {
          // Remove prefixo numérico ex.: "010 NOME" → "NOME"
          nomeUnidade = partes[1].trim().replace(/^[\d\s]+/, '').trim();
        } else if (i + 1 < linhasTabela.length) {
          // Nome pode estar na célula da próxima linha
          nomeUnidade = String(linhasTabela[i + 1][j] || '').trim()
            .replace(/^[\d\s]+/, '').trim();
        }
      }
    }

    // Detecta linha de paciente: coluna 0 começa com "1 -"
    if (nomeUnidade && String(linha[0] || '').trim().match(/^1\s*-/)) {
      const nis      = String(linha[0]).replace(/^1\s*-\s*/, '').trim();
      const nome     = String(linha[2] || linha[1] || '').replace(/^2\s*-\s*/, '').trim();
      const dataNasc = String(linha[3] || '').replace(/^3\s*-\s*/, '').trim();

      if (nis || nome) {
        // Formato: 14 colunas conforme Config_Pipeline.colunasConsolidada
        pacientes.push([
          nomeUnidade, // 0  NOME_UNIDADE
          nis,         // 1  NIS
          '',          // 2  CNS
          '',          // 3  CPF
          nome,        // 4  NOME_PACIENTE
          dataNasc,    // 5  DATA_NASC
          '',          // 6  IDADE
          '',          // 7  DATA_ACOMP
          '',          // 8  VACINACAO
          '',          // 9  PESO
          '',          // 10 ALTURA
          '',          // 11 GESTANTE
          '',          // 12 PRE_NATAL
          ''           // 13 DUM
        ]);
      }
    }
  }

  return pacientes;
}

// =============================================================================
// EXTRAÇÃO DE TABELA HTML
// =============================================================================

/**
 * Extrai linhas de tabela do conteúdo HTML usando expressões regulares.
 * Retorna a maior tabela encontrada (como no script Python original).
 *
 * @param {string} html
 * @returns {Array<Array<string>>}
 */
function ingestao_extrairLinhasHTML_(html) {
  const htmlStr = String(html || '');

  // Encontra todos os blocos <table>...</table>
  const tablePattern = /<table[^>]*>([\s\S]*?)<\/table>/gi;
  const trPattern    = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const tdPattern    = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
  const tagPattern   = /<[^>]+>/g;

  const entidadesHtml = {
    '&amp;':  '&',
    '&nbsp;': ' ',
    '&lt;':   '<',
    '&gt;':   '>',
    '&quot;': '"',
    '&#39;':  "'"
  };

  function limparCelula(rawHtml) {
    return rawHtml
      .replace(tagPattern, ' ')
      .replace(/&[a-z]+;|&#\d+;/g, function(e) { return entidadesHtml[e] || ''; })
      .replace(/\s+/g, ' ')
      .trim();
  }

  function extrairLinhasDaTabela(tableHtml) {
    const rows = [];
    let trMatch;
    const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    while ((trMatch = trRe.exec(tableHtml)) !== null) {
      const rowHtml = trMatch[1];
      const cells   = [];
      let tdMatch;
      const tdRe = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
      while ((tdMatch = tdRe.exec(rowHtml)) !== null) {
        cells.push(limparCelula(tdMatch[1]));
      }
      if (cells.length > 0) rows.push(cells);
    }
    return rows;
  }

  // Coleta todas as tabelas e retorna a maior
  let maiorTabela = [];
  let tblMatch;
  const tblRe = /<table[^>]*>([\s\S]*?)<\/table>/gi;
  while ((tblMatch = tblRe.exec(htmlStr)) !== null) {
    const rows = extrairLinhasDaTabela(tblMatch[1]);
    if (rows.length > maiorTabela.length) maiorTabela = rows;
  }

  // Fallback: se nenhuma tabela completa, tenta extrair <tr> diretos
  if (maiorTabela.length === 0) {
    maiorTabela = extrairLinhasDaTabela(htmlStr);
  }

  return maiorTabela;
}

// =============================================================================
// PERSISTÊNCIA NA PLANILHA CONSOLIDADA
// =============================================================================

/**
 * Escreve as linhas de pacientes na planilha consolidada, substituindo
 * quaisquer dados anteriores (idempotente para o bloco de dados).
 *
 * @param {Array<Array<string>>} linhas
 * @param {Object} cfg  CONFIG_PIPELINE
 */
function ingestao_persistirNaPlanilha_(linhas, cfg) {
  const ss  = SpreadsheetApp.openById(cfg.idPlanilhaConsolidada);
  const nomeAba = cfg.nomeAbaConsolidada || 'DADOS';

  let aba = ss.getSheetByName(nomeAba);
  if (!aba) {
    aba = ss.insertSheet(nomeAba);
    logPadrao('INGESTAO', 'Aba "' + nomeAba + '" criada automaticamente.');
  }

  // Garante cabeçalho
  const header = [
    'NOME_UNIDADE', 'NIS',  'CNS', 'CPF',   'NOME_PACIENTE',
    'DATA_NASC',    'IDADE', 'DATA_ACOMP', 'VACINACAO', 'PESO',
    'ALTURA',       'GESTANTE', 'PRE_NATAL', 'DUM'
  ];

  const ultimaLinha = aba.getLastRow();

  if (ultimaLinha === 0) {
    aba.getRange(1, 1, 1, header.length)
      .setValues([header])
      .setFontWeight('bold')
      .setBackground('#cfe2f3');
    aba.setFrozenRows(1);
  }

  // Limpa dados anteriores (mantém cabeçalho)
  if (ultimaLinha > 1) {
    aba.getRange(2, 1, ultimaLinha - 1, header.length).clearContent();
  }

  // Escreve novos dados em batch
  if (linhas.length > 0) {
    const numCols = header.length;
    // Normaliza todas as linhas para exatamente numCols colunas
    const matriz = linhas.map(function(l) {
      const row = [];
      for (let c = 0; c < numCols; c++) row.push(l[c] !== undefined ? l[c] : '');
      return row;
    });

    aba.getRange(2, 1, matriz.length, numCols)
      .setNumberFormat('@')
      .setValues(matriz);
  }

  SpreadsheetApp.flush();
  logPadrao('INGESTAO', linhas.length + ' linhas escritas na aba "' + nomeAba + '".');
}
