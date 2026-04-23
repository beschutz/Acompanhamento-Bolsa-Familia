/**
 * 🤖 API CENTRALIZADA V9.0 (Integração Robôs e Painel Web - Vigência 1/2026)
 * Responsável por:
 * 1. Receber chamadas do Painel Web (Sincronizar, Distribuir, Devolver)
 * 2. Fornecer dados para os Robôs Tampermonkey (E-gestor e E-SUS)
 * 3. Receber resultados dos Robôs
 */

const TOKEN_SECRET = "18032003";
const ID_FILA_ROBOS_API = "1_OMVpaC7T8cVPQJ7eLhPmwdcNvI6CKeueLdU52ccVOQ";
const ID_MASTER_DB_API = "154XdEwS8H7f9ll9Dho0F2Wm6fM7G0uM5uQxyarqztyM";

const SHEET_EGESTOR = "E-gestor";
const SHEET_ESUS = "E-sus";
const SHEET_MESTRE = "DADOS UNIFICADOS";
const COND_AUDIT_RETURN_LIMIT = 20;
const COND_AUDIT_STORE_LIMIT = 100;

function doGet(e) { return handleRequest(e); }
function doPost(e) { return handleRequest(e); }

function handleRequest(e) {
  const params = e.parameter || {};
  
  if (params.token !== TOKEN_SECRET) return jsonOut({ ok: false, err: "Acesso negado" });
  
  const target = (params.api_target || "").toLowerCase();
  
  if (target === 'panel') return apiPanel(params);
  if (target === 'egestor') return apiEgestor(params);
  if (target === 'esus') return apiEsus(params);
  
  return jsonOut({ ok: false, err: "Alvo da API inválido" });
}

// =================================================================================
// 1. ENDPOINTS DO PAINEL WEB
// =================================================================================

function apiPanel(params) {
  const action = params.action;
  const props = PropertiesService.getScriptProperties();
  
  try {
    if (action === "run_import") {
      return jsonOut({ ok: true, msg: (typeof executarCicloImportacao !== 'undefined') ? executarCicloImportacao() : "Erro: Módulo de Importação offline." });
    }
    
    if (action === "run_update_db") {
      const res = (typeof atualizarMestreComRetornoFila !== 'undefined') ? atualizarMestreComRetornoFila() : "Erro: Módulo de Sincronização offline.";
      atualizarCacheStats(); // Força atualização ao sincronizar
      return jsonOut({ ok: true, msg: res });
    }
    
    if (action === "run_distribute") { 
      if (typeof distribuirDadosCentral !== 'undefined') distribuirDadosCentral(); 
      return jsonOut({ ok: true, msg: "Distribuição concluída com sucesso." }); 
    }
    
    if (action === "run_return") {
      return jsonOut({ ok: true, msg: (typeof executarDevolucaoCiclo !== 'undefined') ? executarDevolucaoCiclo() : "Erro: Módulo de Devolução offline." });
    }
    
    // DASHBOARD: Se forçado ou se estiver zerado, recalcula as métricas
    if (action === "obter_dashboard") {
      if (params.force === "true" || !props.getProperty('CACHE_TOTAL_DB')) atualizarCacheStats();
      return jsonOut({ ok: true, dados: getDashboardStats() });
    }
    
    if (action === "save_config") {
      const config = { 
        vigencia: params.vigencia_nome, 
        NORTE: extractId(params.folder_norte), 
        SUL: extractId(params.folder_sul), 
        LESTE: extractId(params.folder_leste), 
        OESTE: extractId(params.folder_oeste) 
      };
      props.setProperty('VIGENCIA_CONFIG', JSON.stringify(config));
      return jsonOut({ ok: true, msg: "Configuração guardada com sucesso!" });
    }
    
    if (action === "get_config") {
      return jsonOut({ ok: true, data: JSON.parse(props.getProperty('VIGENCIA_CONFIG') || "null") });
    }

    if (action === "health_check") {
      return jsonOut({ ok: true, data: runHealthCheck() });
    }

    if (action === "get_rules") {
      return jsonOut(handleGetRules_(params));
    }

    if (action === "save_rules") {
      return jsonOut(handleSaveRules_(params));
    }

    if (action === "simulate_rules") {
      return jsonOut(handleSimulateRules_(params));
    }
    
    return jsonOut({ ok: false, err: "Ação desconhecida pelo Painel." });

    
  } catch (e) { 
    return jsonOut({ ok: false, err: e.message }); 
  }
}

function extractId(url) { 
  if (!url) return ""; 
  const m = url.match(/[-\w]{25,}/); 
  return m ? m[0] : url.trim(); 
}

// =================================================================================
// 2. ESTATÍSTICAS E CACHE
// =================================================================================

function getDashboardStats() {
  const props = PropertiesService.getScriptProperties();
  const ssFila = SpreadsheetApp.openById(ID_FILA_ROBOS_API);
  const shEg = ssFila.getSheetByName(SHEET_EGESTOR);
  const shEs = ssFila.getSheetByName(SHEET_ESUS);
  
  return {
    fila_egestor: shEg ? Math.max(0, shEg.getLastRow() - 1) : 0,
    fila_esus: shEs ? Math.max(0, shEs.getLastRow() - 1) : 0,
    total_buscado: parseInt(props.getProperty('STATS_TOTAL_BUSCADO') || "0"),
    cadastros_realizados: parseInt(props.getProperty('STATS_CADASTROS_REALIZADOS') || props.getProperty('STATS_CADASTROS') || "0"),
    egestor_atualizados: parseInt(props.getProperty('STATS_EGESTOR_ATUALIZADOS') || "0"), // NOVO MEDIDOR
    atualizacoes: parseInt(props.getProperty('STATS_ATUALIZACOES') || "0"),
    total_db: parseInt(props.getProperty('CACHE_TOTAL_DB') || "1"),
    concluidos_db: parseInt(props.getProperty('CACHE_CONCLUIDOS_DB') || "0"),
    historico: JSON.parse(props.getProperty('STATS_HISTORICO') || "{}"),
    config: JSON.parse(props.getProperty('VIGENCIA_CONFIG') || "{}")
  };
}

function atualizarCacheStats() {
  const props = PropertiesService.getScriptProperties();
  const ssMestre = SpreadsheetApp.openById(ID_MASTER_DB_API);
  const abaMestre = ssMestre.getSheetByName(SHEET_MESTRE);
  const totalRows = abaMestre.getLastRow();
  
  if (totalRows < 2) {
    props.setProperties({'CACHE_TOTAL_DB': "1", 'CACHE_CONCLUIDOS_DB': "0"});
    return;
  }
  
  const data = abaMestre.getRange(2, 1, totalRows - 1, 19).getValues();
  
  const registrosReais = data.filter(r => String(r[1]).trim().length > 5 || String(r[17]).trim().length > 10);
  const total = registrosReais.length;
  
  const concluidos = registrosReais.filter(r => {
    const p = parseInt(r[0]);
    const s = String(r[14]).toUpperCase();
    return (p === 0) || s.includes("CONCLUÍDO");
  }).length;
  
  props.setProperty('CACHE_TOTAL_DB', String(total || 1));
  props.setProperty('CACHE_CONCLUIDOS_DB', String(concluidos));
}

// =================================================================================
// 3. ENDPOINTS DOS ROBÔS (TAMPERMONKEY)
// =================================================================================

function apiEgestor(params) {
  const lock = LockService.getScriptLock();
  try { lock.waitLock(10000); } catch(e) { return jsonOut({ ok: false, err: "Servidor ocupado" }); }
  
  try {
    const sh = SpreadsheetApp.openById(ID_FILA_ROBOS_API).getSheetByName(SHEET_EGESTOR);
    
    if (params.action === "next") {
      const region = (params.region || "TODAS").toUpperCase();
      const data = sh.getDataRange().getValues();
      const hoje = formatDate(new Date());
      
      for (let i = 1; i < data.length; i++) {
        const st = String(data[i][7]).toLowerCase(); 
        
        if (st.includes("gestor") || st.includes("sus ab")) { 
          if (!data[i][8]) sh.getRange(i+1, 9).setValue(hoje); 
          continue; 
        }
        
        if (!data[i][7]) {
          if (region !== "TODAS" && String(data[i][6]).toUpperCase() !== region) continue;
          
          sh.getRange(i+1, 8).setValue("Processando...");
          updateStatCounter('total_buscado');
          
          return jsonOut({ 
            ok: true, 
            record: { 
              row: i+1, 
              nis: data[i][0], 
              data_acomp: formatDate(data[i][1]), 
              peso: data[i][2], 
              altura: data[i][3] 
            } 
          });
        }
      }
      return jsonOut({ ok: true, record: null }); 
    }
    
    if (params.action === "done") {
      sh.getRange(params.id, 8).setValue(params.status); 
      sh.getRange(params.id, 9).setValue(formatDate(new Date())); 
      
      // LÓGICA ATUALIZADA PARA PONTAÇÃO DIVIDIDA
      let statusUpper = String(params.status).toUpperCase();
      
      if (statusUpper.includes("GESTOR")) { 
        updateStatCounter('cadastros_realizados'); 
        updateHistory('egestor'); 
      } else if (statusUpper.includes("SUS AB")) {
        // Agora o E-SUS AB também pontua no histórico como "egestor_atualizados"
        updateStatCounter('egestor_atualizados'); 
        updateHistory('egestor_atualizados'); 
      }
      
      return jsonOut({ ok: true });
    }
    
  } finally { 
    lock.releaseLock(); 
  }
}

function apiEsus(params) {
  const lock = LockService.getScriptLock();
  try { lock.waitLock(10000); } catch(e) { return jsonOut({ ok: false, err: "Servidor ocupado" }); }
  
  try {
    const sh = SpreadsheetApp.openById(ID_FILA_ROBOS_API).getSheetByName(SHEET_ESUS);
    
    if (params.action === "next") {
      const region = (params.region || "TODAS").toUpperCase();
      const data = sh.getDataRange().getValues();
      const priors = [2, 3, 4];
      let found = -1;
      
      for (let p of priors) {
        for (let i = 1; i < data.length; i++) {
          if (!data[i][13] && (region === "TODAS" || String(data[i][11]).toUpperCase() === region) && parseInt(data[i][10]) === p) { 
            found = i; 
            break; 
          }
        }
        if (found !== -1) break;
      }
      
      if (found !== -1) {
        sh.getRange(found+1, 14).setValue("Processando...");
        updateStatCounter('total_buscado');
        
        return jsonOut({ 
          ok: true, 
          record: { 
            row: found+1, 
            nis: data[found][0], 
            cns: data[found][1], 
            nome: data[found][2], 
            nasc: formatDate(data[found][4]), 
            cpf: data[found][12] 
          } 
        });
      }
      return jsonOut({ ok: true, record: null });
    }
    
    if (params.action === "save") {
      const r = params.row;
      const rowRange = sh.getRange(r, 4, 1, 11); // col 4..14
      const rowData = rowRange.getValues()[0];

      if (params.dataMedicao && params.dataMedicao !== "-") rowData[2] = params.dataMedicao; // col 6
      if (params.peso && params.peso !== "-") rowData[4] = params.peso; // col 8
      if (params.altura && params.altura !== "-") rowData[5] = params.altura; // col 9
      if (params.vacinacao && params.vacinacao !== "-") rowData[3] = params.vacinacao; // col 7
      
      let statusFinal = params.status;
      
      if (statusFinal === "DADOS PARCIAIS" && params.peso === "-" && params.altura === "-") {
        statusFinal = "ENCONTRADO (SEM MEDIÇÕES)";
      }
      
      if (statusFinal === "ENCONTRADO COMPLETO") {
        const idade = parseInt(rowData[0]); // col 4
        const condAtivas = getCondicionalidadesAtivas_(getVigenciaAtiva_());
        const calcReqs = calcularRequisitosFinais_({ idade: idade, sexo: "QUALQUER" }, condAtivas.config);
        const reqs = calcReqs.requisitos;
        if (!isNaN(idade) && reqs.vaccinationRequired) {
          const vacinaAtual = (params.vacinacao && params.vacinacao !== "-") ? params.vacinacao : rowData[3];
          const vacinaStr = String(vacinaAtual).toUpperCase().trim();
          if (vacinaStr !== "SIM") {
            statusFinal = "DADOS PARCIAIS (FALTA VACINA)"; 
          }
        }
      }
      
      rowData[10] = statusFinal; // col 14
      rowRange.setValues([rowData]);
      
      updateStatCounter('atualizacoes'); 
      updateHistory('esus');
      
      return jsonOut({ ok: true });
    }
    
  } finally { 
    lock.releaseLock(); 
  }
}

function runHealthCheck() {
  const checks = [];
  const props = PropertiesService.getScriptProperties();

  const push = (id, label, status, message, details) => {
    checks.push({
      id, label,
      status, // "OK" | "ALERTA" | "ERRO"
      message: message || "",
      details: details || null,
      ts: new Date().toISOString()
    });
  };

  // 1) Master DB
  try {
    const ssMaster = SpreadsheetApp.openById(ID_MASTER_DB_API);
    const shMaster = ssMaster.getSheetByName(SHEET_MESTRE);
    if (!shMaster) push("master_sheet", "Master DB (aba DADOS UNIFICADOS)", "ERRO", `Aba "${SHEET_MESTRE}" não encontrada no Master DB.`);
    else push("master_sheet", "Master DB (aba DADOS UNIFICADOS)", "OK", "Acesso OK.");
  } catch (e) {
    push("master_access", "Master DB (acesso)", "ERRO", "Não consegui abrir o Master DB. Verifique permissão/ID.", String(e));
  }

  // 2) Fila Robôs
  try {
    const ssFila = SpreadsheetApp.openById(ID_FILA_ROBOS_API);
    const shEg = ssFila.getSheetByName(SHEET_EGESTOR);
    const shEs = ssFila.getSheetByName(SHEET_ESUS);

    if (!shEg) push("fila_egestor", "Fila Robôs (aba E-gestor)", "ERRO", `Aba "${SHEET_EGESTOR}" não encontrada na planilha de Fila.`);
    else push("fila_egestor", "Fila Robôs (aba E-gestor)", "OK", "Acesso OK.");

    if (!shEs) push("fila_esus", "Fila Robôs (aba E-sus)", "ERRO", `Aba "${SHEET_ESUS}" não encontrada na planilha de Fila.`);
    else push("fila_esus", "Fila Robôs (aba E-sus)", "OK", "Acesso OK.");
  } catch (e) {
    push("fila_access", "Fila Robôs (acesso)", "ERRO", "Não consegui abrir a planilha de Fila. Verifique permissão/ID.", String(e));
  }

  // 3) Config Vigência
  let cfg = null;
  try {
    cfg = JSON.parse(props.getProperty("VIGENCIA_CONFIG") || "null");
    if (!cfg) push("cfg_exists", "Configuração de Vigência", "ALERTA", "Nenhuma vigência configurada ainda (VIGENCIA_CONFIG vazio).");
    else push("cfg_exists", "Configuração de Vigência", "OK", `Vigência ativa: ${cfg.vigencia || "(sem nome)"}`);
  } catch (e) {
    push("cfg_parse", "Configuração de Vigência (leitura)", "ERRO", "VIGENCIA_CONFIG está inválido (JSON).", String(e));
  }

  // 4) Pastas por zona (seguindo a lógica real do seu getPastasConfigAtuais)
  if (cfg) {
    const zonas = [
      { k: "NORTE", tipo: "SUBPASTAS" },
      { k: "OESTE", tipo: "DIRETA" },
      { k: "SUL", tipo: "SUBPASTAS_SUL" },
      { k: "LESTE", tipo: "SUBPASTAS_FILTRADAS", filtroExclusao: "indigenas" },
    ];

    for (const z of zonas) {
      const folderId = (cfg[z.k] || "").trim();
      const labelFolder = `Pasta ${z.k}`;

      if (!folderId) {
        push(`folder_${z.k}`, labelFolder, "ALERTA", "Não configurada.");
        continue;
      }

      // Acesso à pasta
      let folder = null;
      try {
        folder = DriveApp.getFolderById(folderId);
        push(`folder_${z.k}`, labelFolder, "OK", `OK: ${folder.getName()}`);
      } catch (e) {
        push(`folder_${z.k}`, labelFolder, "ERRO", "Não consegui acessar a pasta (ID inválido ou sem permissão).", String(e));
        continue;
      }

      // Amostra de planilha (respeitando o tipo)
      const sample = findSampleSpreadsheetByTipo_(folder, z.tipo, z.filtroExclusao);
      if (!sample) {
        push(`sample_${z.k}`, `Amostra ${z.k} (planilha)`, "ALERTA", `Não encontrei nenhuma planilha seguindo a regra do tipo "${z.tipo}".`);
        continue;
      }

      push(`sample_${z.k}`, `Amostra ${z.k} (planilha)`, "OK", `Amostra: ${sample.name}`);

      // Abas padrão
      const resTabs = checkStandardTabsOnSpreadsheet_(sample.id);
      if (resTabs.ok) {
        push(`tabs_${z.k}`, `Amostra ${z.k} (abas padrão)`, "OK", `Encontrou: ${resTabs.found.join(", ")}`);
      } else {
        push(`tabs_${z.k}`, `Amostra ${z.k} (abas padrão)`, "ALERTA", "Planilha encontrada, mas não achei abas padrão (pode ser arquivo diferente do modelo).", resTabs.details);
      }
    }
  }

  return {
    ok: checks.every(c => c.status !== "ERRO"),
    checks
  };
}

const HEALTHCHECK_SAMPLE_BLACKLIST = ["MODELO", "TEMPLATE", "EXEMPLO", "COPIA DE MODELO", "MODELO MAPA"];

// Pega 1 Google Sheets dentro da pasta (sem entrar em subpastas)
function findSampleSpreadsheetByTipo_(folder, tipo, filtroExclusao) {
  const seen = new Set();

  const pickFirstSheetFile_ = (f) => {
    try {
      const it = f.getFilesByType(MimeType.GOOGLE_SHEETS);
      while (it.hasNext()) {
        const file = it.next();
        const id = file.getId();
        if (seen.has(id)) continue;
        seen.add(id);

        const nameUpper = String(file.getName() || "").toUpperCase();
        // Pula modelos/arquivos lixo comuns (alinhado ao importador)
        if (HEALTHCHECK_SAMPLE_BLACKLIST.some(termo => nameUpper.includes(termo))) continue;

        return { id, name: file.getName() };
      }
    } catch (e) {}
    return null;
  };

  const pickFromSubfolders_ = (rootFolder, filterFn) => {
    try {
      const subs = rootFolder.getFolders();
      while (subs.hasNext()) {
        const sf = subs.next();
        if (filterFn && !filterFn(sf)) continue;

        const got = pickFirstSheetFile_(sf);
        if (got) return got;
      }
    } catch (e) {}
    return null;
  };

  if (tipo === "DIRETA") {
    return pickFirstSheetFile_(folder);
  }

  if (tipo === "SUBPASTAS_SUL") {
    return pickFromSubfolders_(folder);
  }

  if (tipo === "SUBPASTAS") {
    return pickFirstSheetFile_(folder) || pickFromSubfolders_(folder);
  }

  if (tipo === "SUBPASTAS_FILTRADAS") {
    const filtro = String(filtroExclusao || "").toLowerCase().trim();
    const filterFn = (sf) => {
      if (!filtro) return true;
      return !String(sf.getName() || "").toLowerCase().includes(filtro);
    };
    return pickFirstSheetFile_(folder) || pickFromSubfolders_(folder, filterFn);
  }

  // fallback
  return pickFirstSheetFile_(folder);
}

function checkStandardTabsOnSpreadsheet_(spreadsheetId) {
  const NOMES_ABAS_POSSIVEIS = [
    "MAPA INDIVIDUALIZADO VIGÊNCIA 1/2026",
    "MAPA INDIVIDUALIZADO VIGÊNCIA 2026/1",
    "MAPA POR FAMILIA 1/2026",
    "MAPA POR FAMILIA 2026/1",
    "MAPA OFICIAL 2026/1"
  ];

  try {
    const ss = SpreadsheetApp.openById(spreadsheetId);
    const found = [];
    for (const n of NOMES_ABAS_POSSIVEIS) {
      if (ss.getSheetByName(n)) found.push(n);
    }
    return found.length
      ? { ok: true, found }
      : { ok: false, found: [], details: `Nenhuma das abas: ${NOMES_ABAS_POSSIVEIS.join(" | ")}` };
  } catch (e) {
    return { ok: false, found: [], details: String(e) };
  }
}

function handleGetRules_(params) {
  const props = PropertiesService.getScriptProperties();
  const vigencia = String(params.vigencia || getVigenciaAtiva_() || "DEFAULT").trim();
  const allRules = parseJsonSafe_(props.getProperty('COND_RULES_BY_VIGENCIA'), {});
  const audit = parseJsonSafe_(props.getProperty('COND_RULES_AUDIT_LOG'), []);
  const saved = allRules[vigencia];
  const payload = saved ? mergeCondicionalidadesComPadrao_(saved) : getCondicionalidadesPadrao_();
  const auditVigencia = Array.isArray(audit) ? audit.filter(a => a && a.vigencia === vigencia).slice(-COND_AUDIT_RETURN_LIMIT).reverse() : [];

  return {
    ok: true,
    data: {
      vigencia: vigencia,
      source: saved ? "saved" : "fallback",
      config: payload,
      audit: auditVigencia
    }
  };
}

function handleSaveRules_(params) {
  const props = PropertiesService.getScriptProperties();
  const vigencia = String(params.vigencia || getVigenciaAtiva_() || "DEFAULT").trim();
  const rawJson = String(params.rules_json || "").trim();
  if (!rawJson) return { ok: false, err: "Payload rules_json é obrigatório." };

  const parsed = parseJsonSafe_(rawJson, null);
  if (!parsed) return { ok: false, err: "rules_json inválido (JSON)." };

  const val = validateCondRulesPayload_(parsed);
  if (!val.ok) return { ok: false, err: val.err };
  const sanitized = val.data;

  const allRules = parseJsonSafe_(props.getProperty('COND_RULES_BY_VIGENCIA'), {});
  const before = allRules[vigencia] ? mergeCondicionalidadesComPadrao_(allRules[vigencia]) : null;

  allRules[vigencia] = sanitized;
  props.setProperty('COND_RULES_BY_VIGENCIA', JSON.stringify(allRules));
  if (typeof resetCondicionalidadesCache_ === "function") resetCondicionalidadesCache_();

  const audit = parseJsonSafe_(props.getProperty('COND_RULES_AUDIT_LOG'), []);
  let actorFromSession = "";
  try {
    actorFromSession = Session.getActiveUser().getEmail() || "";
  } catch (e) {}
  const actor = String(params.author || actorFromSession || "desconhecido");
  audit.push({
    at: new Date().toISOString(),
    vigencia: vigencia,
    author: actor,
    before: before,
    after: sanitized
  });
  while (audit.length > COND_AUDIT_STORE_LIMIT) audit.shift();
  props.setProperty('COND_RULES_AUDIT_LOG', JSON.stringify(audit));

  return { ok: true, msg: "Condicionalidades salvas com sucesso." };
}

function handleSimulateRules_(params) {
  const vigencia = String(params.vigencia || getVigenciaAtiva_() || "DEFAULT").trim();
  let cfg = null;
  const rawJson = String(params.rules_json || "").trim();

  if (rawJson) {
    const parsed = parseJsonSafe_(rawJson, null);
    if (!parsed) return { ok: false, err: "rules_json inválido (JSON)." };
    const val = validateCondRulesPayload_(parsed);
    if (!val.ok) return { ok: false, err: val.err };
    cfg = val.data;
  } else {
    cfg = getCondicionalidadesAtivas_(vigencia).config;
  }

  const input = {
    idade: parseNullableInt_(params.idade),
    sexo: String(params.sexo || "QUALQUER").toUpperCase().trim(),
    pesoPresente: parseBoolParam_(params.pesoPresente),
    alturaPresente: parseBoolParam_(params.alturaPresente),
    dataAcompPresente: parseBoolParam_(params.dataAcompPresente),
    vacinacaoPresente: parseBoolParam_(params.vacinacaoPresente),
    acompUS: parseBoolParam_(params.acompUS) ? "SIM" : "",
    acompEgestor: parseBoolParam_(params.acompEgestor) ? "SIM" : "",
    gestante: parseBoolParam_(params.gestante) ? "SIM" : ""
  };

  const sim = simularCondicionalidadesInterno_(input, cfg);
  return {
    ok: true,
    data: {
      vigencia: vigencia,
      requisitos: sim.requisitos || {},
      status: sim.status,
      prioridade: sim.prioridade,
      faltantes: sim.faltantes || [],
      regrasAplicadas: sim.appliedRules || []
    }
  };
}

function validateCondRulesPayload_(payload) {
  if (!payload || typeof payload !== "object") return { ok: false, err: "Payload inválido." };
  if (!payload.defaults || typeof payload.defaults !== "object") return { ok: false, err: "Campo defaults é obrigatório." };
  if (!Array.isArray(payload.rules)) return { ok: false, err: "Campo rules deve ser lista." };

  const d = payload.defaults;
  const boolFields = ["requirePeso", "requireAltura", "requireDataAcomp", "vaccinationRequired"];
  for (const k of boolFields) {
    if (typeof d[k] !== "boolean") return { ok: false, err: `defaults.${k} deve ser booleano.` };
  }

  const vaxAge = parseNullableInt_(d.vaccinationAgeMax);
  if (vaxAge === null || vaxAge < 0 || vaxAge > 130) return { ok: false, err: "defaults.vaccinationAgeMax deve estar entre 0 e 130." };

  const out = {
    version: parseInt(payload.version, 10) || 1,
    defaults: {
      requirePeso: d.requirePeso,
      requireAltura: d.requireAltura,
      requireDataAcomp: d.requireDataAcomp,
      vaccinationRequired: d.vaccinationRequired,
      vaccinationAgeMax: vaxAge
    },
    rules: []
  };

  for (const [i, rawRule] of payload.rules.entries()) {
    const rule = rawRule || {};
    const when = rule.when || {};
    const set = rule.set || {};

    const ageMin = parseNullableInt_(when.ageMin);
    const ageMax = parseNullableInt_(when.ageMax);
    if (ageMin !== null && (ageMin < 0 || ageMin > 130)) return { ok: false, err: `rules[${i}].when.ageMin fora do range (0-130).` };
    if (ageMax !== null && (ageMax < 0 || ageMax > 130)) return { ok: false, err: `rules[${i}].when.ageMax fora do range (0-130).` };
    if (ageMin !== null && ageMax !== null && ageMin > ageMax) return { ok: false, err: `rules[${i}] idade mínima maior que máxima.` };

    const sexo = String(when.sexo || "QUALQUER").toUpperCase().trim();
    if (["M", "F", "QUALQUER"].indexOf(sexo) === -1) return { ok: false, err: `rules[${i}].when.sexo inválido.` };

    const setOut = {};
    const setBoolFields = ["requirePeso", "requireAltura", "requireDataAcomp", "vaccinationRequired"];
    for (const key of setBoolFields) {
      if (set[key] === undefined || set[key] === null || set[key] === "") continue;
      if (typeof set[key] !== "boolean") return { ok: false, err: `rules[${i}].set.${key} deve ser booleano.` };
      setOut[key] = set[key];
    }
    if (set.vaccinationAgeMax !== undefined && set.vaccinationAgeMax !== null && set.vaccinationAgeMax !== "") {
      const sAge = parseNullableInt_(set.vaccinationAgeMax);
      if (sAge === null || sAge < 0 || sAge > 130) return { ok: false, err: `rules[${i}].set.vaccinationAgeMax fora do range (0-130).` };
      setOut.vaccinationAgeMax = sAge;
    }

    if (Object.keys(setOut).length === 0) return { ok: false, err: `rules[${i}] deve ter ao menos 1 sobrescrita em set.` };

    out.rules.push({
      id: String(rule.id || `rule_${i + 1}`),
      name: String(rule.name || `Regra ${i + 1}`),
      when: { ageMin: ageMin, ageMax: ageMax, sexo: sexo },
      set: setOut
    });
  }

  return { ok: true, data: out };
}

function parseBoolParam_(v) {
  return String(v).toLowerCase() === "true" || String(v) === "1";
}

function parseNullableInt_(v) {
  if (v === undefined || v === null || v === "") return null;
  const n = parseInt(v, 10);
  return isNaN(n) ? null : n;
}

function parseJsonSafe_(raw, fallback) {
  try {
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}

// =================================================================================
// 4. FUNÇÕES DE SUPORTE
// =================================================================================

function updateStatCounter(k) { 
  const p = PropertiesService.getScriptProperties(); 
  const key = 'STATS_' + k.toUpperCase(); 
  p.setProperty(key, String(parseInt(p.getProperty(key) || 0) + 1)); 
}

function updateHistory(t) { 
  const p = PropertiesService.getScriptProperties(); 
  const d = formatDate(new Date()); 
  let h = JSON.parse(p.getProperty('STATS_HISTORICO') || "{}"); 
  
  if (!h[d]) h[d] = { egestor: 0, egestor_atualizados: 0, esus: 0 }; 
  if (h[d][t] === undefined) h[d][t] = 0; // Proteção para dias antigos
  h[d][t]++; 
  
  const keys = Object.keys(h); 
  if (keys.length > 7) delete h[keys[0]]; 
  
  p.setProperty('STATS_HISTORICO', JSON.stringify(h)); 
}

function jsonOut(o) { 
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); 
}

function formatDate(d) { 
  return (d instanceof Date) ? Utilities.formatDate(d, Session.getScriptTimeZone(), "dd/MM/yyyy") : d; 
}
