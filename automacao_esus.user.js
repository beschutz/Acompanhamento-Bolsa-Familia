// ==UserScript==
// @name         E-SUS FULL V9.0 (Vigência 1/2026)
// @namespace    http://tampermonkey.net/
// @version      9.0.0
// @description  Automação e-SUS atualizada para a Vigência 1/2026 com filtro de datas corrigido.
// @author       Bernardo (Refinado por IA)
// @match        https://esus.procempa.com.br/*
// @connect      script.google.com
// @connect      script.googleusercontent.com
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @grant        GM_addStyle
// @run-at       document-end
// ==/UserScript==

(function () {
    'use strict';

    // =================================================================
    // TRAVA ANTI-IFRAME
    // =================================================================
    if (window.top !== window.self) return;

    console.log("🟢 Automação e-SUS V9.0 (Vigência 1/2026) Iniciada");

    // ================= CONFIG GERAL =================
    // IMPORTANTE: Se você fez uma "Nova Implantação" no Google Apps Script, atualize o link abaixo!
    const WEBAPP_URL = "https://script.google.com/macros/s/AKfycbxX3ByavjUXD18ttcApMdXouuCJJ6dOqlKmivKQy17Fgt2sBbU5QA2SVVkBP8HRRT_s/exec";
    const WEBAPP_TOKEN = "18032003";
    const LINK_UPDATE = "https://gist.github.com/beschutz/f977ca6a715b202645a1cea8357721bf/raw/b8551bf76969dee3788acb9a367eacb8ab5f59b9/automacao_esus.user.js";

    // ================= CONSTANTES =================
    // ATUALIZADO PARA VIGÊNCIA 1/2026 (Mês no JS começa em 0. Jan = 0, Jun = 5)
    const DATA_INICIO = new Date(2026, 0, 1); // 01 de Janeiro de 2026
    const DATA_FIM = new Date(2026, 5, 30);   // 30 de Junho de 2026

    const TIMEOUT_BUSCA = 7000;
    const WATCHDOG_LIMIT = 120000;
    const TEXTO_JUSTIFICATIVA = "monitoramento bolsa familia";
    const URL_HOME_EXATA = "/cidadao";

    // Variáveis de Estado
    let running = false;
    let emProcessamento = false;
    let isRequesting = false;
    let currentPaciente = null;
    let watchdogTimer = null;
    let activeRequest = null;

    // ================= ESTILOS (CÓPIA EXATA DO E-GESTOR ADAPTADA) =================
    GM_addStyle(`
        @import url('https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap');
        @import url('https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200');

        #esusPainelStatus {
            font-family: 'Roboto', sans-serif;
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 999999;
            width: 260px;
            color: #e2e8f0;
            user-select: none;
        }

        .glass-panel {
            background: rgba(15, 23, 42, 0.95);
            backdrop-filter: blur(12px);
            border: 1px solid rgba(255, 255, 255, 0.08);
            box-shadow: 0 10px 30px -5px rgba(0, 0, 0, 0.6);
            border-radius: 12px;
            overflow: hidden;
            transition: all 0.3s ease;
        }

        .esus-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 10px 14px;
            background: rgba(255,255,255,0.03);
            cursor: pointer;
            border-bottom: 1px solid transparent;
            transition: background 0.2s;
        }
        .esus-header:hover { background: rgba(255,255,255,0.06); }
        .esus-header.expanded { border-bottom-color: rgba(255,255,255,0.1); }

        .esus-content {
            padding: 14px;
            display: flex;
            flex-direction: column;
            gap: 12px;
        }

        .esus-badge {
            background: #334155;
            color: #94a3b8;
            font-size: 9px;
            padding: 2px 6px;
            border-radius: 4px;
            font-weight: 700;
            border: 1px solid rgba(255,255,255,0.05);
        }

        .esus-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 5px; }

        .esus-btn-region {
            background: rgba(255, 255, 255, 0.03);
            border: 1px solid rgba(255, 255, 255, 0.05);
            color: #94a3b8;
            padding: 6px;
            border-radius: 6px;
            font-size: 9px;
            font-weight: 700;
            cursor: pointer;
            transition: all 0.2s;
            display: flex; align-items: center; justify-content: center;
        }
        .esus-btn-region:hover { background: rgba(255, 255, 255, 0.08); color: #fff; }

        .esus-btn-region.active[data-value="TODAS"] { background: rgba(59, 130, 246, 0.15); border-color: #3b82f6; color: #fff; }
        .esus-btn-region.active[data-value="NORTE"] { background: rgba(16, 185, 129, 0.15); border-color: #10b981; color: #34d399; }
        .esus-btn-region.active[data-value="SUL"]    { background: rgba(59, 130, 246, 0.15); border-color: #3b82f6; color: #60a5fa; }
        .esus-btn-region.active[data-value="LESTE"] { background: rgba(168, 85, 247, 0.15); border-color: #a855f7; color: #c084fc; }
        .esus-btn-region.active[data-value="OESTE"] { background: rgba(245, 158, 11, 0.15); border-color: #f59e0b; color: #fbbf24; }

        .esus-console {
            background: rgba(0, 0, 0, 0.3);
            border: 1px solid rgba(255, 255, 255, 0.05);
            border-radius: 6px;
            padding: 8px 10px;
        }
        .esus-console-text {
            font-family: monospace;
            font-size: 10px;
            color: #60a5fa;
            white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }

        .esus-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 2px; }

        .esus-btn-main {
            border: none;
            padding: 8px 0;
            border-radius: 6px;
            font-weight: 600;
            font-size: 10px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            color: white;
            transition: all 0.2s ease;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        }
        .esus-btn-main:hover { transform: translateY(-1px); box-shadow: 0 4px 8px rgba(0,0,0,0.3); }
        .esus-btn-main:active { transform: translateY(0); opacity: 0.8; }

        .btn-start {
            background: linear-gradient(135deg, #059669 0%, #10b981 100%);
            border-top: 1px solid rgba(255,255,255,0.1);
        }
        .btn-stop  {
            background: linear-gradient(135deg, #9f1239 0%, #e11d48 100%);
            border-top: 1px solid rgba(255,255,255,0.1);
        }

        .toggle-icon { font-size: 20px; color: #64748b; transition: transform 0.3s; }
        .expanded .toggle-icon { transform: rotate(180deg); }

        .btn-update {
            font-size: 16px; color: #64748b; cursor: pointer; transition: color 0.2s;
            display: flex; align-items: center;
        }
        .btn-update:hover { color: #38bdf8; }
    `);

    // ================= CONSTRUÇÃO DO PAINEL =================
    setTimeout(criarPainel, 500);

    function criarPainel() {
        if (document.getElementById("esusPainelStatus")) return;

        const div = document.createElement("div");
        div.id = "esusPainelStatus";

        // Recupera preferências salvas
        const savedRegion = localStorage.getItem("esus_region_pref") || "TODAS";
        const isMinimized = localStorage.getItem("esus_panel_minimized") === "true";

        div.innerHTML = `
            <div class="glass-panel">
                <!-- Header (Clicável) -->
                <div class="esus-header ${!isMinimized ? 'expanded' : ''}" id="esusHeader">
                    <div style="display:flex; gap:8px; align-items:center;">
                        <span class="material-symbols-rounded" style="color:#60a5fa; font-size:20px;">smart_toy</span>
                        <div>
                            <h2 style="font-size:12px; font-weight:700; color:white;">Robô e-SUS V9.0</h2>
                        </div>
                    </div>
                    <div style="display:flex; align-items:center; gap:8px;">
                        <span class="material-symbols-rounded btn-update" id="esusUpdate" title="Verificar Atualizações">sync</span>
                        <div id="esusStatusBadge" class="esus-badge">PARADO</div>
                        <span class="material-symbols-rounded toggle-icon" id="esusToggle" title="Expandir/Recolher">expand_more</span>
                    </div>
                </div>

                <!-- Conteúdo (Expansível) -->
                <div class="esus-content" id="esusContent" style="${isMinimized ? 'display:none;' : ''}">
                    <!-- Seletor de Região -->
                    <div>
                        <div class="esus-grid" id="gridRegioes">
                            <button class="esus-btn-region" style="grid-column: span 4;" data-value="TODAS">🌍 TODAS</button>
                            <button class="esus-btn-region" data-value="NORTE">NORTE</button>
                            <button class="esus-btn-region" data-value="SUL">SUL</button>
                            <button class="esus-btn-region" data-value="LESTE">LESTE</button>
                            <button class="esus-btn-region" data-value="OESTE">OESTE</button>
                        </div>
                    </div>

                    <!-- Status Console -->
                    <div class="esus-console">
                        <div id="esusStatusMsg" class="esus-console-text">Pronto. Aguardando...</div>
                    </div>

                    <!-- Botões Iniciar/Parar -->
                    <div class="esus-actions">
                        <button id="esusStart" class="esus-btn-main btn-start">
                            <span class="material-symbols-rounded" style="font-size:16px">play_arrow</span> INICIAR
                        </button>
                        <button id="esusStop" class="esus-btn-main btn-stop">
                            <span class="material-symbols-rounded" style="font-size:16px">stop</span> PARAR
                        </button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(div);

        // --- Lógica de Interface ---
        const header = document.getElementById('esusHeader');
        const content = document.getElementById('esusContent');
        const toggleBtn = document.getElementById('esusToggle');

        // Minimizar/Expandir
        header.onclick = (e) => {
            if(e.target.id === 'esusUpdate' || e.target.id === 'esusStatusBadge' || e.target.closest('#esusUpdate')) return;
            const isHidden = content.style.display === 'none';
            content.style.display = isHidden ? 'flex' : 'none';
            header.classList.toggle('expanded', isHidden);
            localStorage.setItem("esus_panel_minimized", !isHidden);
        };

        // Update Script
        document.getElementById('esusUpdate').onclick = () => {
            if(confirm("Verificar atualizações do script?")) window.open(LINK_UPDATE, '_blank');
        };

        // Seleção de Região
        const btns = div.querySelectorAll('.esus-btn-region');

        function updateSelection(val) {
            localStorage.setItem("esus_region_pref", val);
            btns.forEach(b => {
                if (b.dataset.value === val) b.classList.add('active');
                else b.classList.remove('active');
            });
            log(`Região alvo: ${val}`);
        }

        btns.forEach(b => b.onclick = () => {
            if (!running) updateSelection(b.dataset.value);
        });
        updateSelection(savedRegion);

        // Botões de Ação
        document.getElementById("esusStart").onclick = iniciarScript;
        document.getElementById("esusStop").onclick = pararScript;

        // Restaura estado visual se estiver rodando
        if (localStorage.getItem("esus_running") === "true") {
            updateLoopStatusUI(true);
        }
    }

    // ================= UTILITÁRIOS VISUAIS =================
    function setStatus(msg, type='info') {
        const el = document.getElementById("esusStatusMsg");
        if (el) {
            el.textContent = msg;
            el.style.color = type === 'error' ? '#f87171' : type === 'success' ? '#34d399' : '#60a5fa';
        }
        console.log("[STATUS]", msg);
    }

    function log(msg, isError = false) {
        setStatus(msg, isError ? 'error' : 'info');
    }

    function updateLoopStatusUI(active) {
        const badge = document.getElementById("esusStatusBadge");
        if (badge) {
            badge.textContent = active ? "RODANDO" : "PARADO";
            badge.style.background = active ? "rgba(16, 185, 129, 0.2)" : "#334155";
            badge.style.color = active ? "#34d399" : "#94a3b8";
            badge.style.border = active ? "1px solid rgba(16, 185, 129, 0.4)" : "1px solid rgba(255,255,255,0.05)";
        }
        const btns = document.querySelectorAll('.esus-btn-region');
        btns.forEach(b => {
            b.style.opacity = active ? '0.5' : '1';
            b.style.pointerEvents = active ? 'none' : 'auto';
        });
    }

    // ================= WATCHDOG & CONTROLE =================
    function kickWatchdog() {
        if (watchdogTimer) clearTimeout(watchdogTimer);
        watchdogTimer = setTimeout(() => {
            console.warn("⚠️ TRAVOU (Watchdog). Reiniciando...");
            window.location.href = "https://esus.procempa.com.br" + URL_HOME_EXATA;
        }, WATCHDOG_LIMIT);
    }

    function heartbeat() {
        if (!running) return;
        kickWatchdog();
    }

    function iniciarScript() {
        if (running) return;
        running = true;
        const regiao = localStorage.getItem("esus_region_pref") || "TODAS";
        localStorage.setItem("esus_running", "true");
        updateLoopStatusUI(true);
        log(`Iniciando (${regiao})...`);
        kickWatchdog();
        buscarProximo();
    }

    function pararScript() {
        running = false;
        emProcessamento = false;
        isRequesting = false;
        if (activeRequest && typeof activeRequest.abort === 'function') {
            try { activeRequest.abort(); } catch(e){}
        }
        activeRequest = null;
        localStorage.setItem("esus_running", "false");
        if (watchdogTimer) clearTimeout(watchdogTimer);
        updateLoopStatusUI(false);
        setStatus("Parado", 'error');
    }

    // ================= API V9: BUSCAR PRÓXIMO =================
    function buscarProximo() {
        if (!running || emProcessamento || isRequesting) return;

        isRequesting = true;
        heartbeat();
        setStatus("Consultando API...");

        // Passa a região selecionada na busca
        const regiao = localStorage.getItem("esus_region_pref") || "TODAS";
        const urlNext = `${WEBAPP_URL}?api_target=esus&action=next&token=${WEBAPP_TOKEN}&region=${regiao}&t=${Date.now()}`;

        kickWatchdog();

        activeRequest = GM_xmlhttpRequest({
            method: "GET",
            url: urlNext,
            timeout: 90000,
            onload: (resp) => {
                isRequesting = false;
                activeRequest = null;
                kickWatchdog();

                if (!running) return;

                let data;
                try {
                    data = JSON.parse(resp.responseText);
                } catch (e) {
                    log("Erro leitura JSON", true);
                    setTimeout(() => { if(running) buscarProximo(); }, 5000);
                    return;
                }

                if (data && data.status && String(data.status).toLowerCase().includes("conclu")) {
                    log("Fila finalizada!");
                    pararScript();
                    return;
                }

                if (!data || !data.ok || !data.record) {
                    log("Fila vazia ou erro. Tentando...", true);
                    setTimeout(() => { if(running) buscarProximo(); }, 5000);
                    return;
                }

                const rec = data.record;
                currentPaciente = {
                    row: rec.row,
                    cns: rec.cns || "",
                    cpf: rec.cpf || "",
                    nome: rec.nome || "",
                    nasc: rec.nasc || "",
                    nis: rec.nis || ""
                };

                let identificador = currentPaciente.cns || currentPaciente.cpf || currentPaciente.nome;
                log(`Processando: ${identificador.substring(0, 15)}...`);
                processarPaciente();
            },
            onerror: () => {
                isRequesting = false;
                activeRequest = null;
                log("Erro Conexão API. Retentando...", true);
                setTimeout(() => { if(running) buscarProximo(); }, 10000);
            },
            ontimeout: () => {
                isRequesting = false;
                activeRequest = null;
                log("Timeout API. Retentando...", true);
                setTimeout(() => { if(running) buscarProximo(); }, 5000);
            }
        });
    }

    // ================= API V9: SALVAR =================
    function salvarPlanilha() {
        return new Promise(resolve => {
            heartbeat("salvando planilha");
            if (!currentPaciente || !currentPaciente.row) { resolve(); return; }

            setStatus("Salvando dados...");

            const paramsSave = new URLSearchParams({
                api_target: "esus",
                action: "save",
                token: WEBAPP_TOKEN,
                row: currentPaciente.row,
                dataMedicao: currentPaciente.dataMedicao || "-",
                peso: currentPaciente.peso || "-",
                altura: currentPaciente.altura || "-",
                vacinacao: currentPaciente.vacinacao || "-",
                status: currentPaciente.status || "Erro ao processar"
            });

            kickWatchdog();

            activeRequest = GM_xmlhttpRequest({
                method: "POST",
                url: WEBAPP_URL,
                data: paramsSave.toString(),
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                timeout: 90000,
                onload: () => {
                    activeRequest = null;
                    log("Salvo com sucesso!", 'success');
                    resolve();
                },
                onerror: () => {
                    activeRequest = null;
                    log("Erro ao salvar (ignorado)", true);
                    resolve();
                },
                ontimeout: () => {
                    activeRequest = null;
                    log("Timeout ao salvar (ignorado)", true);
                    resolve();
                }
            });
        });
    }

    // ================= UTILITÁRIOS DOM (LÓGICA ORIGINAL) =================
    const sleep = ms => new Promise(r => setTimeout(r, ms));

    async function preencherCampoRobusto(input, valor) {
        input.focus();
        const proto = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, "value").set.call(input, valor);
        input.dispatchEvent(new Event("input", { bubbles: true }));
        await sleep(100);
    }

    async function aguardarElemento(sel, t = 5000) {
        const ini = Date.now();
        while (Date.now() - ini < t) {
            const el = document.querySelector(sel);
            if (el && el.offsetParent !== null) return el;
            await sleep(100);
        }
        throw `Elemento ñ encontrado: ${sel}`;
    }

    async function aguardarTextoBotao(txt, t = 5000) {
        const ini = Date.now();
        const busca = String(txt).toLowerCase();
        while (Date.now() - ini < t) {
            const btn = [...document.querySelectorAll("button")]
                .find(b => b.innerText && b.innerText.toLowerCase().includes(busca) && b.offsetParent !== null);
            if (btn) return btn;
            await sleep(100);
        }
        throw `Botão '${txt}' ñ encontrado`;
    }

    async function aguardarAbaPorTexto(txt, t = 5000) {
        const ini = Date.now();
        const busca = String(txt).toLowerCase();
        while (Date.now() - ini < t) {
            const aba = [...document.querySelectorAll('a[role="tab"]')]
                .find(a => a.innerText && a.innerText.toLowerCase().includes(busca));
            if (aba) return aba;
            await sleep(100);
        }
        throw `Aba '${txt}' ñ encontrada`;
    }

    async function aguardarTextoH3(txt, t = 5000) {
        const ini = Date.now();
        const busca = String(txt).toLowerCase();
        while (Date.now() - ini < t) {
            const h = [...document.querySelectorAll("h3")]
                .find(h3 => h3.innerText && h3.innerText.toLowerCase().includes(busca));
            if (h) return h.closest("div");
            await sleep(100);
        }
        return null;
    }

    async function checarVacinacao() {
        const ini = Date.now();
        while (Date.now() - ini < 3000) {
            const spans = document.querySelectorAll("span");
            for (const s of spans) {
                if (s.textContent.trim() === "Vacinação em dia:") {
                    const valor = s.nextElementSibling;
                    if (valor) return valor.textContent.trim();
                }
            }
            await sleep(50);
        }
        return "Não informado";
    }

    async function lerMedicoes() {
        let tabela = null;
        try {
            const ini = Date.now();
            while(Date.now() - ini < 2000) {
                const t = [...document.querySelectorAll("table")].find(x => x.innerText && x.innerText.includes("Data da medição"));
                if(t) { tabela = t; break; }
                await sleep(50);
            }
        } catch(e) {}

        const objVazio = { peso: "-", altura: "-", dataMedicao: "-", status: "DADOS PARCIAIS" };
        if (!tabela) return objVazio;

        const linhas = [...tabela.querySelectorAll("tbody tr")];
        let encontrouNoPeriodo = false;
        let pesoMaisRecente = null;
        let alturaMaisRecente = null;

        linhas.forEach(tr => {
            try {
                const tds = tr.querySelectorAll("td");
                if (tds.length < 3) return;
                const dataTxtRaw = tds[0].innerText.trim();
                const pesoTxt = tds[1].innerText.trim();
                const alturaTxt = tds[2].innerText.trim();

                const m = dataTxtRaw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
                if (!m) return;
                const dia = Number(m[1]);
                const mes = Number(m[2]) - 1;
                const ano = Number(m[3]);

                // ATUALIZADO PARA FILTRAR TUDO ANTES DE 2026
                if (ano < 2026) return;
                const data = new Date(ano, mes, dia);
                if (data < DATA_INICIO || data > DATA_FIM) return;

                encontrouNoPeriodo = true;
                const dataFormatada = String(dia).padStart(2, '0') + '/' + String(mes + 1).padStart(2, '0') + '/' + ano;
                const temPeso = pesoTxt && pesoTxt !== "-";
                const temAltura = alturaTxt && alturaTxt !== "-";

                if (temPeso) {
                    if (!pesoMaisRecente || data > pesoMaisRecente.data) pesoMaisRecente = { valor: pesoTxt, data, dataTxt: dataFormatada };
                }
                if (temAltura) {
                    if (!alturaMaisRecente || data > alturaMaisRecente.data) alturaMaisRecente = { valor: alturaTxt, data, dataTxt: dataFormatada };
                }
            } catch (e) {}
        });

        if (!encontrouNoPeriodo) return objVazio;

        let pFinal = pesoMaisRecente ? pesoMaisRecente.valor : "-";
        let aFinal = alturaMaisRecente ? alturaMaisRecente.valor : "-";
        let dFinal = "-";

        if (pesoMaisRecente && alturaMaisRecente) {
             dFinal = pesoMaisRecente.data > alturaMaisRecente.data ? pesoMaisRecente.dataTxt : alturaMaisRecente.dataTxt;
        } else if (pesoMaisRecente) { dFinal = pesoMaisRecente.dataTxt; }
        else if (alturaMaisRecente) { dFinal = alturaMaisRecente.dataTxt; }

        let statusFinal = "DADOS PARCIAIS";
        if (pFinal !== "-" && aFinal !== "-" && dFinal !== "-") statusFinal = "ENCONTRADO COMPLETO";
        else if (pFinal !== "-" || aFinal !== "-") statusFinal = "DADOS PARCIAIS";

        return { peso: pFinal, altura: aFinal, dataMedicao: dFinal, status: statusFinal };
    }

    // ================= FLUXO PRINCIPAL =================
    async function processarPaciente() {
        if (emProcessamento) return;
        emProcessamento = true;
        heartbeat();

        try {
            const pathAtual = window.location.pathname;
            if (pathAtual !== URL_HOME_EXATA && pathAtual !== URL_HOME_EXATA + "/") {
                log("URL incorreta. Home...", true);
                window.location.href = "https://esus.procempa.com.br" + URL_HOME_EXATA;
                return;
            }

            setStatus("Buscando cidadão...");
            const input = await aguardarElemento('input[name="nomeCpfCns"]', TIMEOUT_BUSCA);

            let termoBusca = currentPaciente.cns;
            if (!termoBusca || termoBusca.length < 5) termoBusca = currentPaciente.cpf;
            if ((!termoBusca || termoBusca.length < 5) && currentPaciente.nome) termoBusca = currentPaciente.nome;

            if (!termoBusca) throw "Sem dados para busca";

            await preencherCampoRobusto(input, termoBusca);
            const submitBtn = document.querySelector('button[type="submit"]');
            if (submitBtn) submitBtn.click();
            else throw "Botão buscar não encontrado";

            try { await aguardarTextoBotao("visualizar", TIMEOUT_BUSCA); }
            catch {
                log("Cidadão não encontrado", true);
                currentPaciente.status = "NÃO ENCONTRADO NO E-SUS";
                await salvarPlanilha();
                window.location.href = "https://esus.procempa.com.br" + URL_HOME_EXATA;
                return;
            }

            const btnVisualizar = [...document.querySelectorAll("button")].find(b => b.innerText && b.innerText.toLowerCase().includes("visualizar"));
            if (btnVisualizar) btnVisualizar.click();

            heartbeat();

            const aba = await aguardarAbaPorTexto("folha de rosto", TIMEOUT_BUSCA);
            aba.click();

            const textarea = await aguardarElemento('textarea[name="justificativa"]', TIMEOUT_BUSCA);
            let tentativasPreenchimento = 0;
            while (textarea.value !== TEXTO_JUSTIFICATIVA && tentativasPreenchimento < 5) {
                await preencherCampoRobusto(textarea, TEXTO_JUSTIFICATIVA);
                await sleep(200);
                tentativasPreenchimento++;
            }
            if (textarea.value === "") throw "Falha justificativa";

            const botSalvar = await aguardarTextoBotao("salvar", TIMEOUT_BUSCA);
            if (!botSalvar || botSalvar.disabled) throw "Botão salvar inválido";
            botSalvar.click();
            heartbeat();

            const vacinaStatus = await checarVacinacao();
            currentPaciente.vacinacao = vacinaStatus;
            log(`Vacina: ${vacinaStatus}`);

            try {
                const botSalvar2 = await aguardarTextoBotao("salvar", 2000);
                if (botSalvar2) botSalvar2.click();
            } catch (e) {}

            const card = await aguardarTextoH3("medições", TIMEOUT_BUSCA);
            if (card) {
                card.click();
                heartbeat();
            } else {
                throw "Cartão medições sumiu";
            }

            const resultado = await lerMedicoes();
            currentPaciente = { ...currentPaciente, ...resultado };

            await salvarPlanilha();
            log(`Fim: ${currentPaciente.status}`);
            window.location.href = "https://esus.procempa.com.br" + URL_HOME_EXATA;

        } catch (e) {
            log("ERRO FATAL: " + e, true);
            if (currentPaciente) {
                currentPaciente.status = "ERRO: " + (typeof e === 'string' ? e : "Desconhecido");
                try { await salvarPlanilha(); } catch(ex) {}
            }
            if(running) {
                setStatus("Forçando Home...");
                await sleep(1000);
                try {
                      const btnFechar = document.querySelector('button[aria-label="Fechar"]');
                      if(btnFechar) btnFechar.click();
                } catch(err){}
                await sleep(500);
                window.location.href = "https://esus.procempa.com.br" + URL_HOME_EXATA;
            }
        }
    }

    // Retomada automática ao recarregar a página
    setTimeout(() => {
        if (localStorage.getItem("esus_running") === "true") {
            setTimeout(() => {
                 log("Retomando automaticamente...", true);
                 iniciarScript();
            }, Math.random() * 2000);
        }
    }, 2000);

})();
