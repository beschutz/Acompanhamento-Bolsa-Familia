/**
 * 🏥 SISTEMA MESTRE BOLSA FAMÍLIA - PORTO ALEGRE (CGE/SMS)
 * V9.0 - ATUALIZAÇÃO PARA PLANILHAS PADRONIZADAS (VIGÊNCIA 1/2026)
 * Autor: Bernardo (Refinado por IA)
 */

// =================================================================================
// 1. CONFIGURAÇÕES GLOBAIS
// =================================================================================

const ID_MASTER_DB = "154XdEwS8H7f9ll9Dho0F2Wm6fM7G0uM5uQxyarqztyM";
const NOME_ABA_MESTRE = "DADOS UNIFICADOS"; // Atualizado com espaço conforme seu teste
const ID_FILA_ROBOS_GLOBAL = "1_OMVpaC7T8cVPQJ7eLhPmwdcNvI6CKeueLdU52ccVOQ";
const NOME_ABA_CONFIG_VISUAL = "⚙️ CONFIGURAÇÃO ATIVA";

// ARQUIVOS PARA IGNORAR (Não importa dados destes arquivos)
const BLACKLIST_ARQUIVOS = ["MODELO", "TEMPLATE", "EXEMPLO", "COPIA DE MODELO", "MODELO MAPA"];

// --- DEFINIÇÃO OBRIGATÓRIA DE STATUS ---
const STATUS = {
  CONCLUIDO: "Concluído (Já no E-gestor)",
  PRONTO_EGESTOR: "Pronto p/ E-gestor (Completo)",
  INCOMPLETO: "Incompleto (Fila E-SUS)",
  ACOMP_SEM_DADOS: "Acompanhado s/ Dados (Amarelo)",
  NAO_ACOMP: "Sem Acompanhamento (Fila Final)",
  IGNORADO: "Ignorado (Óbito/Fora de Área)"
};

const CONDICIONALIDADES_DEFAULTS_SAFE = {
  requirePeso: true,
  requireAltura: true,
  requireDataAcomp: true,
  vaccinationRequired: false,
  vaccinationAgeMax: 7
};
// Cache em memória por vigência durante a execução atual para evitar leituras repetidas em ScriptProperties.
// O runtime do Apps Script reinicia entre execuções, então este cache não persiste entre chamadas da API.
let COND_ATIVAS_CACHE = {};


// =================================================================================
// 2. VIGÊNCIA DINÂMICA (PASTAS)
// =================================================================================

function getPastasConfigAtuais() {
  const props = PropertiesService.getScriptProperties();
  const cfgRaw = props.getProperty('VIGENCIA_CONFIG');
  
  if (cfgRaw) {
    const cfg = JSON.parse(cfgRaw);
    return {
      "NORTE": { id: cfg.NORTE, tipo: "SUBPASTAS" },
      "OESTE": { id: cfg.OESTE, tipo: "DIRETA" },
      "SUL": { id: cfg.SUL, tipo: "SUBPASTAS_SUL" },
      "LESTE": { id: cfg.LESTE, tipo: "SUBPASTAS_FILTRADAS", filtroExclusao: "indigenas" }
    };
  }
  
  // Links atualizados da Vigência 1/2026
  return {
    "NORTE": { id: "1xBavbHTLlHU1D7RzooJxqtRgNmnMZC58", tipo: "SUBPASTAS" },
    "OESTE": { id: "", tipo: "DIRETA" }, // Vazio para configurar futuramente
    "SUL": { id: "1PRHyGOUWAA2ki2DROzv8PkjQnFRtgFqT", tipo: "SUBPASTAS_SUL" },
    "LESTE": { id: "", tipo: "SUBPASTAS_FILTRADAS", filtroExclusao: "indigenas" } // Vazio
  };
}

// =================================================================================
// 3. ORQUESTRADOR DE MENU
// =================================================================================

function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('⚙️ Sistema Mestre')
    .addItem('▶️ 1. Importar Dados (Ciclo)', 'executarCicloImportacao')
    .addItem('🔄 2. Atualizar Banco com Fila (Robôs)', 'atualizarMestreComRetornoFila')
    .addSeparator()
    .addItem('📊 Recalcular Cache Dashboard', 'atualizarCacheStats')
    .addItem('👁️ Ver Configuração Ativa', 'exibirAbaConfiguracaoVisual')
    .addItem('🛠️ Resetar Memória', 'reiniciarTudo')
    .addToUi();
}

function reiniciarTudo() {
  PropertiesService.getScriptProperties().deleteAllProperties();
  Browser.msgBox('Memória resetada.');
}

function exibirAbaConfiguracaoVisual() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let aba = ss.getSheetByName(NOME_ABA_CONFIG_VISUAL) || ss.insertSheet(NOME_ABA_CONFIG_VISUAL);
  aba.clear();
  
  const cfgRaw = PropertiesService.getScriptProperties().getProperty('VIGENCIA_CONFIG');
  let dados = [["SITUAÇÃO", "VALOR"], ["VIGÊNCIA", "N/A"], ["", ""], ["ZONA", "LINK ATUAL"]];
  
  if (cfgRaw) {
    const cfg = JSON.parse(cfgRaw);
    dados = [
      ["SITUAÇÃO DO SISTEMA", "INFORMAÇÃO ATUAL"],
      ["VIGÊNCIA ATIVA", cfg.vigencia],
      ["", ""],
      ["ZONA", "LINK / ID DA PASTA"],
      ["NORTE", cfg.NORTE || ""],
      ["SUL", cfg.SUL || ""],
      ["LESTE", cfg.LESTE || ""],
      ["OESTE", cfg.OESTE || ""],
      ["", ""],
      ["ÚLTIMA ATUALIZAÇÃO", cfg.updated_at || "---"]
    ];
  }
  
  aba.getRange(1, 1, dados.length, 2).setValues(dados);
  aba.getRange("A1:B1").setBackground("#3b82f6").setFontColor("white").setFontWeight("bold");
}

// =================================================================================
// 4. MÓDULO DE IMPORTAÇÃO (CRAWLER) - COM NOTIFICAÇÕES TOAST
// =================================================================================

function executarCicloImportacao() {
  const props = PropertiesService.getScriptProperties();
  const tempoInicio = Date.now();
  let estado = JSON.parse(props.getProperty('ESTADO_IMPORTACAO')) || { fase: 'INICIO', listaArquivos: [], indiceArquivo: 0 };
  
  const ssMestre = SpreadsheetApp.openById(ID_MASTER_DB);
  let abaMestre = ssMestre.getSheetByName(NOME_ABA_MESTRE);
  
  if (!abaMestre) {
    abaMestre = ssMestre.insertSheet(NOME_ABA_MESTRE);
    const headers = ["PRIORIDADE", "NIS", "CNS", "NOME", "IDADE", "DATA_NASC", "DATA_ACOMP", "VACINACAO", "PESO", "ALTURA", "GESTANTE", "PRE_NATAL", "DUM", "ORIGEM", "STATUS_CALCULADO", "COR_ORIGEM", "DATA_IMPORTACAO", "CPF", "US_REFERENCIA"];
    abaMestre.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight("bold").setBackground("#cfe2f3");
    abaMestre.setFrozenRows(1);
  }

  if (estado.fase === 'INICIO') {
    mostrarNotificacao("🔍 Iniciando mapeamento de pastas...", 4); 
    estado.listaArquivos = mapearTodosArquivos();
    
    if (estado.listaArquivos.length === 0) {
      Browser.msgBox("Erro: Nenhuma pasta configurada ou encontrada.");
      return { msg: "Erro: Nenhuma pasta configurada.", finished: true };
    }
    
    estado.fase = 'PROCESSAMENTO';
    estado.indiceArquivo = 0;
    props.setProperty('ESTADO_IMPORTACAO', JSON.stringify(estado));
  }

  if (estado.fase === 'PROCESSAMENTO') {
    const mapaMestre = carregarMapaMestre(abaMestre);
    const condCfgAtiva = getCondicionalidadesAtivas_(getVigenciaAtiva_()).config;
    
    while (estado.indiceArquivo < estado.listaArquivos.length) {
      if (Date.now() - tempoInicio > 270000) { // Limite de 4.5 minutos
        props.setProperty('ESTADO_IMPORTACAO', JSON.stringify(estado));
        return {
          msg: `Processado [${estado.indiceArquivo}/${estado.listaArquivos.length}]. Continuando...`,
          finished: false
        };
      }
      
      const arquivo = estado.listaArquivos[estado.indiceArquivo];
      let nomeUpper = arquivo.nome.toUpperCase();
      let ehBlacklist = BLACKLIST_ARQUIVOS.some(termo => nomeUpper.includes(termo));
      
      if (ehBlacklist) {
        estado.indiceArquivo++;
        continue;
      }
      
      mostrarNotificacao(`Lendo [${estado.indiceArquivo + 1}/${estado.listaArquivos.length}]: ${arquivo.nome}`, 3);
      
      try {
        const dadosExtraidos = extrairDadosPlanilha(arquivo.id, arquivo.zona, arquivo.nome, condCfgAtiva);
        
        let novosParaInserir = [];
        let atualizacoesParaGravar = [];
        
        for (let d of dadosExtraidos) {
          while(d.length < 19) d.push(""); // Garante as 19 colunas
          
          let nis = d[1], cns = d[2];
          let registroExistente = (nis && nis.length > 5 && mapaMestre.has(nis)) ? mapaMestre.get(nis) : (cns && cns.length > 5 && mapaMestre.has(cns) ? mapaMestre.get(cns) : null);
          
          if (registroExistente) {
            if (registroExistente.rowIndex > 0) {
              let dadosAtuais = registroExistente.dados;
              while(dadosAtuais.length < 19) dadosAtuais.push("");
              let mudou = false;
              
              for (let k = 5; k <= 12; k++) {
                if (!String(dadosAtuais[k]).trim() && String(d[k]).trim()) {
                  dadosAtuais[k] = d[k];
                  mudou = true;
                }
              }

              if (String(d[18]).trim() !== "" && (String(dadosAtuais[18]).trim() === "" || String(dadosAtuais[18]).includes("GERAL"))) {
                dadosAtuais[18] = d[18];
                mudou = true;
              }
              
              // === RECALCULO INTELIGENTE DE PRIORIDADE E STATUS ===
              let novaPrioridade = parseInt(d[0]);
              let calc = recalcularPrioridadeMestre(dadosAtuais, condCfgAtiva);

              // Escolhe a melhor prioridade entre a calculada (que tem dados mesclados) e a da planilha (que pode ter checkboxes)
              let melhorPrioridade = Math.min(novaPrioridade, calc.prioridade);
              let statusFinal = (melhorPrioridade === calc.prioridade) ? calc.status : d[14];

              // Proteção: Se já estava "Concluído" no banco de dados, NÃO REBAIXA.
              if (parseInt(dadosAtuais[0]) === 0 || String(dadosAtuais[14]).toUpperCase().includes("CONCLUÍDO")) {
                melhorPrioridade = 0;
                statusFinal = dadosAtuais[14];
              }

              // Proteção: Se a planilha atual disse que está "Concluído", respeitamos e concluímos
              if (novaPrioridade === 0) {
                melhorPrioridade = 0;
                statusFinal = d[14];
              }

              // Se a prioridade que calculamos for diferente da atual do banco, ATUALIZAMOS O BANCO!
              if (parseInt(dadosAtuais[0]) !== melhorPrioridade || String(dadosAtuais[14]) !== statusFinal) {
                dadosAtuais[0] = melhorPrioridade;
                dadosAtuais[14] = statusFinal;
                mudou = true;
              }
              
              if (mudou) atualizacoesParaGravar.push({ row: registroExistente.rowIndex, dados: dadosAtuais });
            }
          } else {
            novosParaInserir.push(d);
            if (nis && nis.length > 5) mapaMestre.set(nis, {dados: d, rowIndex: -1});
            else if (cns && cns.length > 5) mapaMestre.set(cns, {dados: d, rowIndex: -1});
          }
        }
        
        for (let up of atualizacoesParaGravar) {
          abaMestre.getRange(up.row, 1, 1, up.dados.length).setValues([up.dados]);
        }
        
        if (novosParaInserir.length > 0) {
          abaMestre.getRange(abaMestre.getLastRow() + 1, 1, novosParaInserir.length, novosParaInserir[0].length).setValues(novosParaInserir);
        }
      } catch (e) {
        mostrarNotificacao(`⚠️ ERRO no arquivo ${arquivo.nome}: ${e.message}`, 8);
      }
      
      estado.indiceArquivo++;
      props.setProperty('ESTADO_IMPORTACAO', JSON.stringify(estado));
    }
    
    props.deleteProperty('ESTADO_IMPORTACAO');
    
    try {
      if (typeof atualizarCacheStats === 'function') atualizarCacheStats();
    } catch(e) {}
    
    mostrarNotificacao("✅ Importação Finalizada com Sucesso!", 10);
    
    return { msg: "Importação Finalizada com Sucesso!", finished: true };
  }
}

// =================================================================================
// 5. MÓDULO DE EXTRAÇÃO PADRONIZADA COM MÚLTIPLAS ABAS (VIGÊNCIA 1/2026)
// =================================================================================

function extrairDadosPlanilha(idPlanilha, zona, nomeArquivo, condCfg) {
  const ss = SpreadsheetApp.openById(idPlanilha);
  
  // Lista com todos os nomes possíveis que as unidades de saúde estão usando
  const NOMES_ABAS_POSSIVEIS = [
    "MAPA INDIVIDUALIZADO VIGÊNCIA 1/2026",
    "MAPA INDIVIDUALIZADO VIGÊNCIA 2026/1",
    "MAPA POR FAMILIA 1/2026",
    "MAPA POR FAMILIA 2026/1",
    "MAPA OFICIAL 2026/1"
  ];
  
  let abasEncontradas = [];
  
  // Verifica quais abas existem neste arquivo específico
  for (let nome of NOMES_ABAS_POSSIVEIS) {
    const aba = ss.getSheetByName(nome);
    if (aba) abasEncontradas.push(aba);
  }
  
  if (abasEncontradas.length === 0) {
    Logger.log(`[IGNORADO] Nenhuma aba padronizada encontrada em: ${nomeArquivo}`);
    return [];
  }

  const nomeUnidade = extrairNomeUnidade(nomeArquivo);
  const hoje = new Date();
  
  // Usaremos um Map para desduplicar caso a mesma pessoa esteja em várias abas do mesmo arquivo
  let mapaPacientes = new Map();
  
  for (let abaAlvo of abasEncontradas) {
    const dadosBrutos = abaAlvo.getDataRange().getDisplayValues();
    const nomeAba = abaAlvo.getName();
    const cabecalhoInfo = encontrarLinhaCabecalhoImport_(dadosBrutos);
    
    if (!cabecalhoInfo) {
      Logger.log(`[IMPORT][WARN][${zona}] Arquivo "${nomeArquivo}" | Unidade "${nomeUnidade}" | Aba "${nomeAba}": cabeçalho não reconhecido.`);
      continue;
    }
    
    const col = cabecalhoInfo.colunas;
    const faltantesCriticas = [];
    if (col.nome === undefined) faltantesCriticas.push("nome");
    if (col.nis === undefined && col.cpf === undefined) faltantesCriticas.push("nis/cpf");
    
    if (faltantesCriticas.length > 0) {
      Logger.log(`[IMPORT][WARN][${zona}] Arquivo "${nomeArquivo}" | Unidade "${nomeUnidade}" | Aba "${nomeAba}": colunas críticas ausentes (${faltantesCriticas.join(", ")}).`);
      continue;
    }
    
    for (let i = cabecalhoInfo.linhaCabecalho + 1; i < dadosBrutos.length; i++) {
      const linha = dadosBrutos[i];
      
      let nis = limparNumeroComPrefixo(obterValorPorChaveImport_(linha, col, "nis"));
      let cns = limparNumeroComPrefixo(obterValorPorChaveImport_(linha, col, "cns"));
      let cpf = limparNumeroComPrefixo(obterValorPorChaveImport_(linha, col, "cpf"));
      let nome = limparTexto(obterValorPorChaveImport_(linha, col, "nome"));
      let colA_Bruta = String(obterValorPorChaveImport_(linha, col, "nis") || linha[0] || "").toLowerCase();

      // Pula linhas em branco, ou a linha de "Cód. Família" (que não tem NIS/CPF validos)
      if (colA_Bruta.includes("cód") || colA_Bruta.includes("código")) continue;
      if ((nis.length < 7 && cpf.length < 10) || nome.length < 3) continue;
      
      let dataNasc = normalizarData(obterValorPorChaveImport_(linha, col, "data_nascimento"));
      let acompUS = limparCategorico(obterValorPorChaveImport_(linha, col, "acompanhado_na_us"));
      let dataAcomp = normalizarData(obterValorPorChaveImport_(linha, col, "data_acompanhamento"));
      let peso = normalizarNumero(obterValorPorChaveImport_(linha, col, "peso"));
      let altura = normalizarAltura(obterValorPorChaveImport_(linha, col, "altura_estatura"));
      let vacina = limparCategorico(obterValorPorChaveImport_(linha, col, "vacinacao_em_dia"));
      let gestante = limparCategorico(obterValorPorChaveImport_(linha, col, "informacao_gestacional"));
      let dum = normalizarData(obterValorPorChaveImport_(linha, col, "dum"));
      let preNatal = limparCategorico(obterValorPorChaveImport_(linha, col, "pre_natal"));
      let acompEgestor = limparCategorico(obterValorPorChaveImport_(linha, col, "acompanhado_no_egestor"));
      
      let idade = "";
      if (dataNasc) idade = calcularIdade(dataNasc);
      
      let resultado = classificarPaciente(peso, altura, dataAcomp, idade, vacina, acompUS, acompEgestor, gestante, "QUALQUER", condCfg);
      
      // Master DB [0:PRIORIDADE, 1:NIS, 2:CNS, 3:NOME, 4:IDADE, 5:DATA_NASC, 6:DATA_ACOMP, 7:VACINACAO, 8:PESO, 9:ALTURA, 10:GESTANTE, 11:PRE_NATAL, 12:DUM, 13:ORIGEM, 14:STATUS_CALCULADO, 15:COR_ORIGEM, 16:DATA_IMPORTACAO, 17:CPF, 18:US_REFERENCIA]
      let novoRegistro = [ 
        resultado.prioridade, nis, "", nome, idade, dataNasc, dataAcomp, vacina, peso, altura, 
        gestante, preNatal, dum, zona, resultado.status, "", hoje, cpf, nomeUnidade 
      ];
      novoRegistro[2] = cns;
      
      let chavePessoa = nis || cns || cpf || nome;
      
      if (mapaPacientes.has(chavePessoa)) {
        let registroExistente = mapaPacientes.get(chavePessoa);
        let prioridadeExistente = parseInt(registroExistente[0]);
        let prioridadeNova = parseInt(novoRegistro[0]);
        
        // Se a nova linha tem uma prioridade melhor (número menor, ex: 1 vence 2), ela substitui a antiga
        if (prioridadeNova < prioridadeExistente) {
          mapaPacientes.set(chavePessoa, novoRegistro);
        } else if (prioridadeNova === prioridadeExistente) {
          // Se tiverem a mesma prioridade, vamos preencher os campos vazios na linha antiga com dados da nova
          for (let k = 5; k <= 12; k++) {
            if (!registroExistente[k] && novoRegistro[k]) {
              registroExistente[k] = novoRegistro[k];
            }
          }
        }
      } else {
        mapaPacientes.set(chavePessoa, novoRegistro);
      }
    }
  }
  
  // Retorna todos os pacientes de forma limpa (sem duplicações entre abas do mesmo arquivo)
  return Array.from(mapaPacientes.values());
}

function normalizarCabecalhoImport_(txt) {
  let limpo = String(txt || "").toLowerCase();
  limpo = limpo.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  limpo = limpo.replace(/[\r\n]+/g, " ");
  limpo = limpo.replace(/\((?:[bcd])\)/gi, " ");
  limpo = limpo.replace(/[^\w\s]/g, " ");
  limpo = limpo.replace(/\s+/g, " ").trim();
  return limpo;
}

function getAliasesCabecalhoImport_() {
  if (getAliasesCabecalhoImport_._cache) return getAliasesCabecalhoImport_._cache;
  
  const aliases = {
    nis: [
      "nis",
      "nis numero de identificacao social",
      "numero de identificacao social"
    ],
    cns: [
      "cns",
      "cns cartao nacional de saude",
      "cartao nacional de saude"
    ],
    cpf: ["cpf"],
    nome: ["nome", "nome completo"],
    data_nascimento: ["data nascimento", "data de nascimento", "dt nascimento"],
    data_acompanhamento: ["data acompanhamento", "data de acompanhamento", "dt acompanhamento"],
    acompanhado_na_us: ["acompanhado na us", "acompanhado us", "acompanhado na unidade de saude"],
    motivo_nao_acompanhamento: ["motivo nao acompanhamento", "motivo nao acompanhou", "motivo do nao acompanhamento"],
    peso: ["peso", "peso kg", "peso em kg"],
    altura_estatura: ["altura", "altura cm", "altura em cm", "estatura", "estatura cm", "estatura em cm"],
    vacinacao_em_dia: ["vacina", "vacinacao em dia", "vacinacao em dia b"],
    motivo_nao_vacinacao: ["motivo nao vacinacao", "motivo nao vacinou", "motivo da nao vacinacao"],
    informacao_gestacional: ["gestante", "informacao gestacional", "informacao de gestacao"],
    pre_natal: ["pre natal", "realizou o pre natal", "se gestante realizou o pre natal"],
    dum: ["dum", "d u m"],
    acompanhado_no_egestor: ["acompanhado no egestor", "acompanhado no gestor", "acompanhado egestor"],
    observacoes: ["observacoes", "observacao", "obs"]
  };
  
  const normalizado = {};
  for (let chave in aliases) {
    normalizado[chave] = aliases[chave].map(a => normalizarCabecalhoImport_(a));
  }
  
  getAliasesCabecalhoImport_._cache = normalizado;
  return normalizado;
}

function mapearIndicesCabecalhoImport_(linhaCabecalho) {
  const aliases = getAliasesCabecalhoImport_();
  const colunas = {};
  
  for (let i = 0; i < linhaCabecalho.length; i++) {
    const cabNorm = normalizarCabecalhoImport_(linhaCabecalho[i]);
    if (!cabNorm) continue;
    
    for (let chave in aliases) {
      if (colunas[chave] !== undefined) continue;
      const sinonimos = aliases[chave];
      const match = sinonimos.some(s => cabNorm === s || contemAliasComoPalavra_(cabNorm, s));
      if (match) {
        colunas[chave] = i;
      }
    }
  }
  
  return colunas;
}

function encontrarLinhaCabecalhoImport_(dadosBrutos) {
  const limite = Math.min(dadosBrutos.length, 20);
  
  for (let i = 0; i < limite; i++) {
    const linha = dadosBrutos[i] || [];
    const colunas = mapearIndicesCabecalhoImport_(linha);
    const temIdentificador = colunas.nis !== undefined || colunas.cpf !== undefined || colunas.cns !== undefined;
    
    if (temIdentificador && colunas.nome !== undefined) {
      return { linhaCabecalho: i, colunas: colunas };
    }
  }
  
  return null;
}

function obterValorPorChaveImport_(linha, colunas, chave) {
  const idx = colunas[chave];
  if (idx === undefined || idx < 0 || idx >= linha.length) return "";
  return linha[idx];
}

function contemAliasComoPalavra_(texto, alias) {
  if (!texto || !alias) return false;
  const aliasEscapado = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(^|\\s)${aliasEscapado}(\\s|$)`);
  return regex.test(texto);
}

function validarMapeamentoCabecalhosImportacao_() {
  const cabecalhoPadrao = [
    "NIS", "CPF", "NOME", "DATA NASCIMENTO", "ACOMPANHADO NA US", "DATA ACOMPANHAMENTO", "PESO (kg)", "ALTURA (cm)",
    "VACINA", "MOTIVO NÃO VACINAÇÃO", "GESTANTE", "DUM", "PRÉ-NATAL", "TELEFONE", "ENDEREÇO", "ACOMPANHADO NO EGESTOR", "OBSERVAÇÕES", "FORA DE ÁREA"
  ];
  
  const cabecalhoLeste = [
    "NIS\n(Número de Identificação Social)", "CNS\nCartão Nacional de Saúde", "CPF", "Nome", "Data de nascimento", "Data de acompanhamento",
    "Acompanhado na US", "Motivo não acompanhamento", "Peso em kg (B)", "Estatura em cm (B)",
    "Ocorrência identificada - Não Informação Nutricional", "Vacinação em dia? (B)", "Motivo não Vacinação",
    "Informação\nGestacional (C)", "Se gestante - Realizou o Pré-Natal? (D)", "DUM (D)", "ACOMPANHADO NO EGESTOR", "OBSERVAÇÕES"
  ];
  
  const casos = [
    { nome: "PADRAO", header: cabecalhoPadrao, obrigatorias: ["nis", "cpf", "nome", "data_nascimento", "data_acompanhamento", "acompanhado_na_us", "peso", "altura_estatura", "vacinacao_em_dia", "informacao_gestacional", "pre_natal", "dum", "acompanhado_no_egestor", "observacoes"] },
    { nome: "LESTE", header: cabecalhoLeste, obrigatorias: ["nis", "cns", "cpf", "nome", "data_nascimento", "data_acompanhamento", "acompanhado_na_us", "motivo_nao_acompanhamento", "peso", "altura_estatura", "vacinacao_em_dia", "motivo_nao_vacinacao", "informacao_gestacional", "pre_natal", "dum", "acompanhado_no_egestor", "observacoes"] }
  ];
  
  let falhas = [];
  
  for (let caso of casos) {
    const mapeamento = mapearIndicesCabecalhoImport_(caso.header);
    const faltantes = caso.obrigatorias.filter(c => mapeamento[c] === undefined);
    if (faltantes.length) {
      falhas.push(`${caso.nome}: ${faltantes.join(", ")}`);
    }
  }
  
  if (falhas.length) {
    throw new Error(`Falha na validação de mapeamento de cabeçalhos: ${falhas.join(" | ")}`);
  }
  
  Logger.log("Validação de mapeamento de cabeçalhos concluída com sucesso (PADRÃO e LESTE).");
  return true;
}

// LÓGICA DE PRIORIDADES (ATUALIZADA)
function classificarPaciente(peso, altura, dataAcomp, idade, vacina, acompUS, acompEgestor, gestante, sexo, condCfg) {
  // 0. Prioridade Máxima: Já acompanhado no e-Gestor
  if (acompEgestor === "SIM") return { status: STATUS.CONCLUIDO, prioridade: 0 };
  
  const simulacao = simularCondicionalidadesInterno_({
    idade: idade,
    sexo: sexo || "QUALQUER",
    pesoPresente: peso !== "" && peso !== "-",
    alturaPresente: altura !== "" && altura !== "-",
    dataAcompPresente: dataAcomp !== "" && dataAcomp !== "-",
    vacinacaoPresente: Boolean(String(vacina).match(/^(sim|em dia|ok|s)$/i)),
    acompUS: acompUS,
    acompEgestor: acompEgestor,
    gestante: gestante
  }, condCfg);

  if (simulacao && simulacao.status && simulacao.prioridade !== undefined) {
    return { status: simulacao.status, prioridade: simulacao.prioridade };
  }

  // Fallback seguro em caso de erro inesperado
  return { status: STATUS.NAO_ACOMP, prioridade: 4 };
}

// RECALCULA A PRIORIDADE COM BASE NOS DADOS MESCLADOS (USADO PELO ATUALIZADOR)
function recalcularPrioridadeMestre(row, condCfg) {
  let idade = row[4];
  let dataAcomp = String(row[6]).trim();
  let vacina = String(row[7]).trim();
  let peso = String(row[8]).trim();
  let altura = String(row[9]).trim();
  let gestante = String(row[10]).trim();

  const simulacao = simularCondicionalidadesInterno_({
    idade: idade,
    sexo: "QUALQUER",
    pesoPresente: peso !== "" && peso !== "-",
    alturaPresente: altura !== "" && altura !== "-",
    dataAcompPresente: dataAcomp !== "" && dataAcomp !== "-",
    vacinacaoPresente: Boolean(vacina.match(/^(sim|em dia|ok|s)$/i)),
    acompUS: "",
    acompEgestor: "",
    gestante: gestante
  }, condCfg);

  if (simulacao && simulacao.status && simulacao.prioridade !== undefined) {
    return { prioridade: simulacao.prioridade, status: simulacao.status };
  }
  return { prioridade: 4, status: STATUS.NAO_ACOMP };
}

function getVigenciaAtiva_() {
  try {
    const cfg = JSON.parse(PropertiesService.getScriptProperties().getProperty('VIGENCIA_CONFIG') || "{}");
    return String(cfg.vigencia || "").trim();
  } catch (e) {
    return "";
  }
}

function getCondicionalidadesPadrao_() {
  return JSON.parse(JSON.stringify({
    version: 1,
    defaults: CONDICIONALIDADES_DEFAULTS_SAFE,
    rules: []
  }));
}

function getCondicionalidadesAtivas_(vigencia) {
  const props = PropertiesService.getScriptProperties();
  const key = 'COND_RULES_BY_VIGENCIA';
  const vig = String(vigencia || getVigenciaAtiva_() || "DEFAULT").trim();
  if (COND_ATIVAS_CACHE[vig]) return COND_ATIVAS_CACHE[vig];

  try {
    const all = JSON.parse(props.getProperty(key) || "{}");
    const saved = all[vig];
    if (saved && saved.defaults) {
      const result = {
        vigencia: vig,
        config: mergeCondicionalidadesComPadrao_(saved),
        source: "saved"
      };
      COND_ATIVAS_CACHE[vig] = result;
      return result;
    }
  } catch (e) {}

  const fallback = {
    vigencia: vig,
    config: getCondicionalidadesPadrao_(),
    source: "fallback"
  };
  COND_ATIVAS_CACHE[vig] = fallback;
  return fallback;
}

function resetCondicionalidadesCache_(vigencia) {
  const vig = String(vigencia || "").trim();
  if (vig) {
    delete COND_ATIVAS_CACHE[vig];
    return;
  }
  // Sem vigência explícita: limpa todo o cache em memória da execução atual.
  COND_ATIVAS_CACHE = {};
}

function mergeCondicionalidadesComPadrao_(cfg) {
  const base = getCondicionalidadesPadrao_();
  const inCfg = cfg || {};
  const defaults = inCfg.defaults || {};
  const merged = {
    version: parseInt(inCfg.version, 10) || 1,
    defaults: {
      requirePeso: defaults.requirePeso ?? true,
      requireAltura: defaults.requireAltura ?? true,
      requireDataAcomp: defaults.requireDataAcomp ?? true,
      vaccinationRequired: defaults.vaccinationRequired ?? false,
      vaccinationAgeMax: (defaults.vaccinationAgeMax === "" || defaults.vaccinationAgeMax === null || defaults.vaccinationAgeMax === undefined) ? base.defaults.vaccinationAgeMax : parseInt(defaults.vaccinationAgeMax, 10)
    },
    rules: Array.isArray(inCfg.rules) ? inCfg.rules : []
  };

  if (isNaN(merged.defaults.vaccinationAgeMax)) merged.defaults.vaccinationAgeMax = base.defaults.vaccinationAgeMax;
  return merged;
}

function regraCasaComPaciente_(when, input) {
  const cond = when || {};
  const idadeNum = parseInt(input.idade, 10);
  const sexoPac = String(input.sexo || "").toUpperCase().trim();

  if (cond.ageMin !== undefined && cond.ageMin !== null && cond.ageMin !== "") {
    if (isNaN(idadeNum) || idadeNum < parseInt(cond.ageMin, 10)) return false;
  }
  if (cond.ageMax !== undefined && cond.ageMax !== null && cond.ageMax !== "") {
    if (isNaN(idadeNum) || idadeNum > parseInt(cond.ageMax, 10)) return false;
  }

  const sexoRegra = String(cond.sexo || "QUALQUER").toUpperCase().trim();
  const exigeSexoEspecifico = sexoRegra !== "QUALQUER" && sexoRegra !== "";
  if (exigeSexoEspecifico && (!sexoPac || sexoPac !== sexoRegra)) return false;

  return true;
}

function calcularRequisitosFinais_(input, cfg) {
  const merged = mergeCondicionalidadesComPadrao_(cfg);
  const req = JSON.parse(JSON.stringify(merged.defaults));
  const appliedRules = [];
  let hasRuleVaccinationOverride = false;

  for (let i = 0; i < merged.rules.length; i++) {
    const rule = merged.rules[i] || {};
    if (!regraCasaComPaciente_(rule.when, input)) continue;
    const set = rule.set || {};

    if (typeof set.requirePeso === "boolean") req.requirePeso = set.requirePeso;
    if (typeof set.requireAltura === "boolean") req.requireAltura = set.requireAltura;
    if (typeof set.requireDataAcomp === "boolean") req.requireDataAcomp = set.requireDataAcomp;
    if (typeof set.vaccinationRequired === "boolean") {
      req.vaccinationRequired = set.vaccinationRequired;
      hasRuleVaccinationOverride = true;
    }
    if (set.vaccinationAgeMax !== undefined && set.vaccinationAgeMax !== null && set.vaccinationAgeMax !== "") {
      const ageMax = parseInt(set.vaccinationAgeMax, 10);
      if (!isNaN(ageMax)) req.vaccinationAgeMax = ageMax;
    }

    appliedRules.push({
      index: i,
      name: rule.name || `Regra ${i + 1}`
    });
  }

  const idadeNum = parseInt(input.idade, 10);
  if (!hasRuleVaccinationOverride && !isNaN(idadeNum) && req.vaccinationAgeMax !== null && req.vaccinationAgeMax !== undefined && req.vaccinationAgeMax !== "") {
    req.vaccinationRequired = idadeNum <= parseInt(req.vaccinationAgeMax, 10);
  }

  return { requisitos: req, appliedRules: appliedRules };
}

function simularCondicionalidadesInterno_(input, cfg) {
  const inData = input || {};
  const acompEgestor = String(inData.acompEgestor || "").toUpperCase().trim();
  if (acompEgestor === "SIM") {
    return {
      status: STATUS.CONCLUIDO,
      prioridade: 0,
      faltantes: [],
      appliedRules: []
    };
  }

  const conf = cfg || getCondicionalidadesAtivas_(getVigenciaAtiva_()).config;
  const calc = calcularRequisitosFinais_(inData, conf);
  const req = calc.requisitos;

  const temPeso = inData.pesoPresente === true;
  const temAltura = inData.alturaPresente === true;
  const temDataAcomp = inData.dataAcompPresente === true;
  const temVacina = inData.vacinacaoPresente === true;
  const acompUS = String(inData.acompUS || "").toUpperCase().trim();
  const gestante = String(inData.gestante || "").toUpperCase().trim();

  const faltantes = [];
  if (req.requirePeso && !temPeso) faltantes.push("peso");
  if (req.requireAltura && !temAltura) faltantes.push("altura");
  if (req.requireDataAcomp && !temDataAcomp) faltantes.push("dataAcomp");
  if (req.vaccinationRequired && !temVacina) faltantes.push("vacinacao");

  const blocosObrigatoriosOk = (!req.requirePeso || temPeso) && (!req.requireAltura || temAltura) && (!req.requireDataAcomp || temDataAcomp);
  const vacinacaoOk = (!req.vaccinationRequired || temVacina);
  const temBiometriaParcial = temPeso || temAltura;

  if (blocosObrigatoriosOk) {
    if (!vacinacaoOk) {
      return { status: STATUS.INCOMPLETO, prioridade: 2, faltantes: faltantes, requisitos: req, appliedRules: calc.appliedRules };
    }
    return { status: STATUS.PRONTO_EGESTOR, prioridade: 1, faltantes: [], requisitos: req, appliedRules: calc.appliedRules };
  }

  if (temBiometriaParcial) {
    return { status: STATUS.INCOMPLETO, prioridade: 2, faltantes: faltantes, requisitos: req, appliedRules: calc.appliedRules };
  }

  if (acompUS === "SIM" || gestante === "SIM" || temDataAcomp) {
    return { status: STATUS.ACOMP_SEM_DADOS, prioridade: 3, faltantes: faltantes, requisitos: req, appliedRules: calc.appliedRules };
  }

  return { status: STATUS.NAO_ACOMP, prioridade: 4, faltantes: faltantes, requisitos: req, appliedRules: calc.appliedRules };
}

// =================================================================================
// 6. MÓDULO DE SINCRONIZAÇÃO (PÓS-ROBÔ)
// =================================================================================

function atualizarMestreComRetornoFila() {
  Logger.log(">>> INICIANDO SINCRONIZAÇÃO ROBÔS -> MESTRE...");
  const ssMestre = SpreadsheetApp.openById(ID_MASTER_DB);
  const abaMestre = ssMestre.getSheetByName(NOME_ABA_MESTRE);
  const ssFila = SpreadsheetApp.openById(ID_FILA_ROBOS_GLOBAL);
  
  if (!abaMestre || !ssFila) return "Erro: Planilhas não encontradas.";
  
  const mapaMestre = carregarMapaMestre(abaMestre);
  const condCfgAtiva = getCondicionalidadesAtivas_(getVigenciaAtiva_()).config;
  let atualizados = 0;

  // A. E-GESTOR
  const abaGestor = ssFila.getSheetByName("E-gestor");
  if (abaGestor) {
    const dadosGestor = abaGestor.getDataRange().getValues();
    for (let i = 1; i < dadosGestor.length; i++) {
      let status = String(dadosGestor[i][7]).toUpperCase();
      if (status.includes("GESTOR") || status.includes("SUS AB")) {
        let nis = String(dadosGestor[i][0]).trim();
        if (nis && mapaMestre.has(nis)) {
          let reg = mapaMestre.get(nis);
          abaMestre.getRange(reg.rowIndex, 1).setValue(0);
          abaMestre.getRange(reg.rowIndex, 15).setValue(STATUS.CONCLUIDO);
          abaMestre.getRange(reg.rowIndex, 17).setValue(new Date());
          atualizados++;
        }
      }
    }
  }

  // B. E-SUS
  const abaEsus = ssFila.getSheetByName("E-sus");
  if (abaEsus) {
    const dadosEsus = abaEsus.getDataRange().getValues();
    for (let i = 1; i < dadosEsus.length; i++) {
      let statusRobo = String(dadosEsus[i][13]).toUpperCase();
      
      if (statusRobo.includes("PROCESSADO") || statusRobo.includes("ENCONTRADO") || statusRobo.includes("COMPLETO")) {
        let nis = String(dadosEsus[i][0]).trim();
        let cns = String(dadosEsus[i][1]).trim();
        let chave = (nis && nis.length > 5) ? nis : (cns && cns.length > 5 ? cns : null);
        
        if (chave && mapaMestre.has(chave)) {
          let reg = mapaMestre.get(chave);
          let row = reg.rowIndex;
          let dadosAtuais = reg.dados; 

          let mudouInfo = false;

          if(dadosEsus[i][5] && String(dadosEsus[i][5]).trim() !== "-") { dadosAtuais[6] = dadosEsus[i][5]; mudouInfo = true; }
          if(dadosEsus[i][6] && String(dadosEsus[i][6]).trim() !== "-") { dadosAtuais[7] = dadosEsus[i][6]; mudouInfo = true; }
          if(dadosEsus[i][7] && String(dadosEsus[i][7]).trim() !== "-") { dadosAtuais[8] = dadosEsus[i][7]; mudouInfo = true; }
          if(dadosEsus[i][8] && String(dadosEsus[i][8]).trim() !== "-") { dadosAtuais[9] = dadosEsus[i][8]; mudouInfo = true; }
          
          if (mudouInfo) {
            abaMestre.getRange(row, 7).setValue(dadosAtuais[6]); 
            abaMestre.getRange(row, 8).setValue(dadosAtuais[7]); 
            abaMestre.getRange(row, 9).setValue(dadosAtuais[8]); 
            abaMestre.getRange(row, 10).setValue(dadosAtuais[9]); 
          }

          let calc = recalcularPrioridadeMestre(dadosAtuais, condCfgAtiva);
          
          let prioridadeAntiga = parseInt(dadosAtuais[0]);
          let prioridadeFinal = calc.prioridade;
          let statusFinal = calc.status;

          // REGRA DE PROTEÇÃO DE PRIORIDADE: A melhor prioridade (menor número) sempre vence!
          if (!isNaN(prioridadeAntiga) && prioridadeAntiga < prioridadeFinal) {
              prioridadeFinal = prioridadeAntiga;
              statusFinal = dadosAtuais[14]; // Mantém o status textual original para não confundir
          }

          abaMestre.getRange(row, 1).setValue(prioridadeFinal);
          abaMestre.getRange(row, 15).setValue(statusFinal); 
          abaMestre.getRange(row, 17).setValue(new Date());
          
          atualizados++;
        }
      }
    }
  }

  try {
    if (typeof atualizarCacheStats === 'function') atualizarCacheStats();
  } catch(e) {}
  
  Logger.log(`>>> SINCRONIZAÇÃO CONCLUÍDA: ${atualizados} REGISTROS ATUALIZADOS.`);
  return `Sincronização: ${atualizados} registros atualizados no Mestre.`;
}

// =================================================================================
// 7. FUNÇÕES AUXILIARES DE FORMATAÇÃO E CRAWLER
// =================================================================================

function carregarMapaMestre(aba) {
  const ultLinha = aba.getLastRow();
  let mapa = new Map();
  if (ultLinha < 2) return mapa;
  const dados = aba.getDataRange().getValues();
  for (let i = 1; i < dados.length; i++) {
    let linha = dados[i];
    let nis = String(linha[1]).trim(), cns = String(linha[2]).trim();
    let info = { dados: dados[i], rowIndex: i + 1 };
    if (nis && nis.length > 5) mapa.set(nis, info);
    else if (cns && cns.length > 5) mapa.set(cns, info);
  }
  return mapa;
}

function limparTexto(txt) { return String(txt).replace(/^[\d\.]+\s*-\s*/, "").trim().toUpperCase(); }
function limparCategorico(txt) { return String(txt).replace(/^[\d\.]+\s*-\s*/, "").trim().toUpperCase(); }
function limparNumeroComPrefixo(txt) { return String(txt).replace(/^\s*[\d\.]+\s*-\s*/, "").replace(/\D/g, ""); }

function normalizarNumero(txt) { 
  let limpo = String(txt).replace(/^[\d\.]+\s*-\s*/, "").replace(/(kg|cm)/gi, "").replace(",", ".").trim(); 
  if (isNaN(limpo) || limpo === "") return ""; 
  return limpo.replace(".", ","); 
}

function normalizarAltura(txt) { 
  let val = normalizarNumero(txt); 
  if (!val) return ""; 
  let num = parseFloat(val.replace(",", ".")); 
  if (num < 3.0 && num > 0) num = num * 100; 
  return Math.round(num); 
}

function normalizarData(txt) { 
  let limpo = String(txt).replace(/^[\d\.]+\s*-\s*/, "").trim(); 
  let match = limpo.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/); 
  if (match) { 
    let d = match[1].padStart(2, '0'), m = match[2].padStart(2, '0'), a = match[3]; 
    if (a.length === 2) a = "20" + a; 
    return `${d}/${m}/${a}`; 
  } 
  return ""; 
}

function calcularIdade(dataStr) { 
  try { 
    let p = dataStr.split('/'); 
    if(p.length < 3) return "";
    let nasc = new Date(p[2], p[1]-1, p[0]); 
    let hoje = new Date(); 
    let id = hoje.getFullYear() - nasc.getFullYear(); 
    if (hoje < new Date(hoje.getFullYear(), nasc.getMonth(), nasc.getDate())) id--; 
    return id; 
  } catch(e) { return ""; } 
}

function extrairNomeUnidade(nomeArquivo) {
  if (!nomeArquivo) return "";
  let limpo = nomeArquivo.replace(/\.xlsx?$/i, "")
                         .replace(/^Cópia de\s+/i, "")
                         .replace(/^Copy of\s+/i, "")
                         .trim();
  let partes = limpo.split(/\s*-\s*/);
  if (partes.length === 1) return limpo.toUpperCase();
  
  let parteUnidade = partes.find(p => /^(US|CF|UBS|ESF)\s/i.test(p.trim()));
  if (parteUnidade) return parteUnidade.trim().toUpperCase();
  
  parteUnidade = partes.find(p => !/MAPA|BOLSA|ACOMP|2025|25\/2|2026|FAMÍLIA|GERAL|RELAT[ÓO]RIO/i.test(p));
  return parteUnidade ? parteUnidade.trim().toUpperCase() : limpo.toUpperCase();
}

function mapearTodosArquivos() {
  let lista = [];
  const pastasDinamicas = getPastasConfigAtuais();
  
  for (let z in pastasDinamicas) {
    const cfg = pastasDinamicas[z];
    if (!cfg.id) continue; // Pula Leste/Oeste que estão vazias por enquanto
    
    try {
      const pasta = DriveApp.getFolderById(cfg.id);
      if (cfg.tipo === "SUBPASTAS_SUL") {
        let subs = pasta.getFolders(); 
        while (subs.hasNext()) listarArquivos(subs.next(), z, lista);
      } else if (cfg.tipo === "DIRETA") {
        listarArquivos(pasta, z, lista);
      } else if (cfg.tipo === "SUBPASTAS") {
        listarArquivos(pasta, z, lista); 
        let subs = pasta.getFolders(); 
        while (subs.hasNext()) listarArquivos(subs.next(), z, lista);
      } else if (cfg.tipo === "SUBPASTAS_FILTRADAS") {
        listarArquivos(pasta, z, lista); 
        let subs = pasta.getFolders(); 
        while (subs.hasNext()) {
          let sp = subs.next(); 
          if (!sp.getName().toLowerCase().includes(cfg.filtroExclusao)) listarArquivos(sp, z, lista);
        }
      }
    } catch(e) {
      Logger.log("Erro ao acessar pasta da zona " + z + ": " + e.message);
    }
  }
  return lista;
}

function listarArquivos(p, z, l) {
  let a = p.getFilesByType(MimeType.GOOGLE_SHEETS);
  while(a.hasNext()) {
    let f = a.next();
    l.push({ id: f.getId(), nome: f.getName(), zona: z });
  }
}

// =================================================================================
// 8. INTERFACE DE USUÁRIO (UI)
// =================================================================================

function mostrarNotificacao(mensagem, tempoSegundos = 5) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  // O formato é: ss.toast(Mensagem, Título, Tempo de exibição)
  ss.toast(mensagem, "⚙️ Sistema Mestre", tempoSegundos);
}
