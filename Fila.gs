/**
 * 🏭 CENTRO DE DISTRIBUIÇÃO (V9.0 - VIGÊNCIA 1/2026)
 * Responsável por enviar dados do Master DB para:
 * 1. Planilhas Regionais (Visualização dos Gerentes)
 * 2. Planilha de Fila (Automação/Robôs)
 */

// =================================================================================
// CONSTANTES LOCAIS
// =================================================================================

// IDs Globais
const ID_MASTER_DB_DIST = "154XdEwS8H7f9ll9Dho0F2Wm6fM7G0uM5uQxyarqztyM";
const NOME_ABA_MESTRE_DIST = "DADOS UNIFICADOS"; // Corrigido para remover o underline da versão nova

// Indices das Colunas no Array de Dados Processados (Master DB Atualizado V9)
const IDX = {
  PRIORIDADE: 0, NIS: 1, CNS: 2, NOME: 3, IDADE: 4, DATA_NASC: 5,
  DATA_ACOMP: 6, VACINACAO: 7, PESO: 8, ALTURA: 9, GESTANTE: 10,
  PRE_NATAL: 11, DUM: 12, ORIGEM: 13, STATUS_CALCULADO: 14, COR_ORIGEM: 15, DATA_IMPORTACAO: 16,
  CPF: 17, US_REFERENCIA: 18
};

// =================================================================================
// CONFIGURAÇÕES DE DESTINO
// =================================================================================

// IDs das Planilhas de Destino
const ID_FILA_ROBOS = "1_OMVpaC7T8cVPQJ7eLhPmwdcNvI6CKeueLdU52ccVOQ";

// IDs das Planilhas de Zona
const PLANILHAS_ZONAS = {
  "LESTE": "1wYmGeD2Lda2w8ii-xfSRLRdxSGjgyHFTiMrd1ItgGvA",
  "OESTE": "1pcHhn4ooSIudKiM597st7mogQCZvjhXrnMOWyswoYKM",
  "SUL":   "1opMH88nQYZRUEba-fwPCvt9pVYaLsRP5o1_NCwpIhj8",
  "NORTE": "1C8pZJLCtlUl-1j0ZzsemUMoCAIpk7dfjx1EzfN3d6xs"
};

/**
 * Função Principal: Acionada pelo Menu ou API
 */
function distribuirDadosCentral() {
  mostrarNotificacaoUI("🚀 Iniciando distribuição de dados Mestre -> Filas/Zonas...", 4);
  
  const ssMestre = SpreadsheetApp.openById(ID_MASTER_DB_DIST);
  const abaMestre = ssMestre.getSheetByName(NOME_ABA_MESTRE_DIST);
  
  if (!abaMestre || abaMestre.getLastRow() < 2) {
    mostrarNotificacaoUI("⚠️ Erro: Banco de Dados Mestre vazio ou não encontrado.", 10);
    return;
  }

  mostrarNotificacaoUI("Carregando banco de dados para a memória...", 3);

  // 1. Ler todos os dados do Mestre
  const dados = abaMestre.getDataRange().getDisplayValues();
  const cabecalho = dados[0];
  const linhas = dados.slice(1); // Remove cabeçalho

  // Estruturas para armazenar a separação
  let exportacaoZonas = {
    "LESTE": { todos: [], egestor: [], esus: [], gravidas: [] },
    "OESTE": { todos: [], egestor: [], esus: [], gravidas: [] },
    "SUL":   { todos: [], egestor: [], esus: [], gravidas: [] },
    "NORTE": { todos: [], egestor: [], esus: [], gravidas: [] }
  };

  let exportacaoFila = {
    egestor: [], 
    esus: []
  };

  mostrarNotificacaoUI(`Categorizando e criando rotas para ${linhas.length} pacientes...`, 4);

  // 2. Processar linha a linha e categorizar
  for (let l of linhas) {
    const prioridade = parseInt(l[IDX.PRIORIDADE]);
    const zona = String(l[IDX.ORIGEM]).toUpperCase().trim();
    const gestanteInfo = String(l[IDX.GESTANTE]).toUpperCase();

    // FILTRO GERAL: Ignora Concluídos (Prioridade 0)
    if (prioridade === 0) continue;

    // A. Preparar dados para ZONAS
    if (exportacaoZonas[zona]) {
      exportacaoZonas[zona].todos.push(l);
      
      if (prioridade === 1) {
        exportacaoZonas[zona].egestor.push(l);
      } 
      else if ([2, 3, 4].includes(prioridade)) {
        exportacaoZonas[zona].esus.push(l);
      }
      
      if (gestanteInfo.length > 2 && !gestanteInfo.includes("NÃO")) {
        exportacaoZonas[zona].gravidas.push(l);
      }
    }

    // B. Preparar dados para FILA
    let dataAcompFormatada = formatarDataParaFila(l[IDX.DATA_ACOMP]);

    // Fila E-gestor (Prioridade 1)
    if (prioridade === 1) {
      exportacaoFila.egestor.push([
        l[IDX.NIS],          
        dataAcompFormatada,
        l[IDX.PESO],         
        l[IDX.ALTURA],       
        l[IDX.STATUS_CALCULADO],       
        l[IDX.DATA_IMPORTACAO],   
        l[IDX.ORIGEM],
        "", // Coluna H: Status Robô (Vazio para processar)
        ""  // Coluna I: Data Robô (Vazio)
      ]);
    }

    // Fila E-sus (Prioridade 2, 3 e 4)
    if ([2, 3, 4].includes(prioridade)) {
      
      // Validação: Só envia se tiver CNS OU CPF válido
      let cns = String(l[IDX.CNS] || "").trim();
      let cpf = (l.length > IDX.CPF) ? String(l[IDX.CPF] || "").trim() : "";
      
      if (cns.length > 5 || cpf.length > 10) {
        exportacaoFila.esus.push([
          l[IDX.NIS],          
          l[IDX.CNS],
          l[IDX.NOME],         
          l[IDX.IDADE],        
          l[IDX.DATA_NASC],    
          dataAcompFormatada,
          l[IDX.VACINACAO],    
          l[IDX.PESO],         
          l[IDX.ALTURA],       
          l[IDX.STATUS_CALCULADO],       
          l[IDX.PRIORIDADE],   
          l[IDX.ORIGEM],
          cpf,
          "" // Coluna N: Status Robô (Vazio para processar)
        ]);
      }
    }
  }

  // ORDENAÇÃO DA FILA E-SUS POR PRIORIDADE (2 -> 3 -> 4)
  exportacaoFila.esus.sort((a, b) => {
    const pA = parseInt(a[10]) || 99;
    const pB = parseInt(b[10]) || 99;
    return pA - pB;
  });

  // 3. Executar o Envio
  
  // Enviar para Zonas
  for (let nomeZona in exportacaoZonas) {
    if (PLANILHAS_ZONAS[nomeZona]) {
      mostrarNotificacaoUI(`Enviando dados para a Zona: ${nomeZona}...`, 4);
      enviarParaPlanilhaZona(PLANILHAS_ZONAS[nomeZona], nomeZona, exportacaoZonas[nomeZona], cabecalho);
    }
  }

  // Enviar para Fila Central
  mostrarNotificacaoUI(`Enviando dados para a Fila Central dos Robôs...`, 4);
  enviarParaFilaCentral(exportacaoFila);

  mostrarNotificacaoUI("✅ Distribuição Concluída com Sucesso!", 10);
}

/**
 * Escreve nas planilhas regionais
 */
function enviarParaPlanilhaZona(idPlanilha, nomeZona, dadosObj, cabecalhoMestre) {
  try {
    const ss = SpreadsheetApp.openById(idPlanilha);
    
    const operacoes = [
      { nome: "Todos", dados: dadosObj.todos, cor: "#cfe2f3" },
      { nome: "E-gestor", dados: dadosObj.egestor, cor: "#d9ead3" },
      { nome: "E-sus", dados: dadosObj.esus, cor: "#fff2cc" },
      { nome: "Grávidas", dados: dadosObj.gravidas, cor: "#f4cccc" }
    ];

    for (let op of operacoes) {
      atualizarAbaComLimpeza(ss, op.nome, op.dados, cabecalhoMestre, op.cor);
    }
  } catch (e) {
    mostrarNotificacaoUI(`⚠️ Erro ao atualizar Zona ${nomeZona}: ${e.message}`, 8);
  }
}

/**
 * Escreve na planilha de Fila
 */
function enviarParaFilaCentral(dadosFila) {
  try {
    const ss = SpreadsheetApp.openById(ID_FILA_ROBOS);

    // 1. Aba E-gestor
    const headerGestor = ["NIS", "Acompanhamento", "Peso", "Altura", "Status Origem", "Data Import", "Zona", "STATUS ROBÔ", "DATA ROBÔ"];
    atualizarAbaComLimpeza(ss, "E-gestor", dadosFila.egestor, headerGestor, "#d9ead3");

    // 2. Aba E-sus
    const headerEsus = ["NIS", "CNS", "NOME", "IDADE", "DAT. NASC", "ACOMP.", "VACINA", "PESO", "ALTURA", "STATUS ORIGEM", "PRIORIDADE", "ZONA", "CPF", "STATUS ROBÔ"];
    atualizarAbaComLimpeza(ss, "E-sus", dadosFila.esus, headerEsus, "#fff2cc");

  } catch (e) {
    mostrarNotificacaoUI(`⚠️ Erro ao atualizar Fila: ${e.message}`, 8);
  }
}

/**
 * FUNÇÃO AUXILIAR: Apaga os dados velhos, ajusta linhas/colunas e escreve dados novos (Economia de memória)
 */
function atualizarAbaComLimpeza(ss, nomeAba, dados, headers, corHeader) {
  let aba = ss.getSheetByName(nomeAba);
  if (!aba) {
    aba = ss.insertSheet(nomeAba);
  }
  
  // Limpa tudo antes de escrever (A mágica que apaga a vigência anterior)
  aba.setFrozenRows(0);
  aba.clear();

  let matrizFinal = [headers];
  if (dados && dados.length > 0) {
    matrizFinal = matrizFinal.concat(dados);
  }
  
  const numLinhas = matrizFinal.length;
  const numColunas = matrizFinal[0].length;
  
  // Ajuste de Tamanho da Planilha (Deleta excessos para evitar o limite do Google)
  const maxLin = aba.getMaxRows();
  const maxCol = aba.getMaxColumns();

  if (maxCol > numColunas) aba.deleteColumns(numColunas + 1, maxCol - numColunas);
  else if (maxCol < numColunas) aba.insertColumnsAfter(maxCol, numColunas - maxCol);

  if (maxLin > numLinhas) aba.deleteRows(numLinhas + 1, maxLin - numLinhas);
  else if (maxLin < numLinhas) aba.insertRowsAfter(maxLin, numLinhas - maxLin);

  // Formata como texto para preservar zeros à esquerda (NIS/CNS)
  aba.getRange(1, 1, numLinhas, numColunas).setNumberFormat("@");
  aba.getRange(1, 1, numLinhas, numColunas).setValues(matrizFinal);
  
  aba.getRange(1, 1, 1, numColunas).setFontWeight("bold");
  if (corHeader) {
    aba.getRange(1, 1, 1, numColunas).setBackground(corHeader);
  }
  
  if (numLinhas > 1) aba.setFrozenRows(1);
}

/**
 * Garante que a data esteja no formato dd/mm/aaaa
 */
function formatarDataParaFila(dataStr) {
  if (!dataStr) return "";
  let partes = String(dataStr).trim().split('/');
  if (partes.length !== 3) return dataStr;
  
  let dia = partes[0].padStart(2, '0');
  let mes = partes[1].padStart(2, '0');
  let ano = partes[2];
  
  if (ano.length === 2) ano = "20" + ano;
  
  return `${dia}/${mes}/${ano}`;
}

/**
 * Interface de Notificação (Se esta função já existir no seu projeto com outro nome, ela não vai dar conflito pois mudei o nome para mostrarNotificacaoUI)
 */
function mostrarNotificacaoUI(mensagem, tempoSegundos = 5) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (ss) ss.toast(mensagem, "⚙️ Centro de Distribuição", tempoSegundos);
  } catch(e) {
    Logger.log(mensagem); // Fallback para o log padrão caso rode via timer automático invisível
  }
}
