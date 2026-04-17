/**
 * ↩️ SISTEMA DE DEVOLUÇÃO (V9.0 - VIGÊNCIA 1/2026)
 * Lógica: Escreve dados faltantes, atende a múltiplas abas, 
 * evita erros de validação e preenche os 'SIM' de acompanhamento.
 */

const ID_MASTER_DB_DEV = "154XdEwS8H7f9ll9Dho0F2Wm6fM7G0uM5uQxyarqztyM";
const NOME_ABA_MESTRE_DEV = "DADOS UNIFICADOS"; 

const IDX_DEV = {
  PRIORIDADE: 0, NIS: 1, CNS: 2, NOME: 3, IDADE: 4, DATA_NASC: 5,
  DATA_ACOMP: 6, VACINACAO: 7, PESO: 8, ALTURA: 9, GESTANTE: 10,
  PRE_NATAL: 11, DUM: 12, ORIGEM: 13, STATUS_CALCULADO: 14, COR_ORIGEM: 15, 
  DATA_IMPORTACAO: 16, CPF: 17, US_REFERENCIA: 18
};

// Mapa Fixo de Colunas na Planilha da US (Vigência 1/2026)
const COL_US = {
  ACOMP_US: 5,   // Coluna E (Acompanhado na US)
  DATA_ACOMP: 6, // Coluna F
  PESO: 7,       // Coluna G
  ALTURA: 8,     // Coluna H
  EGESTOR: 16    // Coluna P (Acompanhado no E-Gestor)
};

const NOMES_ABAS_POSSIVEIS = [
  "MAPA INDIVIDUALIZADO VIGÊNCIA 1/2026",
  "MAPA INDIVIDUALIZADO VIGÊNCIA 2026/1",
  "MAPA POR FAMILIA 1/2026",
  "MAPA POR FAMILIA 2026/1",
  "MAPA OFICIAL 2026/1"
];

function onOpenDev() {}

function executarDevolucaoCiclo() {
  mostrarNotificacaoUIDev("🔄 Iniciando ciclo de Devolução para as Unidades de Saúde...", 4);
  
  const ssMestre = SpreadsheetApp.openById(ID_MASTER_DB_DEV);
  const abaMestre = ssMestre.getSheetByName(NOME_ABA_MESTRE_DEV);
  
  const props = PropertiesService.getScriptProperties();
  const tempoInicio = Date.now();
  
  let estado = JSON.parse(props.getProperty('ESTADO_DEVOLUCAO')) || {
    fase: 'MAPEAMENTO', listaArquivos: [], indiceArquivo: 0
  };

  if (estado.fase === 'MAPEAMENTO') {
    mostrarNotificacaoUIDev("Agrupando pacientes por Unidade de Saúde...", 3);
    const dadosMestre = abaMestre.getDataRange().getValues();
    const linhas = dadosMestre.slice(1);
    let grupos = {};

    for (let l of linhas) {
      let us_origem = String(l[IDX_DEV.US_REFERENCIA]).trim();
      if (!us_origem) continue;

      if (l[IDX_DEV.DATA_ACOMP] || l[IDX_DEV.PESO] || l[IDX_DEV.ALTURA] || String(l[IDX_DEV.STATUS_CALCULADO]).toUpperCase().includes("CONCLUÍDO")) {
        if (!grupos[us_origem]) grupos[us_origem] = true;
      }
    }

    estado.listaArquivos = Object.keys(grupos).map(k => ({ nome: k }));
    
    if (estado.listaArquivos.length === 0) {
      mostrarNotificacaoUIDev("✅ Nenhum dado pendente de devolução no momento.", 5);
      return "Nada a devolver.";
    }

    estado.fase = 'PROCESSAMENTO';
    estado.indiceArquivo = 0;
    props.setProperty('ESTADO_DEVOLUCAO', JSON.stringify(estado));
  }

  if (estado.fase === 'PROCESSAMENTO') {
    const dadosMestreRef = abaMestre.getDataRange().getValues();

    while (estado.indiceArquivo < estado.listaArquivos.length) {
      if (Date.now() - tempoInicio > 270000) {
        props.setProperty('ESTADO_DEVOLUCAO', JSON.stringify(estado));
        mostrarNotificacaoUIDev("⏳ Tempo limite atingido. Continue no próximo ciclo.", 5);
        return `Pausa de segurança. Retomando fila... [${estado.indiceArquivo}/${estado.listaArquivos.length}]`;
      }

      const itemArquivo = estado.listaArquivos[estado.indiceArquivo];
      mostrarNotificacaoUIDev(`Devolvendo dados para: ${itemArquivo.nome} [${estado.indiceArquivo + 1}/${estado.listaArquivos.length}]`, 4);

      const idArquivo = buscarArquivoPorNome(itemArquivo.nome);
      
      if (idArquivo) {
        const dadosParaEsteArquivo = dadosMestreRef.filter(l => String(l[IDX_DEV.US_REFERENCIA]).trim() === itemArquivo.nome);
        
        if (dadosParaEsteArquivo.length > 0) {
          try {
            escreverNaPlanilhaDestino(idArquivo, dadosParaEsteArquivo);
          } catch(e) {
            Logger.log(`Erro ao escrever em ${itemArquivo.nome}: ${e.message}`);
          }
        }
      } else {
        Logger.log(`Arquivo não encontrado no Drive: ${itemArquivo.nome}`);
      }

      estado.indiceArquivo++;
      props.setProperty('ESTADO_DEVOLUCAO', JSON.stringify(estado));
    }
    
    estado.fase = 'CONCLUIDO';
    props.deleteProperty('ESTADO_DEVOLUCAO');
    mostrarNotificacaoUIDev("✅ Ciclo de Devolução Concluído com Sucesso!", 10);
    return "Devolução Concluída!";
  }
}

function buscarArquivoPorNome(nome) {
  try {
    const files = DriveApp.getFilesByName(nome);
    if (files.hasNext()) return files.next().getId();
    
    const fallbackFiles = DriveApp.searchFiles(`title contains '${nome}'`);
    if (fallbackFiles.hasNext()) return fallbackFiles.next().getId();
    
    return null;
  } catch(e) { return null; }
}

function escreverNaPlanilhaDestino(idPlanilha, dadosMestre) {
  const ss = SpreadsheetApp.openById(idPlanilha);
  
  let abasParaAtualizar = [];
  
  // Procura por qualquer uma das abas válidas de 2026
  for (let nomeAba of NOMES_ABAS_POSSIVEIS) {
    let aba = ss.getSheetByName(nomeAba);
    if (aba) abasParaAtualizar.push(aba);
  }

  if (abasParaAtualizar.length === 0) {
    Logger.log(`Nenhuma aba padrão encontrada no arquivo ${ss.getName()}`);
    return;
  }

  // Executa a devolução em todas as abas encontradas (caso a US use mais de uma)
  for (let aba of abasParaAtualizar) {
    const dadosDestino = aba.getDataRange().getDisplayValues();
    let mapaLocal = new Map();
    
    for (let i = 6; i < dadosDestino.length; i++) {
      let valNis = dadosDestino[i][0] || ""; 
      let valCpf = dadosDestino[i][1] || ""; 
      
      let nisLocal = String(valNis).replace(/\D/g, "");
      let cpfLocal = String(valCpf).replace(/\D/g, "");
      
      if (nisLocal.length > 5) mapaLocal.set(nisLocal, i + 1);
      if (cpfLocal.length > 10) mapaLocal.set(cpfLocal, i + 1);
    }

    for (let dado of dadosMestre) {
      let nisMestre = String(dado[IDX_DEV.NIS]).replace(/\D/g, "");
      let cpfMestre = String(dado[IDX_DEV.CPF]).replace(/\D/g, "");
      
      let chaveBusca = nisMestre.length > 5 ? nisMestre : (cpfMestre.length > 10 ? cpfMestre : null);

      if (chaveBusca && mapaLocal.has(chaveBusca)) {
        let linhaDestino = mapaLocal.get(chaveBusca);

        const setC = (colunaReal, val, forceWrite = false) => {
          if (!val) return;
          let valAtual = dadosDestino[linhaDestino - 1][colunaReal - 1];
          
          if (forceWrite || !valAtual || valAtual === "-" || valAtual === "" || valAtual === "0") {
            if (val instanceof Date) val = Utilities.formatDate(val, Session.getScriptTimeZone(), "dd/MM/yyyy");
            aba.getRange(linhaDestino, colunaReal).setValue(val);
          }
        };

        // 1. Devolver APENAS Data, Peso e Altura (Ignora Vacina para evitar erro de validação)
        setC(COL_US.DATA_ACOMP, dado[IDX_DEV.DATA_ACOMP]);
        setC(COL_US.PESO, dado[IDX_DEV.PESO]);
        setC(COL_US.ALTURA, dado[IDX_DEV.ALTURA]);

        let prioridadeDB = parseInt(dado[IDX_DEV.PRIORIDADE]);
        let statusDB = String(dado[IDX_DEV.STATUS_CALCULADO]).toUpperCase();

        // 2. Colocar SIM na coluna e-Gestor se finalizado
        if (prioridadeDB === 0 || statusDB.includes("CONCLUÍDO")) {
          setC(COL_US.EGESTOR, "SIM", true); // forceWrite = true, sempre garante o SIM
        }

        // 3. Colocar SIM na coluna Acompanhado na US se tiver dado (apenas se a célula estiver vazia)
        if (dado[IDX_DEV.DATA_ACOMP] || statusDB.includes("ACOMPANHAD")) {
          setC(COL_US.ACOMP_US, "SIM", false);
        }
      }
    }
  }
}

function mostrarNotificacaoUIDev(mensagem, tempoSegundos = 5) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (ss) ss.toast(mensagem, "⚙️ Sistema de Devolução", tempoSegundos);
  } catch(e) { Logger.log(mensagem); }
}
