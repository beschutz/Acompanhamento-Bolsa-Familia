// ==UserScript==
// @name         E-Gestor FULL V9.0 (Vigência 1/2026)
// @namespace    http://tampermonkey.net/
// @version      9.0.0
// @description  Robô e-Gestor atualizado. Trava de segurança no salvamento para evitar status "Processando...".
// @match        *://bfa.saude.gov.br/*
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @run-at       document-end
// ==/UserScript==

(function () {
    "use strict";

    console.log("🟢 E-Gestor V9.0 (Vigência 1/2026) Iniciado");

    // ================= CONFIGURAÇÕES =================
    const WEBAPP_URL = "https://script.google.com/macros/s/AKfycbxX3ByavjUXD18ttcApMdXouuCJJ6dOqlKmivKQy17Fgt2sBbU5QA2SVVkBP8HRRT_s/exec";
    const WEBAPP_TOKEN = "18032003";
    const LINK_UPDATE = "https://gist.github.com/beschutz/e90588566418ea967e1e3788c0e78039/raw/e7b6f0fdf574c76f252383b34c46fa5bb8b5cdc4/automacao_egestor.user.js";
    const TIMEOUT_LIMIT_MS = 30000;

    let lastActionTime = Date.now();

    // ============ ESTILOS ============
    GM_addStyle(`
        @import url('https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap');
        @import url('https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200');

        #bfaPainelStatus { font-family: 'Roboto', sans-serif; position: fixed; top: 20px; right: 20px; z-index: 999999; width: 260px; user-select: none; }
        .glass-panel { background: rgba(15, 23, 42, 0.95); backdrop-filter: blur(12px); border: 1px solid rgba(255, 255, 255, 0.08); box-shadow: 0 10px 30px -5px rgba(0, 0, 0, 0.6); border-radius: 12px; overflow: hidden; transition: all 0.3s ease; }

        .bfa-header { display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; background: rgba(255,255,255,0.03); cursor: pointer; border-bottom: 1px solid transparent; transition: background 0.2s; }
        .bfa-header:hover { background: rgba(255,255,255,0.06); }
        .bfa-header.expanded { border-bottom-color: rgba(255,255,255,0.1); }

        .bfa-content { padding: 14px; display: flex; flex-direction: column; gap: 12px; }

        .bfa-badge { background: #334155; color: #94a3b8; font-size: 9px; padding: 2px 6px; border-radius: 4px; font-weight: 700; border: 1px solid rgba(255,255,255,0.05); }

        .bfa-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 5px; }
        .bfa-btn-region { background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.05); color: #94a3b8; padding: 6px; border-radius: 6px; font-size: 9px; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s; }
        .bfa-btn-region:hover { background: rgba(255, 255, 255, 0.08); color: #fff; }
        .bfa-btn-region.active { background: rgba(59, 130, 246, 0.15); border-color: #3b82f6; color: #fff; }

        .bfa-console { background: rgba(0, 0, 0, 0.3); border: 1px solid rgba(255, 255, 255, 0.05); border-radius: 6px; padding: 8px 10px; }
        .bfa-console-text { font-family: monospace; font-size: 10px; color: #60a5fa; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

        .bfa-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 2px; }
        .bfa-btn-main { border: none; padding: 8px 0; border-radius: 6px; font-weight: 600; font-size: 10px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; color: white; transition: all 0.2s ease; text-transform: uppercase; box-shadow: 0 2px 4px rgba(0,0,0,0.2); }
        .bfa-btn-main:hover { transform: translateY(-1px); box-shadow: 0 4px 8px rgba(0,0,0,0.3); }
        .bfa-btn-main:active { transform: translateY(0); opacity: 0.8; }

        .btn-start { background: linear-gradient(135deg, #059669 0%, #10b981 100%); border-top: 1px solid rgba(255,255,255,0.1); }
        .btn-stop { background: linear-gradient(135deg, #9f1239 0%, #e11d48 100%); border-top: 1px solid rgba(255,255,255,0.1); }

        .toggle-icon { font-size: 20px; color: #64748b; transition: transform 0.3s; }
        .expanded .toggle-icon { transform: rotate(180deg); }

        .btn-update { font-size: 16px; color: #64748b; cursor: pointer; transition: color 0.2s; display: flex; align-items: center; }
        .btn-update:hover { color: #38bdf8; }
    `);

    // ============ UTILITÁRIOS DE REDE ============
    function requestWithRetry(options, retries = 3) {
        return new Promise((resolve, reject) => {
            const attempt = (n) => {
                GM_xmlhttpRequest({
                    ...options,
                    onload: (res) => {
                        if (res.status >= 200 && res.status < 300) resolve(res);
                        else { if (n > 0) setTimeout(() => attempt(n - 1), 2000); else reject(res); }
                    },
                    onerror: () => { if (n > 0) setTimeout(() => attempt(n - 1), 2000); else reject("Erro de Conexão"); },
                    ontimeout: () => { if (n > 0) setTimeout(() => attempt(n - 1), 2000); else reject("Timeout"); }
                });
            };
            attempt(retries);
        });
    }

    function resetWatchdog() { lastActionTime = Date.now(); }

    // ============ API ============
    async function getNextFromFila() {
        resetWatchdog();
        const region = sessionStorage.getItem("bfa_targetRegion") || "TODAS";
        setStatus(`Buscando fila (${region})...`);

        try {
            const res = await requestWithRetry({
                method: "GET",
                url: `${WEBAPP_URL}?api_target=egestor&action=next&token=${WEBAPP_TOKEN}&region=${region}&t=${Date.now()}`
            });

            const j = JSON.parse(res.responseText);
            if (j && j.ok && j.record) return j.record;
            if (j && j.msg) { setStatus(j.msg); return null; }
            return "ERRO_TEMPORARIO";
        } catch (e) {
            console.error("Erro API:", e);
            setStatus("Aguardando planilha...", 'error');
            return "ERRO_TEMPORARIO";
        }
    }

    // AWAIT DE SEGURANÇA E BLINDAGEM DE RESPOSTA
    async function markDone(filaId, statusText) {
        resetWatchdog();
        setStatus("Salvando status...");

        let sucesso = false;
        while (!sucesso) {
            try {
                const data = new URLSearchParams({
                    api_target: "egestor", action: "done", id: filaId, status: statusText, token: WEBAPP_TOKEN
                }).toString();

                const res = await requestWithRetry({
                    method: "POST", url: WEBAPP_URL, headers: { "Content-Type": "application/x-www-form-urlencoded" }, data: data
                });

                try {
                    const j = JSON.parse(res.responseText);
                    if (j && j.ok) {
                        console.log("Salvo com sucesso na planilha!");
                        sucesso = true; // Sai do loop
                    } else {
                        throw new Error("Planilha retornou ok=false");
                    }
                } catch(errParse) {
                    console.error("Erro ou HTML do Google, retentando em 2s...");
                    await new Promise(r => setTimeout(r, 2000));
                }
            } catch (e) {
                console.error("Falha ao salvar DONE, retentando em 2s:", e);
                await new Promise(r => setTimeout(r, 2000));
            }
        }
    }

    // ============ LÓGICA DE UI ============
    function criarPainel() {
        if (document.getElementById("bfaPainelStatus")) return;
        const div = document.createElement("div");
        div.id = "bfaPainelStatus";

        const isMinimized = localStorage.getItem("bfa_panel_minimized") === "true";
        const savedRegion = localStorage.getItem("bfa_region_pref") || "TODAS";

        div.innerHTML = `
            <div class="glass-panel">
                <div class="bfa-header ${!isMinimized ? 'expanded' : ''}" id="bfaHeader">
                    <div style="display:flex; gap:8px; align-items:center;">
                        <span class="material-symbols-rounded" style="color:#60a5fa; font-size:20px;">smart_toy</span>
                        <div><h2 style="font-size:12px; font-weight:700; color:white;">E-Gestor V9.0</h2></div>
                    </div>
                    <div style="display:flex; align-items:center; gap:8px;">
                        <span class="material-symbols-rounded btn-update" id="bfaUpdate" title="Verificar Atualizações">sync</span>
                        <div id="bfaStatusBadge" class="bfa-badge">PARADO</div>
                        <span class="material-symbols-rounded toggle-icon" id="bfaToggle" title="Expandir/Recolher">expand_more</span>
                    </div>
                </div>
                <div class="bfa-content" id="bfaContent" style="${isMinimized ? 'display:none;' : ''}">
                    <div>
                        <div class="bfa-grid" id="gridRegioes">
                            <button class="bfa-btn-region" style="grid-column: span 4;" data-value="TODAS">🌍 TODAS</button>
                            <button class="bfa-btn-region" data-value="NORTE">NORTE</button>
                            <button class="bfa-btn-region" data-value="SUL">SUL</button>
                            <button class="bfa-btn-region" data-value="LESTE">LESTE</button>
                            <button class="bfa-btn-region" data-value="OESTE">OESTE</button>
                        </div>
                    </div>
                    <div class="bfa-console">
                        <div id="bfaStatusMsg" class="bfa-console-text">Pronto.</div>
                    </div>
                    <div class="bfa-actions">
                        <button id="bfaStart" class="bfa-btn-main btn-start"><span class="material-symbols-rounded" style="font-size:16px">play_arrow</span> INICIAR</button>
                        <button id="bfaStop" class="bfa-btn-main btn-stop"><span class="material-symbols-rounded" style="font-size:16px">stop</span> PARAR</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(div);

        const header = document.getElementById('bfaHeader');
        const content = document.getElementById('bfaContent');

        header.onclick = (e) => {
            if(e.target.id === 'bfaUpdate' || e.target.id === 'bfaStatusBadge' || e.target.closest('#bfaUpdate')) return;
            const isHidden = content.style.display === 'none';
            content.style.display = isHidden ? 'flex' : 'none';
            header.classList.toggle('expanded', isHidden);
            localStorage.setItem("bfa_panel_minimized", !isHidden);
        };

        document.getElementById('bfaUpdate').onclick = (e) => {
            e.stopPropagation();
            if(confirm("Verificar atualizações do script?")) window.open(LINK_UPDATE, '_blank');
        };

        const btns = div.querySelectorAll('.bfa-btn-region');
        btns.forEach(b => b.onclick = () => {
             btns.forEach(x => x.classList.remove('active'));
             b.classList.add('active');
             localStorage.setItem("bfa_region_pref", b.dataset.value);
        });

        btns.forEach(b => { if(b.dataset.value === savedRegion) b.classList.add('active'); });

        document.getElementById("bfaStart").onclick = () => {
            const reg = localStorage.getItem("bfa_region_pref") || "TODAS";
            sessionStorage.setItem("bfa_autoLoop", "1");
            sessionStorage.setItem("bfa_targetRegion", reg);
            resetWatchdog();
            updateLoopStatusUI(true);
            setStatus(`Iniciando (${reg})...`);
            startManager();
        };
        document.getElementById("bfaStop").onclick = () => stopAutoLoop("Parado pelo usuário");

        if (sessionStorage.getItem("bfa_autoLoop") === "1") {
            updateLoopStatusUI(true);
            startManager();
        }
    }

    function setStatus(msg, type='info') {
        const el = document.getElementById("bfaStatusMsg");
        if (el) {
            el.textContent = msg;
            el.style.color = type === 'error' ? '#f87171' : type === 'success' ? '#34d399' : '#60a5fa';
        }
    }

    function updateLoopStatusUI(active) {
        const badge = document.getElementById("bfaStatusBadge");
        if (badge) {
            badge.textContent = active ? "ATIVO" : "PARADO";
            badge.style.background = active ? "rgba(16, 185, 129, 0.2)" : "#334155";
            badge.style.color = active ? "#34d399" : "#94a3b8";
            badge.style.border = active ? "1px solid rgba(16, 185, 129, 0.4)" : "1px solid rgba(255,255,255,0.05)";
        }
        document.querySelectorAll('.bfa-btn-region').forEach(b => {
            b.style.opacity = active ? '0.5' : '1';
            b.style.pointerEvents = active ? 'none' : 'auto';
        });
    }

    function stopAutoLoop(reason) {
        sessionStorage.removeItem("bfa_autoLoop");
        sessionStorage.removeItem("bfa_filaId");
        updateLoopStatusUI(false);
        setStatus(reason || "Parado", 'error');
    }

    setInterval(() => {
        if (sessionStorage.getItem("bfa_autoLoop") === "1" && Date.now() - lastActionTime > TIMEOUT_LIMIT_MS) {
            setStatus("Watchdog: Reiniciando...");
            window.location.href = "https://bfa.saude.gov.br/principal";
        }
    }, 5000);

    // ============ MANAGER DE ROTAS ============
    async function startManager() {
        if (sessionStorage.getItem("bfa_autoLoop") !== "1") return;
        resetWatchdog();

        const url = window.location.href;

        if (url.includes("/principal")) {
            setStatus("Entrando...");
            const link = document.querySelector('a[href*="acompanhamento"]');
            if (link) link.click(); else window.location.href = "https://bfa.saude.gov.br/acompanhamento";
            return;
        }

        if (url.includes("/acompanhamento") && !url.includes("/cadastro") && !url.includes("/familiar/")) {
            const check = setInterval(() => {
                if (document.querySelector("#NU_NIS")) {
                    clearInterval(check);
                    automatizarAcompanhamento();
                }
            }, 500);
            return;
        }

        if (url.includes("/acompanhamento/cadastro")) {
            const check = setInterval(() => {
                if (document.querySelector('input[name="DT_ACOMPANHAMENTO"]')) {
                    clearInterval(check);
                    automatizarProntuario();
                }
            }, 500);
            return;
        }

        if (url.includes("/acompanhamento/familiar/")) {
            clicarOkFinal();
            return;
        }
    }

    // ============ FUNÇÕES DO ROBÔ ============
    async function automatizarAcompanhamento() {
        const rec = await getNextFromFila();

        if (rec === "ERRO_TEMPORARIO") {
            setTimeout(automatizarAcompanhamento, 5000);
            return;
        }

        if (!rec) {
            sessionStorage.removeItem("bfa_autoLoop");
            updateLoopStatusUI(false);
            setStatus("Fila Finalizada", "success");
            alert("Fila Finalizada ou Vazia!");
            return;
        }

        sessionStorage.setItem("bfa_filaId", rec.row);
        sessionStorage.setItem("bfa_dataAcomp", rec.data_acomp);
        sessionStorage.setItem("bfa_peso", rec.peso);
        sessionStorage.setItem("bfa_altura", rec.altura);
        sessionStorage.setItem("bfa_nis", rec.nis);

        const nisInput = document.querySelector("#NU_NIS");
        if(nisInput) {
            Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(nisInput, rec.nis);
            nisInput.dispatchEvent(new Event("input", { bubbles: true }));
        }

        const radio = document.querySelector('input[type="radio"][value="1"]');
        if (radio) radio.click();

        setTimeout(() => {
            const btn = document.querySelector('button[type="submit"].btn-success');
            if (btn) btn.click();
            setTimeout(processarResultados, 2000);
        }, 500);
    }

    // FUNÇÃO ASYNC: Ele congela a execução até o markDone terminar (Google salvar)
    async function processarResultados() {
        const linhas = document.querySelectorAll("table tbody tr");
        let pendente = false;
        for (const l of linhas) {
            if (l.innerText.toUpperCase().includes("SEM INFORMAÇÃO")) {
                pendente = true;
                const lapis = l.querySelector('a');
                if (lapis) { lapis.click(); return; }
            }
        }
        if (!pendente) {
            setStatus("Comunicando com a Planilha...");
            await markDone(sessionStorage.getItem("bfa_filaId"), "E-SUS AB");
            // Só executa o código abaixo quando a planilha estiver de fato atualizada!
            window.location.href = "https://bfa.saude.gov.br/principal";
        }
    }

    async function automatizarProntuario() {
        const dataAcomp = sessionStorage.getItem("bfa_dataAcomp");
        const peso = sessionStorage.getItem("bfa_peso");
        const altura = sessionStorage.getItem("bfa_altura");

        const setVal = (sel, val) => {
            const el = document.querySelector(sel);
            if(el && val) {
                el.value = val;
                el.dispatchEvent(new Event("input"));
                el.dispatchEvent(new Event("change"));
            }
        };

        setVal('input[name="DT_ACOMPANHAMENTO"]', dataAcomp);
        setVal('select[name="ST_ACOMPANHADO"]', "S");

        await new Promise(r => setTimeout(r, 500));

        setVal('input[name="NU_PESO"]', peso);
        setVal('input[name="NU_ALTURA"]', altura);
        setVal('select[name="ST_VACINACAO"]', "S");
        setVal('select[name="ST_GESTANTE"]', "N");

        setTimeout(() => {
            const btnOkGestante = document.querySelector('button[data-bb-handler="ok"]');
            if (btnOkGestante && btnOkGestante.offsetParent !== null) {
                btnOkGestante.click();
            }
            setTimeout(clicarSalvarComVerificacaoUrl, 500);
        }, 500);
    }

    function clicarSalvarComVerificacaoUrl() {
        const btnSalvar = document.querySelector('button[name="salvar"]');
        if (btnSalvar) btnSalvar.click();

        const checkSim = setInterval(() => {
            const btnSim = document.querySelector('button[data-bb-handler="confirm"]');
            if (btnSim && btnSim.offsetParent !== null) {
                btnSim.click();
                clearInterval(checkSim);
            }
        }, 200);

        const checkUrl = setInterval(() => {
            if (window.location.href.includes("/acompanhamento/familiar/") || document.querySelector(".alert-success")) {
                clearInterval(checkUrl);
                clicarOkFinal();
            }
        }, 500);
    }

    // ORDEM INVERTIDA: Salva primeiro, Clica no OK do site depois.
    function clicarOkFinal() {
        const checkOk = setInterval(async () => {
            const btnOk = document.querySelector('button[data-bb-handler="ok"]');
            if (btnOk && btnOk.offsetParent !== null) {
                clearInterval(checkOk); // Congela o verificador pra não rodar duas vezes

                setStatus("Finalizando cadastro no Google...");

                // MÁGICA: O robô vai salvar na planilha enquanto o popup de SUCESSO do site ainda está aberto
                await markDone(sessionStorage.getItem("bfa_filaId"), "E-GESTOR");

                // Só depois que o Google der "ok", a gente clica no botão (o que costuma redirecionar o site nativamente)
                btnOk.click();

                // Redundância: se o site não mudar de tela sozinho, nós forçamos a mudança
                setTimeout(() => {
                    window.location.href = "https://bfa.saude.gov.br/principal";
                }, 1500);
            }
        }, 200);
    }

    setTimeout(criarPainel, 1000);
})();
