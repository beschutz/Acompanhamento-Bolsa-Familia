// ==UserScript==
// @name         Painel Mestre Bolsa Família V9.3 (Diagnóstico e persistência melhorados)
// @namespace    http://violentmonkey.net/
// @version      9.3.0
// @description  Painel de gestão com condicionalidades configuráveis, validação automática, resumo de ciclo e diagnóstico de erros aprimorado.
// @author       Bernardo (Refinado por IA)
// @match        file:///*/Acompanha+%20Familia.html
// @match        https://esus.procempa.com.br/*
// @match        https://egestoraps.saude.gov.br/*
// @match        https://acesso-egestoraps.saude.gov.br/*
// @match        https://egestorab.saude.gov.br/*
// @match        https://sso.acesso.gov.br/*
// @match        https://*.saude.gov.br/*
// @connect      script.google.com
// @connect      script.googleusercontent.com
// @icon         https://i.imgur.com/DVARunG.png
// @require      https://cdn.jsdelivr.net/npm/chart.js
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    // =================================================================
    // ⚙️ CONFIGURAÇÃO
    // =================================================================
    const URL_APPS_SCRIPT = "https://script.google.com/macros/s/AKfycbxX3ByavjUXD18ttcApMdXouuCJJ6dOqlKmivKQy17Fgt2sBbU5QA2SVVkBP8HRRT_s/exec";
    const TOKEN_ACESSO = "18032003";
    const URL_LOGO = "https://i.imgur.com/DVARunG.png";
    const LINK_EGESTOR = "https://acesso-egestoraps.saude.gov.br/login";
    const LINK_ESUS = "https://esus.procempa.com.br/";

    let MEMORY_CREDS = null;
    let chartInstance = null;
    let CONFIG_ATUAL_SERVIDOR = null;

    // =================================================================
    // 📅 VIGÊNCIAS — lista dinâmica (persiste via GM storage)
    // =================================================================
    const VIGENCIAS_DEFAULT = ["2026/1", "2026/2", "2027/1", "2027/2", "2028/1", "2028/2"];
    const VIGENCIAS_STORAGE_KEY = 'vigencias_list';
    const VIGENCIA_FORMAT = /^\d{4}\/[12]$/;
    const VIG_NAO_CONFIGURADA = "NÃO CONFIGURADA";
    const TOAST_DURATION_MS = 5000;
    const BTN_SAVE_CFG_LABEL = "SALVAR PARA TODA A EQUIPE";
    const DASHBOARD_METRIC_IDS = ['v0','v1','v_eg_atu','v2','v-fila-egestor','v-fila-esus'];

    function getVigenciasList() {
        try {
            const stored = GM_getValue(VIGENCIAS_STORAGE_KEY, '');
            if (stored) {
                const parsed = JSON.parse(stored);
                if (Array.isArray(parsed) && parsed.length > 0) return parsed;
            }
        } catch(e) {}
        return VIGENCIAS_DEFAULT.slice();
    }

    function saveVigenciasList(list) {
        GM_setValue(VIGENCIAS_STORAGE_KEY, JSON.stringify(list));
    }

    /**
     * Normaliza o formato de vigência para AAAA/S (ex.: "1/2026" → "2026/1").
     * Se já estiver no formato correto ou for inválido, retorna como está.
     */
    function normalizeVigencia(v) {
        if (!v) return v;
        const s = String(v).trim();
        const inv = s.match(/^([12])\/(\d{4})$/);
        if (inv) return `${inv[2]}/${inv[1]}`;
        return s;
    }

    // =================================================================
    // 🔐 FUNÇÕES DE SEGURANÇA E LOGIN
    // =================================================================

    function codificarCredenciais(u, p) { return btoa(encodeURIComponent(u + ":::" + p)); }
    function decodificarCredenciais(hash) { try { const d = decodeURIComponent(atob(hash)).split(":::"); return d.length===2 ? {u:d[0],p:d[1]} : null; } catch(e){return null;} }

    async function preencherInput(input, valor) {
        if(!input) return;
        input.focus(); input.click();
        await new Promise(r => setTimeout(r, 100));
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
        if (setter) setter.call(input, valor);
        else input.value = valor;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.dispatchEvent(new Event('blur', { bubbles: true }));
    }

    function podeExecutarLogin() { if (MEMORY_CREDS) return true; return Date.now() < GM_getValue('login_time_window', 0); }
    function encerrarCicloLogin() { GM_setValue('login_time_window', 0); MEMORY_CREDS = null; console.log("🛑 Login encerrado."); }

    if (window.location.hash.includes("autologin=")) {
        const hash = window.location.hash.split("autologin=")[1];
        const creds = decodificarCredenciais(hash);
        if (creds) {
            MEMORY_CREDS = creds;
            if (window.location.href.includes("esus")) { GM_setValue('esus_user', creds.u); GM_setValue('esus_pass', creds.p); }
            else { GM_setValue('egestor_user', creds.u); GM_setValue('egestor_pass', creds.p); }
            GM_setValue('login_time_window', Date.now() + 120000);
            history.replaceState(null, null, window.location.pathname);
        }
    }

    // AUTOMAÇÃO E-SUS
    if (window.location.href.includes("esus.procempa.com.br")) {
        let t = 0;
        const intE = setInterval(async () => {
            if (document.getElementById('hub-overlay')) { clearInterval(intE); return; }
            if (!podeExecutarLogin()) { if (t > 20) clearInterval(intE); return; }
            const uF = document.querySelector('input[name="username"]');
            const pF = document.querySelector('input[name="password"]');
            const bS = document.querySelector('button[type="submit"]');
            if (uF && pF) {
                const u = MEMORY_CREDS ? MEMORY_CREDS.u : GM_getValue('esus_user', '');
                const p = MEMORY_CREDS ? MEMORY_CREDS.p : GM_getValue('esus_pass', '');
                if (u && p && (uF.value === "" || pF.value === "")) {
                    await preencherInput(uF, u); await new Promise(r => setTimeout(r, 200));
                    await preencherInput(pF, p); setTimeout(() => { if (uF.value !== "") bS.click(); }, 400);
                }
            }
            const btnConf = document.querySelector('button[data-testid="confirmarAcaoConfirmacao"]');
            if (btnConf) btnConf.click();
            document.querySelectorAll('button').forEach(b => {
                if (b.innerText.includes("Continuar") && b.closest('[role="dialog"]')) b.click();
                if (b.innerText.includes("Aceitar todos")) b.click();
            });
            document.querySelectorAll('span').forEach(s => {
                if (s.innerText.includes("Enfermeiro")) {
                    const c = s.closest('[data-cy="Acesso.card"]') || s.closest('.css-1sdk046') || s.closest('[tabindex="0"]');
                    if (c) c.click();
                }
            });
            t++; if (t > 240) clearInterval(intE);
        }, 800);
    }

    // AUTOMAÇÃO E-GESTOR
    if (window.location.href.includes("egestor") || window.location.href.includes("saude.gov.br") || window.location.href.includes("sso.acesso.gov.br")) {
        const isGov = window.location.href.includes("sso.acesso.gov.br");
        if (isGov) {
            let t = 0;
            const intG = setInterval(async () => {
                if (!podeExecutarLogin()) { if (t > 20) clearInterval(intG); return; }
                const u = MEMORY_CREDS ? MEMORY_CREDS.u : GM_getValue('egestor_user', '');
                const p = MEMORY_CREDS ? MEMORY_CREDS.p : GM_getValue('egestor_pass', '');
                if (!u || !p) return;
                const iC = document.querySelector('#accountId');
                const bC = document.querySelector('#enter-account-id');
                if (iC && bC && iC.value === "") { await preencherInput(iC, u); setTimeout(() => bC.click(), 500); return; }
                const iP = document.querySelector('#password');
                const bE = document.querySelector('#submit-button');
                if (iP && bE && iP.value === "") { await preencherInput(iP, p); setTimeout(() => { bE.click(); clearInterval(intG); }, 500); }
                t++; if (t > 120) clearInterval(intG);
            }, 800);
        }
        if (podeExecutarLogin()) {
            if (window.location.href.includes("login")) setTimeout(() => { const b = document.querySelector('a[href*="authorization/govbr"]'); if(b) b.click(); }, 1200);

            // Lógica de 3 Passos (BFA -> POA -> Acessar)
            if (window.location.href.includes("perfilAcesso.xhtml")) {
                let step = 1;
                const intSteps = setInterval(() => {
                    if (!podeExecutarLogin()) { clearInterval(intSteps); return; }
                    if (step === 1) {
                        const linkBFA = document.querySelector('a[href="#7"]');
                        if (linkBFA) { linkBFA.click(); step = 2; }
                    } else if (step === 2) {
                        const linkPOA = document.querySelector('a[href="#7431490"]');
                        if (linkPOA) { linkPOA.click(); step = 3; }
                    } else if (step === 3) {
                        const btnAcessar = document.querySelector('input[value="Acessar Sistema"]');
                        if (btnAcessar) { encerrarCicloLogin(); btnAcessar.click(); clearInterval(intSteps); }
                    }
                }, 1500);
            }
        }
    }

    // =================================================================
    // 🛠️ UTILITÁRIOS
    // =================================================================
    function extractId(link) {
        if (!link) return "";
        const match = link.match(/[-\w]{25,}/);
        return match ? match[0] : link.trim();
    }

    // =================================================================
    // 🖥️ UI HUB CENTRAL (NOVO LAYOUT DE CARTÕES 5 COLUNAS)
    // =================================================================

    if (window.location.protocol === "file:") {
        const style = document.createElement('style');
        style.textContent = `
            body { background-color: #060b18 !important; color: #e2e8f0; font-family: system-ui,-apple-system,sans-serif; margin: 0; }
            .loading-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: #060b18; z-index: 9999; display: flex; justify-content: center; align-items: center; flex-direction: column; gap: 16px; }
            .glass-card { background: rgba(13,20,45,0.65); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); border: 1px solid rgba(255,255,255,0.06); border-radius: 20px; padding: 24px; transition: all 0.2s ease; margin-bottom: 20px; }
            .glass-input { background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; color: #e2e8f0; padding: 12px 16px; width: 100%; margin-top: 5px; transition: border-color 0.2s, box-shadow 0.2s; box-sizing: border-box; }
            .glass-input:focus { outline: none; border-color: rgba(99,102,241,0.6); box-shadow: 0 0 0 3px rgba(99,102,241,0.1); }
            .btn-glass { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); padding: 10px 20px; border-radius: 12px; color: #94a3b8; cursor: pointer; transition: all 0.2s; font-weight: 700; }
            .btn-glass:hover { border-color: rgba(99,102,241,0.5); background: rgba(99,102,241,0.1); color: #a5b4fc; }
            .nav-item { display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-radius: 12px; color: #475569; cursor: pointer; transition: all 0.18s; font-size: 13px; font-weight: 600; position: relative; }
            .nav-item:hover { background: rgba(255,255,255,0.04); color: #94a3b8; }
            .nav-item.btn-glass { background: rgba(99,102,241,0.1) !important; border: none !important; border-left: 3px solid #818cf8 !important; padding-left: 13px !important; color: #a5b4fc !important; }
            .nav-item.btn-glass:hover { background: rgba(99,102,241,0.14) !important; }
            .progress-container { width: 100%; background: rgba(0,0,0,0.4); border-radius: 99px; height: 8px; overflow: hidden; margin-top: 10px; }
            .progress-bar { height: 100%; background: linear-gradient(90deg, #6366f1, #10b981); width: 0%; transition: width 0.6s cubic-bezier(0.4,0,0.2,1); border-radius: 99px; }
            .progress-pulse { animation: pulse 2s infinite; }
            @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: .5; } }
            @keyframes slideIn { from { transform: translateY(10px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
            @keyframes spin { to { transform: rotate(360deg); } }
            .animate-fade { animation: slideIn 0.3s ease forwards; }
            .nav-section-label { font-size: 9px; font-weight: 800; color: #1e293b; letter-spacing: 0.15em; text-transform: uppercase; padding: 0 6px; margin: 8px 0 4px; }
            .btn-action-card { transition: border-color 0.2s, background 0.2s; }
            .btn-action-card:hover { border-color: rgba(99,102,241,0.3) !important; background: rgba(99,102,241,0.06) !important; }
            .btn-sync-main { transition: all 0.25s; }
            .btn-sync-main:hover { border-color: rgba(16,185,129,0.45) !important; background: linear-gradient(135deg, rgba(16,185,129,0.16), rgba(16,185,129,0.08)) !important; }
            .metric-icon { width: 36px; height: 36px; border-radius: 10px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        `;
        document.head.appendChild(style);
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => iniciarPainel(document.body));
        else iniciarPainel(document.body);
    }

    function iniciarPainel(container) {
        const overlay = document.createElement('div');
        overlay.id = 'hub-loading-overlay';
        overlay.className = 'loading-overlay';
        overlay.innerHTML = `<div style="width:80px;height:80px;border-radius:22px;background:rgba(99,102,241,0.1);display:flex;align-items:center;justify-content:center;border:1px solid rgba(99,102,241,0.25);"><img src="${URL_LOGO}" width="52" height="52" style="border-radius:14px;animation:spin 3s linear infinite;"></div><div style="font-weight:800;color:#818cf8;font-size:13px;letter-spacing:0.12em;text-transform:uppercase;">Carregando Hub v9.0...</div><div style="font-size:10px;color:#1e293b;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;">Aguarde um momento</div>`;
        container.innerHTML = '';
        container.appendChild(overlay);

        const removeOverlay = () => { const el = document.getElementById('hub-loading-overlay'); if (el) el.remove(); };
        setTimeout(removeOverlay, 1500);

        const linkIcons = document.createElement('link');
        linkIcons.rel = "stylesheet"; linkIcons.href = "https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@24,400,1,0";
        document.head.appendChild(linkIcons);

        const scriptTailwind = document.createElement('script');
        scriptTailwind.src = "https://cdn.tailwindcss.com";
        scriptTailwind.onload = () => {
            if (window.tailwind) window.tailwind.config = { theme: { extend: { colors: { dark: { 700: '#334155', 800: '#1e293b', 900: '#0f172a' } } } } };
            setTimeout(removeOverlay, 200);
        };
        document.head.appendChild(scriptTailwind);

        const mainHTML = `
            <div style="display:flex;height:100vh;overflow:hidden;font-family:system-ui,-apple-system,sans-serif;background:#060b18;color:#e2e8f0;">
                <div class="fixed top-5 right-5 z-50 flex flex-col gap-2" id="toast-container"></div>
                <aside style="width:240px;min-width:240px;display:flex;flex-direction:column;z-index:20;background:linear-gradient(180deg,#09112a 0%,#060b18 100%);border-right:1px solid rgba(99,102,241,0.12);">
                    <div style="padding:22px 18px 18px;border-bottom:1px solid rgba(255,255,255,0.04);">
                        <div style="display:flex;align-items:center;gap:12px;">
                            <div style="position:relative;flex-shrink:0;">
                                <img alt="Logo" style="width:44px;height:44px;border-radius:14px;border:1.5px solid rgba(99,102,241,0.4);" src="${URL_LOGO}">
                                <div style="position:absolute;bottom:-2px;right:-2px;width:11px;height:11px;background:#10b981;border-radius:50%;border:2px solid #09112a;"></div>
                            </div>
                            <div>
                                <div style="font-size:16px;font-weight:900;color:white;letter-spacing:-0.5px;font-style:italic;line-height:1.2;">ACOMPANHA<span style="color:#818cf8;">+</span></div>
                                <div style="font-size:9px;font-weight:700;color:#1e293b;letter-spacing:0.12em;text-transform:uppercase;margin-top:2px;">Hub Painel v9.0</div>
                            </div>
                        </div>
                    </div>
                    <nav style="flex:1;padding:14px 10px;overflow-y:auto;">
                        <div class="nav-section-label">Principal</div>
                        <div id="nav-dashboard" class="nav-item"><span class="material-symbols-rounded" style="font-size:18px;">dashboard</span> Dashboard</div>
                        <div id="nav-planilhas" class="nav-item"><span class="material-symbols-rounded" style="font-size:18px;">table_chart</span> Gestão Planilhas</div>
                        <div id="nav-condicionalidades" class="nav-item"><span class="material-symbols-rounded" style="font-size:18px;">rule_settings</span> Condicionalidades</div>
                        <div id="nav-config" class="nav-item"><span class="material-symbols-rounded" style="font-size:18px;">settings</span> Configurações</div>
                        <div id="nav-construtor" class="nav-item"><span class="material-symbols-rounded" style="font-size:18px;">build</span> Construtor</div>
                        <div id="nav-pipeline" class="nav-item"><span class="material-symbols-rounded" style="font-size:18px;">map</span> Gerador de Mapas</div>
                        <div style="height:1px;background:rgba(255,255,255,0.04);margin:14px 4px;"></div>
                        <div class="nav-section-label">Sistemas Externos</div>
                        <div id="nav-egestor" class="nav-item"><span class="material-symbols-rounded" style="font-size:18px;">public</span> e-Gestor Login</div>
                        <div id="nav-esus" class="nav-item"><span class="material-symbols-rounded" style="font-size:18px;">medical_services</span> e-SUS Login</div>
                    </nav>
                    <div style="padding:14px 18px;border-top:1px solid rgba(255,255,255,0.04);">
                        <div style="display:flex;align-items:center;gap:8px;">
                            <div style="width:7px;height:7px;background:#10b981;border-radius:50%;flex-shrink:0;"></div>
                            <span style="font-size:10px;font-weight:700;color:#1e293b;">Sistema Operacional</span>
                        </div>
                    </div>
                </aside>
                <main style="flex:1;display:flex;flex-direction:column;overflow:hidden;background:radial-gradient(ellipse at 80% 0%,rgba(99,102,241,0.07) 0%,transparent 55%),radial-gradient(ellipse at 0% 90%,rgba(16,185,129,0.05) 0%,transparent 45%),#060b18;">
                    <div style="flex:1;overflow-y:auto;padding:40px 48px;" id="content-area"></div>
                </main>
            </div>
        `;
        const wrapper = document.createElement('div');
        wrapper.innerHTML = mainHTML;
        container.appendChild(wrapper);

        const navs = {
            'dashboard': renderDashboard,
            'planilhas': renderPlanilhas,
            'pipeline':  renderPipeline,
            'config': renderConfig,
            'condicionalidades': renderCondicionalidades,
            'construtor': renderConstrutor,
            'egestor': (c)=>renderLogin(c,'egestor'),
            'esus': (c)=>renderLogin(c,'esus')
        };

        const loadRoute = (r) => {
            document.querySelectorAll('.nav-item').forEach(el => {
                el.classList.remove('btn-glass', 'text-blue-400');
                el.classList.add('text-slate-400');
            });
            const btn = document.getElementById(`nav-${r}`);
            if(btn) { btn.classList.remove('text-slate-400'); btn.classList.add('btn-glass', 'text-blue-400'); }
            const content = document.getElementById('content-area');
            content.innerHTML = '<div class="flex items-center justify-center h-full"><span class="material-symbols-rounded animate-spin text-5xl text-blue-500">donut_large</span></div>';
            setTimeout(() => { if(navs[r]) navs[r](content); }, 150);
        };

        document.getElementById('nav-dashboard').onclick = () => loadRoute('dashboard');
        document.getElementById('nav-planilhas').onclick = () => loadRoute('planilhas');
        document.getElementById('nav-pipeline').onclick  = () => loadRoute('pipeline');
        document.getElementById('nav-config').onclick = () => loadRoute('config');
        document.getElementById('nav-condicionalidades').onclick = () => loadRoute('condicionalidades');
        document.getElementById('nav-construtor').onclick = () => loadRoute('construtor');
        document.getElementById('nav-egestor').onclick = () => loadRoute('egestor');
        document.getElementById('nav-esus').onclick = () => loadRoute('esus');

        loadRoute('dashboard');

        window.showToast = (msg, type='success') => {
            const container = document.getElementById('toast-container');
            const toast = document.createElement('div');
            toast.className = `text-white px-6 py-3 rounded-2xl shadow-2xl font-bold text-sm animate-fade`;
            const styles = {
                success: 'background:linear-gradient(135deg,#059669,#34d399);box-shadow:0 8px 32px rgba(5,150,105,0.4);',
                error:   'background:linear-gradient(135deg,#dc2626,#f87171);box-shadow:0 8px 32px rgba(220,38,38,0.4);',
                warning: 'background:linear-gradient(135deg,#d97706,#fbbf24);box-shadow:0 8px 32px rgba(217,119,6,0.4);',
                info:    'background:linear-gradient(135deg,#6366f1,#818cf8);box-shadow:0 8px 32px rgba(99,102,241,0.4);',
            };
            toast.style.cssText = styles[type] || styles.info;
            toast.innerText = msg;
            container.appendChild(toast);
            setTimeout(() => toast.remove(), TOAST_DURATION_MS);
        };
    }

    function renderDashboard(container) {
        container.innerHTML = `
            <div class="animate-fade" style="max-width:1200px;margin:0 auto;">
                <div style="display:flex;justify-content:space-between;align-items:flex-end;border-bottom:1px solid rgba(255,255,255,0.05);padding-bottom:20px;margin-bottom:32px;">
                    <div>
                        <h2 style="font-size:26px;font-weight:900;color:white;letter-spacing:-0.5px;font-style:italic;text-transform:uppercase;margin:0;">Status Geral</h2>
                        <div id="dash-vig" style="font-size:12px;font-weight:700;color:#6366f1;margin-top:5px;letter-spacing:0.05em;">--</div>
                    </div>
                    <button id="btn-refresh" class="btn-glass" style="display:flex;align-items:center;gap:8px;padding:10px 18px;font-size:11px;font-weight:800;letter-spacing:0.1em;text-transform:uppercase;border-radius:12px;"><span class="material-symbols-rounded" style="font-size:16px;">refresh</span> ATUALIZAR</button>
                </div>

                <div id="dash-stats-warn" style="display:none;margin-bottom:16px;padding:14px 18px;border-radius:12px;border:1px solid rgba(245,158,11,0.35);background:rgba(245,158,11,0.08);color:#fbbf24;font-size:11px;font-weight:700;letter-spacing:0.04em;">
                    <span class="material-symbols-rounded" style="font-size:15px;vertical-align:middle;margin-right:6px;">warning</span>
                    <span id="dash-stats-warn-msg"></span>
                </div>

                <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:16px;margin-bottom:20px;">
                    <div class="glass-card" style="padding:20px;margin:0;border-top:2px solid rgba(148,163,184,0.2);">
                        <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">
                            <div class="metric-icon" style="background:rgba(148,163,184,0.1);"><span class="material-symbols-rounded" style="font-size:18px;color:#94a3b8;">groups</span></div>
                            <p style="font-size:9px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:0.1em;margin:0;">Total Buscado</p>
                        </div>
                        <div style="font-size:32px;font-weight:900;color:white;" id="v0">--</div>
                    </div>
                    <div class="glass-card" style="padding:20px;margin:0;border-top:2px solid rgba(16,185,129,0.4);background:rgba(16,185,129,0.04);">
                        <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">
                            <div class="metric-icon" style="background:rgba(16,185,129,0.12);"><span class="material-symbols-rounded" style="font-size:18px;color:#10b981;">person_add</span></div>
                            <p style="font-size:9px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:0.1em;margin:0;">Cadastros Novos</p>
                        </div>
                        <div style="font-size:32px;font-weight:900;color:#10b981;" id="v1">--</div>
                    </div>
                    <div class="glass-card" style="padding:20px;margin:0;border-top:2px solid rgba(5,150,105,0.4);background:rgba(5,150,105,0.04);">
                        <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">
                            <div class="metric-icon" style="background:rgba(5,150,105,0.12);"><span class="material-symbols-rounded" style="font-size:18px;color:#059669;">check_circle</span></div>
                            <p style="font-size:9px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:0.1em;margin:0;">Já Cadastrados</p>
                        </div>
                        <div style="font-size:32px;font-weight:900;color:#059669;" id="v_eg_atu">--</div>
                    </div>
                    <div class="glass-card" style="padding:20px;margin:0;border-top:2px solid rgba(99,102,241,0.4);background:rgba(99,102,241,0.04);">
                        <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">
                            <div class="metric-icon" style="background:rgba(99,102,241,0.12);"><span class="material-symbols-rounded" style="font-size:18px;color:#818cf8;">medical_services</span></div>
                            <p style="font-size:9px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:0.1em;margin:0;">e-SUS</p>
                        </div>
                        <div style="font-size:32px;font-weight:900;color:#818cf8;" id="v2">--</div>
                    </div>
                    <div class="glass-card" style="padding:20px;margin:0;border-top:2px solid rgba(245,158,11,0.4);background:rgba(245,158,11,0.04);">
                        <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
                            <div class="metric-icon" style="background:rgba(245,158,11,0.12);"><span class="material-symbols-rounded" style="font-size:18px;color:#f59e0b;">trending_up</span></div>
                            <p style="font-size:9px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:0.1em;margin:0;">Atingimento Banco</p>
                        </div>
                        <div style="font-size:28px;font-weight:900;color:#f59e0b;" id="dash-pct">0%</div>
                        <div class="progress-container" style="margin-top:8px;height:6px;"><div id="dash-bar" class="progress-bar"></div></div>
                    </div>
                </div>

                <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px;">
                    <div class="glass-card" style="display:flex;align-items:center;justify-content:space-between;padding:24px;margin:0;border-left:3px solid #f59e0b;background:rgba(245,158,11,0.04);">
                        <div>
                            <div style="font-size:9px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:0.12em;margin-bottom:8px;">Pendente e-Gestor</div>
                            <div style="font-size:38px;font-weight:900;color:#fbbf24;line-height:1;" id="v-fila-egestor">--</div>
                            <div style="font-size:10px;color:#475569;margin-top:5px;font-weight:600;">cadastros na fila</div>
                        </div>
                        <div style="width:56px;height:56px;background:rgba(245,158,11,0.1);border-radius:16px;display:flex;align-items:center;justify-content:center;border:1px solid rgba(245,158,11,0.15);">
                            <span class="material-symbols-rounded" style="font-size:30px;color:#f59e0b;opacity:0.9;">pending_actions</span>
                        </div>
                    </div>
                    <div class="glass-card" style="display:flex;align-items:center;justify-content:space-between;padding:24px;margin:0;border-left:3px solid #ef4444;background:rgba(239,68,68,0.04);">
                        <div>
                            <div style="font-size:9px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:0.12em;margin-bottom:8px;">Pendente e-SUS</div>
                            <div style="font-size:38px;font-weight:900;color:#f87171;line-height:1;" id="v-fila-esus">--</div>
                            <div style="font-size:10px;color:#475569;margin-top:5px;font-weight:600;">buscas na fila</div>
                        </div>
                        <div style="width:56px;height:56px;background:rgba(239,68,68,0.1);border-radius:16px;display:flex;align-items:center;justify-content:center;border:1px solid rgba(239,68,68,0.15);">
                            <span class="material-symbols-rounded" style="font-size:30px;color:#ef4444;opacity:0.9;">search_check</span>
                        </div>
                    </div>
                </div>

                <div class="glass-card" style="padding:24px;margin:0;height:280px;">
                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:16px;">
                        <span class="material-symbols-rounded" style="font-size:16px;color:#6366f1;">bar_chart</span>
                        <h3 style="font-size:10px;font-weight:800;color:#475569;text-transform:uppercase;letter-spacing:0.12em;margin:0;">Produtividade Semanal</h3>
                    </div>
                    <canvas id="dashboardChart" style="height:220px;"></canvas>
                </div>
            </div>
        `;

        function fetchStats(force = false) {
            const refresh = document.getElementById('btn-refresh');
            if(refresh) refresh.innerText = 'CARREGANDO...';
            GM_xmlhttpRequest({
                method: "POST", url: URL_APPS_SCRIPT, headers: { "Content-Type": "application/x-www-form-urlencoded" },
                data: `action=obter_dashboard&api_target=panel&token=${TOKEN_ACESSO}&force=${force}`,
                onload: (response) => {
                    try {
                        const res = JSON.parse(response.responseText);
                        if(res.ok) {
                            const totalBuscado = parseInt(res.dados.total_buscado) || 0;
                            const cadastrosRealizados = parseInt(res.dados.cadastros_realizados) || 0;
                            const esusAtualizados = parseInt(res.dados.atualizacoes) || 0;

                            const calculoJaCadastrados = Math.max(0, totalBuscado - cadastrosRealizados - esusAtualizados);

                            const elV0 = document.getElementById('v0');
                            const elV1 = document.getElementById('v1');
                            const elVEgAtu = document.getElementById('v_eg_atu');
                            const elV2 = document.getElementById('v2');
                            const elDashVig = document.getElementById('dash-vig');
                            const elFilaEgestor = document.getElementById('v-fila-egestor');
                            const elFilaEsus = document.getElementById('v-fila-esus');
                            const elDashPct = document.getElementById('dash-pct');
                            const elDashBar = document.getElementById('dash-bar');
                            const elWarn = document.getElementById('dash-stats-warn');
                            const elWarnMsg = document.getElementById('dash-stats-warn-msg');

                            if (elV0) elV0.innerText = totalBuscado;
                            if (elV1) elV1.innerText = cadastrosRealizados;
                            if (elVEgAtu) elVEgAtu.innerText = calculoJaCadastrados;
                            if (elV2) elV2.innerText = esusAtualizados;
                            const vigExibir = normalizeVigencia(res.dados.config?.vigencia || "");
                            if (elDashVig) elDashVig.innerText = vigExibir || VIG_NAO_CONFIGURADA;

                            if (elFilaEgestor) elFilaEgestor.innerText = res.dados.fila_egestor || 0;
                            if (elFilaEsus) elFilaEsus.innerText = res.dados.fila_esus || 0;

                            const total = parseFloat(res.dados.total_db) || 0;
                            const concluido = parseFloat(res.dados.concluidos_db) || 0;
                            const pct = total > 0 ? ((concluido / total) * 100).toFixed(1) : "0.0";
                            if (elDashPct) elDashPct.innerText = pct + '%';
                            if (elDashBar) elDashBar.style.width = pct + '%';

                            // Avisos visíveis ao invés de apenas tooltip
                            if (elWarn && elWarnMsg) {
                                const msgs = [];
                                if (!res.dados.stats_disponivel && totalBuscado === 0) {
                                    msgs.push("Contadores dos robôs zerados — podem ter sido resetados. Os números voltarão a subir conforme os robôs processarem registros.");
                                }
                                if (!vigExibir) {
                                    msgs.push("Vigência ativa não configurada. Acesse Configurações para definir a vigência e os links das pastas.");
                                }
                                if (res.dados.cache_error) {
                                    msgs.push("Aviso: falha ao atualizar cache do banco de dados (" + res.dados.cache_error + ").");
                                }
                                if (msgs.length > 0) {
                                    elWarnMsg.innerText = msgs.join(" • ");
                                    elWarn.style.display = 'block';
                                } else {
                                    elWarn.style.display = 'none';
                                }
                            }

                            if (res.dados.historico && typeof Chart !== 'undefined') {
                                const ctx = document.getElementById('dashboardChart').getContext('2d');
                                if (chartInstance) chartInstance.destroy();
                                const labels = Object.keys(res.dados.historico).sort();

                                const dataEgestorNovos = labels.map(l => res.dados.historico[l].egestor || 0);
                                const dataEgestorAtu = labels.map(l => res.dados.historico[l].egestor_atualizados || 0);
                                const dataEsus = labels.map(l => res.dados.historico[l].esus || 0);

                                chartInstance = new Chart(ctx, {
                                    type: 'bar',
                                    data: {
                                        labels,
                                        datasets: [
                                            { label: 'e-Gestor (Novos)', data: dataEgestorNovos, backgroundColor: '#10b981', stack: 'Stack 0' },
                                            { label: 'e-Gestor (Já Cadastrados)', data: dataEgestorAtu, backgroundColor: '#047857', stack: 'Stack 0', borderRadius: 4 },
                                            { label: 'e-SUS', data: dataEsus, backgroundColor: '#3b82f6', stack: 'Stack 1', borderRadius: 4 }
                                        ]
                                    },
                                    options: {
                                        responsive: true,
                                        maintainAspectRatio: false,
                                        scales: {
                                            x: { stacked: true },
                                            y: { stacked: true, beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' } }
                                        }
                                    }
                                });
                            }
                        } else {
                            const elDashVig = document.getElementById('dash-vig');
                            if (elDashVig) elDashVig.innerText = "Erro ao carregar dados: " + (res.err || "resposta inválida");
                            const elWarn = document.getElementById('dash-stats-warn');
                            const elWarnMsg = document.getElementById('dash-stats-warn-msg');
                            if (elWarn && elWarnMsg) {
                                elWarnMsg.innerText = "Erro na API: " + (res.err || "resposta inválida do servidor");
                                elWarn.style.display = 'block';
                            }
                            console.error("obter_dashboard error:", res);
                        }
                    } catch(e) {
                        const elDashVig = document.getElementById('dash-vig');
                        if (elDashVig) elDashVig.innerText = "Erro ao processar resposta do servidor.";
                        console.error("Erro ao processar resposta do dashboard:", e);
                    }
                    if(refresh) refresh.innerText = 'ATUALIZAR DADOS';
                },
                onerror: () => {
                    const elDashVig = document.getElementById('dash-vig');
                    if (elDashVig) elDashVig.innerText = "Falha de rede — verifique a conexão.";
                    DASHBOARD_METRIC_IDS.forEach(id => {
                        const el = document.getElementById(id);
                        if (el) el.innerText = '—';
                    });
                    const elWarn = document.getElementById('dash-stats-warn');
                    const elWarnMsg = document.getElementById('dash-stats-warn-msg');
                    if (elWarn && elWarnMsg) {
                        elWarnMsg.innerText = "Falha de rede ao carregar o dashboard. Verifique sua conexão e tente novamente.";
                        elWarn.style.display = 'block';
                    }
                    if(refresh) refresh.innerText = 'ATUALIZAR DADOS';
                    console.error("Falha de rede ao chamar obter_dashboard.");
                }
            });
        }
        document.getElementById('btn-refresh').onclick = () => fetchStats(true);
        fetchStats(false);
    }

    function renderConfig(container) {
        const vigencias = getVigenciasList();
        container.innerHTML = `
            <div class="animate-fade" style="max-width:680px;margin:0 auto;">
                <div style="margin-bottom:32px;">
                    <h1 style="font-size:26px;font-weight:900;color:white;letter-spacing:-0.5px;font-style:italic;text-transform:uppercase;margin:0;">Configurações</h1>
                    <p style="font-size:12px;color:#475569;margin-top:6px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;">Vigência Ativa e Links das Pastas</p>
                </div>
                <div class="glass-card" style="padding:28px;">
                    <div id="cfg-status-bar" style="margin-bottom:16px;padding:10px 14px;border-radius:10px;border:1px solid rgba(99,102,241,0.2);background:rgba(99,102,241,0.06);color:#94a3b8;font-size:10px;font-weight:700;letter-spacing:0.06em;display:flex;align-items:center;gap:8px;">
                        <span class="material-symbols-rounded" style="font-size:14px;animation:spin 1.5s linear infinite;" id="cfg-status-icon">sync</span>
                        <span id="cfg-status-text">Carregando configuração do servidor...</span>
                    </div>
                    <div style="margin-bottom:24px;">
                        <label style="font-size:9px;font-weight:800;color:#475569;text-transform:uppercase;letter-spacing:0.12em;display:block;margin-bottom:6px;">Vigência Ativa (Global)</label>
                        <select id="c-nom" class="glass-input" style="cursor:pointer;" disabled>
                            <option value="" disabled selected>Selecionar vigência...</option>
                            ${vigencias.map(v => `<option value="${v}" style="background:#0d1835">${v}</option>`).join('')}
                        </select>
                    </div>
                    <div style="height:1px;background:rgba(255,255,255,0.04);margin-bottom:24px;"></div>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:28px;">
                        <div>
                            <label style="font-size:9px;font-weight:800;color:#475569;text-transform:uppercase;letter-spacing:0.12em;display:flex;align-items:center;gap:6px;margin-bottom:6px;"><span style="width:8px;height:8px;background:#818cf8;border-radius:2px;display:inline-block;flex-shrink:0;"></span> Pasta Norte</label>
                            <input id="c-nor" class="glass-input" placeholder="Cole o link aqui" disabled>
                        </div>
                        <div>
                            <label style="font-size:9px;font-weight:800;color:#475569;text-transform:uppercase;letter-spacing:0.12em;display:flex;align-items:center;gap:6px;margin-bottom:6px;"><span style="width:8px;height:8px;background:#10b981;border-radius:2px;display:inline-block;flex-shrink:0;"></span> Pasta Sul</label>
                            <input id="c-sul" class="glass-input" placeholder="Cole o link aqui" disabled>
                        </div>
                        <div>
                            <label style="font-size:9px;font-weight:800;color:#475569;text-transform:uppercase;letter-spacing:0.12em;display:flex;align-items:center;gap:6px;margin-bottom:6px;"><span style="width:8px;height:8px;background:#f59e0b;border-radius:2px;display:inline-block;flex-shrink:0;"></span> Pasta Leste</label>
                            <input id="c-les" class="glass-input" placeholder="Cole o link aqui" disabled>
                        </div>
                        <div>
                            <label style="font-size:9px;font-weight:800;color:#475569;text-transform:uppercase;letter-spacing:0.12em;display:flex;align-items:center;gap:6px;margin-bottom:6px;"><span style="width:8px;height:8px;background:#ef4444;border-radius:2px;display:inline-block;flex-shrink:0;"></span> Pasta Oeste</label>
                            <input id="c-oes" class="glass-input" placeholder="Cole o link aqui" disabled>
                        </div>
                    </div>
                    <button id="btn-save-cfg" style="width:100%;background:linear-gradient(135deg,#6366f1,#818cf8);border:none;color:white;font-weight:800;padding:16px 24px;border-radius:14px;cursor:pointer;font-size:11px;letter-spacing:0.15em;text-transform:uppercase;transition:all 0.2s;box-shadow:0 4px 24px rgba(99,102,241,0.3);">SALVAR PARA TODA A EQUIPE</button>
                </div>

                <!-- ── Gerenciar Vigências ── -->
                <div class="glass-card" style="padding:28px;margin-top:16px;">
                    <div style="font-size:10px;font-weight:900;color:#475569;text-transform:uppercase;letter-spacing:0.12em;margin-bottom:14px;">Gerenciar Vigências</div>
                    <div id="cfg-vigencias-chips" style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px;min-height:32px;"></div>
                    <div style="display:flex;gap:8px;align-items:center;">
                        <input id="cfg-nova-vigencia" class="glass-input" placeholder="Ex.: 2029/1 (formato AAAA/1 ou AAAA/2)" style="flex:1;">
                        <button id="cfg-btn-add-vigencia" style="background:linear-gradient(135deg,#10b981,#34d399);border:none;color:white;font-weight:800;padding:12px 16px;border-radius:10px;cursor:pointer;font-size:10px;letter-spacing:0.12em;text-transform:uppercase;white-space:nowrap;">+ ADICIONAR</button>
                    </div>
                    <div id="cfg-vigencia-feedback" style="font-size:10px;margin-top:8px;min-height:16px;"></div>
                </div>
            </div>
        `;

        const dropdown = document.getElementById('c-nom');
        const inputs = [document.getElementById('c-nor'), document.getElementById('c-sul'), document.getElementById('c-les'), document.getElementById('c-oes')];
        const statusBar = document.getElementById('cfg-status-bar');
        const statusIcon = document.getElementById('cfg-status-icon');
        const statusText = document.getElementById('cfg-status-text');

        function setStatus(type, msg) {
            const map = {
                loading: { icon: 'sync', color: '#94a3b8', bg: 'rgba(99,102,241,0.06)', bd: 'rgba(99,102,241,0.2)', spin: true },
                ok:      { icon: 'check_circle', color: '#34d399', bg: 'rgba(16,185,129,0.06)', bd: 'rgba(16,185,129,0.25)', spin: false },
                warn:    { icon: 'info', color: '#fbbf24', bg: 'rgba(245,158,11,0.08)', bd: 'rgba(245,158,11,0.3)', spin: false },
                error:   { icon: 'error', color: '#f87171', bg: 'rgba(239,68,68,0.08)', bd: 'rgba(239,68,68,0.3)', spin: false },
            };
            const s = map[type] || map.loading;
            statusBar.style.background = s.bg;
            statusBar.style.border = `1px solid ${s.bd}`;
            statusBar.style.color = s.color;
            statusIcon.textContent = s.icon;
            statusIcon.style.animation = s.spin ? 'spin 1.5s linear infinite' : 'none';
            statusText.textContent = msg;
        }

        function enableForm() {
            dropdown.disabled = false;
            inputs.forEach(i => i.disabled = false);
        }

        dropdown.addEventListener('change', () => {
            const vigAtual = normalizeVigencia(CONFIG_ATUAL_SERVIDOR?.vigencia || "");
            if (CONFIG_ATUAL_SERVIDOR && normalizeVigencia(dropdown.value) !== vigAtual) {
                inputs.forEach(i => i.value = "");
                window.showToast("Introduza novos links para esta vigência", "info");
            } else if (CONFIG_ATUAL_SERVIDOR && normalizeVigencia(dropdown.value) === vigAtual) {
                inputs[0].value = CONFIG_ATUAL_SERVIDOR.NORTE ? `https://drive.google.com/drive/folders/${CONFIG_ATUAL_SERVIDOR.NORTE}` : "";
                inputs[1].value = CONFIG_ATUAL_SERVIDOR.SUL ? `https://drive.google.com/drive/folders/${CONFIG_ATUAL_SERVIDOR.SUL}` : "";
                inputs[2].value = CONFIG_ATUAL_SERVIDOR.LESTE ? `https://drive.google.com/drive/folders/${CONFIG_ATUAL_SERVIDOR.LESTE}` : "";
                inputs[3].value = CONFIG_ATUAL_SERVIDOR.OESTE ? `https://drive.google.com/drive/folders/${CONFIG_ATUAL_SERVIDOR.OESTE}` : "";
            }
        });

        GM_xmlhttpRequest({
            method: "POST", url: URL_APPS_SCRIPT, headers: { "Content-Type": "application/x-www-form-urlencoded" },
            data: `action=get_config&api_target=panel&token=${TOKEN_ACESSO}`,
            onload: (res) => {
                try {
                    const j = JSON.parse(res.responseText);
                    if(j.ok && j.data) {
                        const vigNorm = normalizeVigencia(j.data.vigencia || "");
                        // Garante que a vigência normalizada existe no dropdown
                        if (vigNorm && !Array.from(dropdown.options).some(o => o.value === vigNorm)) {
                            const opt = document.createElement('option');
                            opt.value = vigNorm;
                            opt.textContent = vigNorm;
                            opt.style.background = '#0d1835';
                            dropdown.appendChild(opt);
                        }
                        CONFIG_ATUAL_SERVIDOR = Object.assign({}, j.data, { vigencia: vigNorm });
                        dropdown.value = vigNorm;
                        inputs[0].value = j.data.NORTE ? `https://drive.google.com/drive/folders/${j.data.NORTE}` : "";
                        inputs[1].value = j.data.SUL ? `https://drive.google.com/drive/folders/${j.data.SUL}` : "";
                        inputs[2].value = j.data.LESTE ? `https://drive.google.com/drive/folders/${j.data.LESTE}` : "";
                        inputs[3].value = j.data.OESTE ? `https://drive.google.com/drive/folders/${j.data.OESTE}` : "";
                        setStatus('ok', `Carregado da API • Vigência ativa: ${vigNorm || VIG_NAO_CONFIGURADA}`);
                    } else if (j.ok && !j.data) {
                        setStatus('warn', 'Nenhuma configuração salva no servidor. Selecione uma vigência e adicione os links das pastas.');
                    } else {
                        setStatus('error', 'Erro ao ler configuração: ' + (j.err || 'resposta inválida do servidor'));
                        window.showToast('Erro ao carregar configuração do servidor: ' + (j.err || 'resposta inválida'), 'error');
                    }
                } catch(e) {
                    setStatus('error', 'Erro ao processar resposta do servidor.');
                    window.showToast('Erro ao processar resposta do servidor ao carregar configuração.', 'error');
                    console.error("Erro ao carregar configuração:", e);
                }
                enableForm();
            },
            onerror: () => {
                setStatus('error', 'Falha de rede — não foi possível carregar a configuração do servidor.');
                window.showToast('Falha de rede ao carregar configuração. Verifique sua conexão.', 'error');
                enableForm();
                console.error("Falha de rede ao carregar configuração.");
            }
        });

        document.getElementById('btn-save-cfg').onclick = function() {
            const vigSelecionada = normalizeVigencia(dropdown.value);
            if (!vigSelecionada) {
                window.showToast("Selecione uma vigência antes de salvar!", "error");
                return;
            }
            this.innerText = "SALVANDO...";
            this.disabled = true;
            const btn = this;
            const idN = extractId(inputs[0].value), idS = extractId(inputs[1].value), idL = extractId(inputs[2].value), idO = extractId(inputs[3].value);
            const d = `action=save_config&api_target=panel&token=${TOKEN_ACESSO}&vigencia_nome=${encodeURIComponent(vigSelecionada)}&folder_norte=${encodeURIComponent(idN)}&folder_sul=${encodeURIComponent(idS)}&folder_leste=${encodeURIComponent(idL)}&folder_oeste=${encodeURIComponent(idO)}`;
            GM_xmlhttpRequest({
                method: "POST", url: URL_APPS_SCRIPT, headers: { "Content-Type": "application/x-www-form-urlencoded" }, data: d,
                onload: (resp) => {
                    try {
                        const r = JSON.parse(resp.responseText);
                        if (r.ok) {
                            CONFIG_ATUAL_SERVIDOR = { vigencia: vigSelecionada, NORTE: idN, SUL: idS, LESTE: idL, OESTE: idO };
                            // Verificar se o dado foi realmente persistido
                            btn.innerText = "VERIFICANDO...";
                            setStatus('loading', 'Verificando persistência no servidor...');
                            GM_xmlhttpRequest({
                                method: "POST", url: URL_APPS_SCRIPT, headers: { "Content-Type": "application/x-www-form-urlencoded" },
                                data: `action=get_config&api_target=panel&token=${TOKEN_ACESSO}`,
                                onload: (vRes) => {
                                    try {
                                        const vj = JSON.parse(vRes.responseText);
                                        const savedVig = normalizeVigencia(vj.data?.vigencia || "");
                                        if (vj.ok && vj.data && savedVig === vigSelecionada) {
                                            setStatus('ok', `Salvo e verificado ✓ • Vigência ativa: ${savedVig}`);
                                            window.showToast(r.msg || "Configuração salva para toda a equipe!", "success");
                                        } else {
                                            setStatus('error', 'Salvo, mas a verificação retornou dados diferentes. Tente salvar novamente.');
                                            window.showToast('Atenção: o servidor confirmou o salvamento, mas a verificação retornou dados diferentes.', 'warning');
                                        }
                                    } catch(e) {
                                        setStatus('ok', `Salvo ✓ • Vigência: ${vigSelecionada} (verificação falhou, mas save confirmado)`);
                                        window.showToast(r.msg || "Configuração salva para toda a equipe!", "success");
                                    }
                                    btn.innerText = BTN_SAVE_CFG_LABEL;
                                    btn.disabled = false;
                                },
                                onerror: () => {
                                    setStatus('ok', `Salvo ✓ • Vigência: ${vigSelecionada} (verificação offline)`);
                                    window.showToast(r.msg || "Configuração salva para toda a equipe!", "success");
                                    btn.innerText = BTN_SAVE_CFG_LABEL;
                                    btn.disabled = false;
                                }
                            });
                            return; // não restaurar o botão ainda
                        } else {
                            window.showToast("Erro ao salvar configuração: " + (r.err || "verifique os dados e tente novamente"), "error");
                            setStatus('error', 'Erro ao salvar: ' + (r.err || 'resposta inválida do servidor'));
                            console.error("save_config error:", r);
                        }
                    } catch(e) {
                        window.showToast("Erro ao salvar configuração. Tente novamente.", "error");
                        setStatus('error', 'Erro ao processar resposta do servidor ao salvar.');
                        console.error("save_config parse error:", e);
                    }
                    btn.innerText = BTN_SAVE_CFG_LABEL;
                    btn.disabled = false;
                },
                onerror: () => {
                    window.showToast("Falha de rede ao salvar. Tente novamente.", "error");
                    setStatus('error', 'Falha de rede ao tentar salvar a configuração.');
                    btn.innerText = BTN_SAVE_CFG_LABEL;
                    btn.disabled = false;
                }
            });
        };

        // ── Gerenciar Vigências ───────────────────────────────────────
        const chipsEl   = document.getElementById('cfg-vigencias-chips');
        const novaInput = document.getElementById('cfg-nova-vigencia');
        const addBtn    = document.getElementById('cfg-btn-add-vigencia');
        const feedbackEl = document.getElementById('cfg-vigencia-feedback');

        function renderVigenciasChips() {
            const list = getVigenciasList();
            chipsEl.innerHTML = list.map((v, i) => `
                <div style="display:inline-flex;align-items:center;gap:6px;padding:5px 10px;border-radius:999px;border:1px solid rgba(99,102,241,0.35);background:rgba(99,102,241,0.1);color:#a5b4fc;font-size:10px;font-weight:800;">
                    ${v}
                    ${VIGENCIAS_DEFAULT.includes(v) ? '' : `<span data-rm-vig="${i}" style="cursor:pointer;color:#f87171;font-size:12px;line-height:1;" title="Remover">✕</span>`}
                </div>
            `).join('');
            chipsEl.querySelectorAll('[data-rm-vig]').forEach(btn => {
                btn.onclick = () => {
                    const idx = parseInt(btn.dataset.rmVig, 10);
                    const updated = getVigenciasList();
                    updated.splice(idx, 1);
                    saveVigenciasList(updated);
                    renderVigenciasChips();
                    // Rebuild the dropdown
                    const sel = document.getElementById('c-nom');
                    const cur = sel ? sel.value : '';
                    if (sel) {
                        sel.innerHTML = `<option value="" disabled>Selecionar vigência...</option>` +
                            updated.map(vv => `<option value="${vv}" style="background:#0d1835">${vv}</option>`).join('');
                        if (updated.includes(cur)) sel.value = cur;
                    }
                    window.showToast('Vigência removida.', 'success');
                };
            });
        }

        addBtn.onclick = () => {
            feedbackEl.textContent = '';
            const val = novaInput.value.trim();
            if (!VIGENCIA_FORMAT.test(val)) {
                feedbackEl.style.color = '#f87171';
                feedbackEl.textContent = 'Formato inválido. Use AAAA/1 ou AAAA/2 (ex.: 2029/1).';
                return;
            }
            const list = getVigenciasList();
            if (list.includes(val)) {
                feedbackEl.style.color = '#fbbf24';
                feedbackEl.textContent = `"${val}" já existe na lista.`;
                return;
            }
            list.push(val);
            list.sort();
            saveVigenciasList(list);
            novaInput.value = '';
            renderVigenciasChips();
            // Rebuild the dropdown
            const sel = document.getElementById('c-nom');
            if (sel) {
                const cur = sel.value;
                sel.innerHTML = `<option value="" disabled>Selecionar vigência...</option>` +
                    list.map(vv => `<option value="${vv}" style="background:#0d1835">${vv}</option>`).join('');
                if (list.includes(cur)) sel.value = cur;
            }
            feedbackEl.style.color = '#34d399';
            feedbackEl.textContent = `"${val}" adicionada com sucesso.`;
            window.showToast(`Vigência "${val}" adicionada!`, 'success');
        };

        novaInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') addBtn.click(); });

        renderVigenciasChips();
    }

    function renderCondicionalidades(container) {
        const vigencias = getVigenciasList();
        const baseConfig = () => ({
            version: 1,
            defaults: {
                requirePeso: true,
                requireAltura: true,
                requireDataAcomp: true,
                vaccinationRequired: false,
                vaccinationAgeMax: 7
            },
            rules: []
        });
        let ruleSeq = 0;
        const escapeHtml = (s) => String(s || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
        const newRule = () => ({
            id: `rule_${Date.now()}_${++ruleSeq}`,
            name: "Nova Regra",
            when: { ageMin: null, ageMax: null, sexo: "QUALQUER" },
            set: { requirePeso: true }
        });
        const triToBool = (v) => v === "true" ? true : (v === "false" ? false : null);
        const boolToTri = (v) => typeof v === "boolean" ? String(v) : "";
        const numOrNull = (v) => (v === "" || v === null || v === undefined || Number.isNaN(Number(v))) ? null : parseInt(v, 10);

        let state = baseConfig();
        let auditRows = [];
        let loaded = false;

        container.innerHTML = `
            <div class="animate-fade" style="max-width:1100px;margin:0 auto;">
                <div style="margin-bottom:24px;">
                    <h1 style="font-size:26px;font-weight:900;color:white;letter-spacing:-0.5px;font-style:italic;text-transform:uppercase;margin:0;">Condicionalidades</h1>
                    <p style="font-size:12px;color:#475569;margin-top:6px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;">Regras por vigência • Última regra aplicada vence</p>
                </div>

                <div class="glass-card" style="padding:20px;">
                    <div style="display:grid;grid-template-columns:240px 1fr auto;gap:12px;align-items:end;">
                        <div>
                            <label style="font-size:9px;font-weight:800;color:#475569;text-transform:uppercase;letter-spacing:0.12em;display:block;margin-bottom:6px;">Vigência</label>
                            <select id="cond-vigencia" class="glass-input" style="cursor:pointer;">
                                ${vigencias.map(v => `<option value="${v}" style="background:#0d1835">${v}</option>`).join('')}
                            </select>
                        </div>
                        <div id="cond-feedback" style="font-size:11px;font-weight:700;color:#94a3b8;">Carregando condicionalidades...</div>
                        <div style="display:flex;gap:8px;">
                            <button id="btn-cond-load" class="btn-glass" style="font-size:10px;font-weight:900;letter-spacing:0.1em;text-transform:uppercase;">Recarregar</button>
                            <button id="btn-cond-save" style="background:linear-gradient(135deg,#6366f1,#818cf8);border:none;color:white;font-weight:900;padding:12px 16px;border-radius:12px;cursor:pointer;font-size:10px;letter-spacing:0.12em;text-transform:uppercase;">Salvar</button>
                        </div>
                    </div>
                </div>

                <div class="glass-card" style="padding:20px;">
                    <div style="font-size:10px;font-weight:900;color:#475569;text-transform:uppercase;letter-spacing:0.12em;margin-bottom:12px;">Defaults Base</div>
                    <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:10px;">
                        <label class="btn-glass" style="display:flex;gap:8px;align-items:center;justify-content:center;"><input type="checkbox" id="d-requirePeso"> Exigir Peso</label>
                        <label class="btn-glass" style="display:flex;gap:8px;align-items:center;justify-content:center;"><input type="checkbox" id="d-requireAltura"> Exigir Altura</label>
                        <label class="btn-glass" style="display:flex;gap:8px;align-items:center;justify-content:center;"><input type="checkbox" id="d-requireDataAcomp"> Exigir Data Acomp.</label>
                        <label class="btn-glass" style="display:flex;gap:8px;align-items:center;justify-content:center;"><input type="checkbox" id="d-vaccinationRequired"> Vacina Obrigatória</label>
                        <div>
                            <input id="d-vaccinationAgeMax" type="number" min="0" max="130" class="glass-input" placeholder="Idade máx. vacina">
                        </div>
                    </div>
                </div>

                <div class="glass-card" style="padding:20px;">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
                        <div style="font-size:10px;font-weight:900;color:#475569;text-transform:uppercase;letter-spacing:0.12em;">Regras Ordenadas</div>
                        <button id="btn-add-rule" class="btn-glass" style="font-size:10px;font-weight:900;letter-spacing:0.1em;text-transform:uppercase;">+ Adicionar Regra</button>
                    </div>
                    <div id="rules-list"></div>
                </div>

                <div class="glass-card" style="padding:20px;">
                    <div style="font-size:10px;font-weight:900;color:#475569;text-transform:uppercase;letter-spacing:0.12em;margin-bottom:12px;">Simulador</div>
                    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:12px;">
                        <input id="sim-idade" type="number" min="0" max="130" class="glass-input" placeholder="Idade">
                        <select id="sim-sexo" class="glass-input"><option value="QUALQUER">QUALQUER</option><option value="M">M</option><option value="F">F</option></select>
                        <label class="btn-glass" style="display:flex;gap:8px;align-items:center;justify-content:center;"><input type="checkbox" id="sim-peso"> Tem Peso</label>
                        <label class="btn-glass" style="display:flex;gap:8px;align-items:center;justify-content:center;"><input type="checkbox" id="sim-altura"> Tem Altura</label>
                        <label class="btn-glass" style="display:flex;gap:8px;align-items:center;justify-content:center;"><input type="checkbox" id="sim-data"> Tem Data Acomp.</label>
                        <label class="btn-glass" style="display:flex;gap:8px;align-items:center;justify-content:center;"><input type="checkbox" id="sim-vacina"> Vacinação OK</label>
                        <label class="btn-glass" style="display:flex;gap:8px;align-items:center;justify-content:center;"><input type="checkbox" id="sim-acomp-us"> Acomp. US</label>
                        <label class="btn-glass" style="display:flex;gap:8px;align-items:center;justify-content:center;"><input type="checkbox" id="sim-acomp-eg"> Acomp. E-Gestor</label>
                        <label class="btn-glass" style="display:flex;gap:8px;align-items:center;justify-content:center;"><input type="checkbox" id="sim-gestante"> Gestante</label>
                    </div>
                    <div style="display:flex;gap:8px;align-items:center;margin-bottom:10px;">
                        <button id="btn-simular-cond" class="btn-glass" style="font-size:10px;font-weight:900;letter-spacing:0.1em;text-transform:uppercase;">Simular</button>
                        <div id="sim-status" style="font-size:11px;font-weight:700;color:#94a3b8;"></div>
                    </div>
                    <pre id="sim-output" style="margin:0;background:rgba(0,0,0,0.35);border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:12px;min-height:120px;font-size:11px;color:#e2e8f0;overflow:auto;">Aguardando simulação...</pre>
                </div>

                <div class="glass-card" style="padding:20px;">
                    <div style="font-size:10px;font-weight:900;color:#475569;text-transform:uppercase;letter-spacing:0.12em;margin-bottom:12px;">Auditoria (últimas alterações da vigência)</div>
                    <div id="audit-list" style="font-family:monospace;font-size:11px;color:#cbd5e1;max-height:180px;overflow:auto;">Sem registros.</div>
                </div>
            </div>
        `;

        const vigSelect = document.getElementById('cond-vigencia');
        const feedback = document.getElementById('cond-feedback');
        const rulesList = document.getElementById('rules-list');
        const auditList = document.getElementById('audit-list');
        const simOutput = document.getElementById('sim-output');

        const requestPanel = (action, extra = {}) => new Promise((resolve) => {
            const base = { action, api_target: "panel", token: TOKEN_ACESSO };
            const data = Object.entries({ ...base, ...extra })
                .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v === undefined || v === null ? "" : String(v))}`)
                .join("&");
            GM_xmlhttpRequest({
                method: "POST",
                url: URL_APPS_SCRIPT,
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                data,
                onload: (res) => {
                    try { resolve(JSON.parse(res.responseText)); }
                    catch { resolve({ ok: false, err: "Resposta inválida do servidor." }); }
                },
                onerror: () => resolve({ ok: false, err: "Falha de rede ao comunicar com a API." })
            });
        });

        const getPayload = () => ({
            version: 1,
            defaults: {
                requirePeso: !!state.defaults.requirePeso,
                requireAltura: !!state.defaults.requireAltura,
                requireDataAcomp: !!state.defaults.requireDataAcomp,
                vaccinationRequired: !!state.defaults.vaccinationRequired,
                vaccinationAgeMax: numOrNull(state.defaults.vaccinationAgeMax) ?? 7
            },
            rules: (state.rules || []).map((r, idx) => ({
                id: r.id || `rule_${idx + 1}`,
                name: String(r.name || `Regra ${idx + 1}`),
                when: {
                    ageMin: numOrNull(r.when?.ageMin),
                    ageMax: numOrNull(r.when?.ageMax),
                    sexo: (r.when?.sexo || "QUALQUER").toUpperCase()
                },
                set: (() => {
                    const s = {};
                    if (typeof r.set?.requirePeso === "boolean") s.requirePeso = r.set.requirePeso;
                    if (typeof r.set?.requireAltura === "boolean") s.requireAltura = r.set.requireAltura;
                    if (typeof r.set?.requireDataAcomp === "boolean") s.requireDataAcomp = r.set.requireDataAcomp;
                    if (typeof r.set?.vaccinationRequired === "boolean") s.vaccinationRequired = r.set.vaccinationRequired;
                    if (numOrNull(r.set?.vaccinationAgeMax) !== null) s.vaccinationAgeMax = numOrNull(r.set.vaccinationAgeMax);
                    return s;
                })()
            }))
        });

        const renderAudit = () => {
            if (!auditRows.length) {
                auditList.innerText = "Sem registros.";
                return;
            }
            auditList.innerHTML = auditRows.map((a) => {
                const dt = a.at ? new Date(a.at).toLocaleString() : "-";
                const beforeCount = a.before?.rules?.length ?? 0;
                const afterCount = a.after?.rules?.length ?? 0;
                return `<div style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.06);">${dt} • ${a.author || "desconhecido"} • regras ${beforeCount} → ${afterCount}</div>`;
            }).join("");
        };

        const bindRuleEvents = () => {
            rulesList.querySelectorAll('[data-bind]').forEach((el) => {
                el.oninput = () => {
                    const idx = parseInt(el.getAttribute('data-idx'), 10);
                    const bind = el.getAttribute('data-bind');
                    if (!state.rules[idx]) return;
                    if (bind === "name") state.rules[idx].name = el.value;
                    if (bind === "ageMin") state.rules[idx].when.ageMin = numOrNull(el.value);
                    if (bind === "ageMax") state.rules[idx].when.ageMax = numOrNull(el.value);
                    if (bind === "sexo") state.rules[idx].when.sexo = el.value;
                    if (bind.startsWith("set.")) {
                        const k = bind.split(".")[1];
                        if (k === "vaccinationAgeMax") {
                            const v = numOrNull(el.value);
                            if (v === null) delete state.rules[idx].set.vaccinationAgeMax;
                            else state.rules[idx].set.vaccinationAgeMax = v;
                        } else {
                            const v = triToBool(el.value);
                            if (v === null) delete state.rules[idx].set[k];
                            else state.rules[idx].set[k] = v;
                        }
                    }
                };
            });

            rulesList.querySelectorAll('[data-action]').forEach((btn) => {
                btn.onclick = () => {
                    const idx = parseInt(btn.getAttribute('data-idx'), 10);
                    const action = btn.getAttribute('data-action');
                    if (action === "up" && idx > 0) {
                        [state.rules[idx - 1], state.rules[idx]] = [state.rules[idx], state.rules[idx - 1]];
                    }
                    if (action === "down" && idx < state.rules.length - 1) {
                        [state.rules[idx + 1], state.rules[idx]] = [state.rules[idx], state.rules[idx + 1]];
                    }
                    if (action === "del") {
                        state.rules.splice(idx, 1);
                    }
                    renderRules();
                };
            });
        };

        const renderRules = () => {
            if (!state.rules.length) {
                rulesList.innerHTML = `<div style="font-size:11px;color:#64748b;font-weight:700;">Nenhuma regra adicionada. Use “Adicionar Regra”.</div>`;
                return;
            }

            rulesList.innerHTML = state.rules.map((r, idx) => `
                <div class="glass-card" style="padding:14px;margin-bottom:10px;border-radius:14px;">
                    <div style="display:grid;grid-template-columns:1.5fr 1fr 1fr 1fr auto;gap:8px;align-items:end;">
                        <div><input data-bind="name" data-idx="${idx}" class="glass-input" value="${escapeHtml(r.name || "")}" placeholder="Nome da regra"></div>
                        <div><input data-bind="ageMin" data-idx="${idx}" type="number" min="0" max="130" class="glass-input" value="${r.when?.ageMin ?? ""}" placeholder="Idade mín"></div>
                        <div><input data-bind="ageMax" data-idx="${idx}" type="number" min="0" max="130" class="glass-input" value="${r.when?.ageMax ?? ""}" placeholder="Idade máx"></div>
                        <div>
                            <select data-bind="sexo" data-idx="${idx}" class="glass-input">
                                <option value="QUALQUER" ${(r.when?.sexo || "QUALQUER") === "QUALQUER" ? "selected" : ""}>QUALQUER</option>
                                <option value="M" ${r.when?.sexo === "M" ? "selected" : ""}>M</option>
                                <option value="F" ${r.when?.sexo === "F" ? "selected" : ""}>F</option>
                            </select>
                        </div>
                        <div style="display:flex;gap:6px;">
                            <button data-action="up" data-idx="${idx}" class="btn-glass">↑</button>
                            <button data-action="down" data-idx="${idx}" class="btn-glass">↓</button>
                            <button data-action="del" data-idx="${idx}" class="btn-glass" style="color:#fca5a5;border-color:rgba(239,68,68,0.35);">✕</button>
                        </div>
                    </div>
                    <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-top:8px;">
                        <select data-bind="set.requirePeso" data-idx="${idx}" class="glass-input"><option value="">Peso: Padrão</option><option value="true" ${boolToTri(r.set?.requirePeso) === "true" ? "selected" : ""}>Peso: Obrig.</option><option value="false" ${boolToTri(r.set?.requirePeso) === "false" ? "selected" : ""}>Peso: Disp.</option></select>
                        <select data-bind="set.requireAltura" data-idx="${idx}" class="glass-input"><option value="">Altura: Padrão</option><option value="true" ${boolToTri(r.set?.requireAltura) === "true" ? "selected" : ""}>Altura: Obrig.</option><option value="false" ${boolToTri(r.set?.requireAltura) === "false" ? "selected" : ""}>Altura: Disp.</option></select>
                        <select data-bind="set.requireDataAcomp" data-idx="${idx}" class="glass-input"><option value="">Data: Padrão</option><option value="true" ${boolToTri(r.set?.requireDataAcomp) === "true" ? "selected" : ""}>Data: Obrig.</option><option value="false" ${boolToTri(r.set?.requireDataAcomp) === "false" ? "selected" : ""}>Data: Disp.</option></select>
                        <select data-bind="set.vaccinationRequired" data-idx="${idx}" class="glass-input"><option value="">Vacina: Padrão</option><option value="true" ${boolToTri(r.set?.vaccinationRequired) === "true" ? "selected" : ""}>Vacina: Obrig.</option><option value="false" ${boolToTri(r.set?.vaccinationRequired) === "false" ? "selected" : ""}>Vacina: Disp.</option></select>
                        <input data-bind="set.vaccinationAgeMax" data-idx="${idx}" type="number" min="0" max="130" class="glass-input" placeholder="Vacina até idade" value="${r.set?.vaccinationAgeMax ?? ""}">
                    </div>
                </div>
            `).join("");

            bindRuleEvents();
        };

        const applyStateToDefaults = () => {
            document.getElementById('d-requirePeso').checked = !!state.defaults.requirePeso;
            document.getElementById('d-requireAltura').checked = !!state.defaults.requireAltura;
            document.getElementById('d-requireDataAcomp').checked = !!state.defaults.requireDataAcomp;
            document.getElementById('d-vaccinationRequired').checked = !!state.defaults.vaccinationRequired;
            document.getElementById('d-vaccinationAgeMax').value = state.defaults.vaccinationAgeMax ?? 7;
        };

        const loadRules = async () => {
            feedback.innerText = "Carregando...";
            const res = await requestPanel("get_rules", { vigencia: vigSelect.value });
            if (!res || !res.ok) {
                feedback.innerText = `Erro ao carregar: ${(res && res.err) ? res.err : "falha desconhecida"}`;
                window.showToast("Erro ao carregar condicionalidades.");
                return;
            }
            state = res.data?.config || baseConfig();
            auditRows = res.data?.audit || [];
            if (!Array.isArray(state.rules)) state.rules = [];
            if (!state.defaults) state.defaults = baseConfig().defaults;
            applyStateToDefaults();
            renderRules();
            renderAudit();
            feedback.innerText = `Carregado (${res.data?.source || "fallback"})`;
            loaded = true;
        };

        document.getElementById('btn-cond-load').onclick = loadRules;
        document.getElementById('btn-add-rule').onclick = () => { state.rules.push(newRule()); renderRules(); };

        document.getElementById('btn-cond-save').onclick = async () => {
            const btn = document.getElementById('btn-cond-save');
            const payload = getPayload();
            const hasInvalidRule = payload.rules.some(r => !r.set || Object.keys(r.set).length === 0);
            if (hasInvalidRule) {
                window.showToast("Cada regra precisa ao menos 1 sobrescrita.");
                return;
            }
            btn.innerText = "Salvando...";
            btn.disabled = true;
            feedback.innerText = "Salvando no servidor...";
            const author = GM_getValue('egestor_user', '') || GM_getValue('esus_user', '') || "";
            const res = await requestPanel("save_rules", { vigencia: vigSelect.value, author, rules_json: JSON.stringify(payload) });
            btn.disabled = false;
            btn.innerText = "Salvar";
            if (!res || !res.ok) {
                feedback.innerText = `Erro ao salvar: ${(res && res.err) ? res.err : "falha desconhecida"}`;
                window.showToast("Falha ao salvar condicionalidades.");
                return;
            }
            feedback.innerText = "Salvo com sucesso.";
            window.showToast("Condicionalidades salvas!");
            await loadRules();
        };

        const bindDefaults = () => {
            document.getElementById('d-requirePeso').onchange = (e) => state.defaults.requirePeso = e.target.checked;
            document.getElementById('d-requireAltura').onchange = (e) => state.defaults.requireAltura = e.target.checked;
            document.getElementById('d-requireDataAcomp').onchange = (e) => state.defaults.requireDataAcomp = e.target.checked;
            document.getElementById('d-vaccinationRequired').onchange = (e) => state.defaults.vaccinationRequired = e.target.checked;
            document.getElementById('d-vaccinationAgeMax').oninput = (e) => state.defaults.vaccinationAgeMax = numOrNull(e.target.value) ?? 7;
        };
        bindDefaults();

        document.getElementById('btn-simular-cond').onclick = async () => {
            const idade = document.getElementById('sim-idade').value;
            const sexo = document.getElementById('sim-sexo').value;
            const simStatus = document.getElementById('sim-status');
            simStatus.innerText = "Simulando...";
            const payload = getPayload();
            const res = await requestPanel("simulate_rules", {
                vigencia: vigSelect.value,
                rules_json: JSON.stringify(payload),
                idade: idade,
                sexo: sexo,
                pesoPresente: document.getElementById('sim-peso').checked,
                alturaPresente: document.getElementById('sim-altura').checked,
                dataAcompPresente: document.getElementById('sim-data').checked,
                vacinacaoPresente: document.getElementById('sim-vacina').checked,
                acompUS: document.getElementById('sim-acomp-us').checked,
                acompEgestor: document.getElementById('sim-acomp-eg').checked,
                gestante: document.getElementById('sim-gestante').checked
            });
            if (!res || !res.ok) {
                simStatus.innerText = "Erro na simulação.";
                simOutput.textContent = (res && res.err) ? res.err : "Falha desconhecida";
                window.showToast("Erro ao simular.");
                return;
            }
            const d = res.data || {};
            simStatus.innerText = `Status: ${d.status || "-"} • Prioridade: ${d.prioridade ?? "-"}`;
            simOutput.textContent = JSON.stringify({
                requisitosFinais: d.requisitos || {},
                status: d.status,
                prioridade: d.prioridade,
                faltantes: d.faltantes || [],
                regrasAplicadas: d.regrasAplicadas || []
            }, null, 2);
        };

        vigSelect.onchange = () => {
            if (loaded) window.showToast(`Mudou para vigência ${vigSelect.value}`, "info");
            loadRules();
        };

        loadRules();
    }

function renderPlanilhas(container) {
  const vigencias = getVigenciasList();
  const vigSelecionada = GM_getValue('planilhas_vigencia_selecionada', vigencias[0] || '');

  container.innerHTML = `
    <div class="animate-fade" style="max-width:860px;margin:0 auto;">
      <div style="margin-bottom:32px;border-bottom:1px solid rgba(255,255,255,0.05);padding-bottom:20px;">
        <h2 style="font-size:26px;font-weight:900;color:white;letter-spacing:-0.5px;font-style:italic;text-transform:uppercase;margin:0;">Gestão Planilhas</h2>
        <p style="font-size:12px;color:#475569;margin-top:6px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;">Controle de importação e distribuição das Zonas</p>
      </div>

      <!-- ===== SELETOR DE VIGÊNCIA ===== -->
      <div class="glass-card" style="padding:16px 18px;margin-bottom:16px;border:1px solid rgba(99,102,241,0.16);background:rgba(99,102,241,0.04);">
        <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;">
          <div style="flex:1;min-width:180px;">
            <label style="font-size:9px;font-weight:800;color:#475569;text-transform:uppercase;letter-spacing:0.12em;display:block;margin-bottom:6px;">Vigência desta seção</label>
            <select id="planilhas-vigencia-select" class="glass-input" style="cursor:pointer;">
              ${vigencias.map(v => `<option value="${v}" style="background:#0d1835" ${v === vigSelecionada ? 'selected' : ''}>${v}</option>`).join('')}
            </select>
          </div>
          <div id="planilhas-vigencia-badge" style="padding:6px 12px;border-radius:999px;border:1px solid rgba(99,102,241,0.35);background:rgba(99,102,241,0.1);color:#a5b4fc;font-size:10px;font-weight:900;letter-spacing:0.1em;text-transform:uppercase;margin-top:14px;">
            ${vigSelecionada || '—'}
          </div>
        </div>
      </div>

      <div class="glass-card" style="padding:20px;margin-bottom:16px;">
        <div style="font-size:9px;font-weight:800;color:#475569;text-transform:uppercase;letter-spacing:0.12em;margin-bottom:14px;">Região Alvo</div>
        <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:10px;">
          ${['TODAS','NORTE','SUL','LESTE','OESTE'].map((r,i)=>`
            <label style="cursor:pointer;">
              <input type="radio" name="region_select" value="${r}" class="peer sr-only" ${i===0?'checked':''}>
              <div class="glass-input" style="height:48px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:11px;letter-spacing:0.08em;cursor:pointer;">
                ${r}
              </div>
            </label>
          `).join('')}
        </div>
      </div>

      <!-- ===== CARD COMPACTO: VIGÊNCIA + STATUS + DETALHES RECOLHÍVEIS ===== -->
      <div class="glass-card" style="padding:16px 18px;margin-bottom:16px;border:1px solid rgba(99,102,241,0.16);background:rgba(99,102,241,0.04);">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;">
          <div style="min-width:0;">
            <div style="font-size:9px;font-weight:900;color:#475569;text-transform:uppercase;letter-spacing:0.14em;">Vigência ativa</div>
            <div id="vigencia-nome" style="font-size:18px;font-weight:900;color:white;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
              Carregando...
            </div>

            <div style="display:flex;align-items:center;gap:10px;margin-top:10px;flex-wrap:wrap;">
              <div id="status-pill"
                style="padding:6px 10px;border-radius:999px;font-size:10px;font-weight:900;letter-spacing:0.12em;text-transform:uppercase;border:1px solid rgba(255,255,255,0.08);background:rgba(255,255,255,0.02);color:#94a3b8;">
                verificando…
              </div>

              <div id="zonas-chips" style="display:flex;gap:8px;flex-wrap:wrap;"></div>
            </div>

            <!-- Linha curta: só aparece se tiver alerta/erro -->
            <div id="status-msg" style="margin-top:10px;font-size:11px;font-weight:800;color:#64748b;display:none;"></div>
          </div>

          <div style="display:flex;flex-direction:column;gap:8px;flex-shrink:0;">
            <button id="btn-status-refresh" class="btn-glass"
              style="display:flex;align-items:center;gap:6px;padding:10px 12px;font-size:10px;font-weight:900;letter-spacing:0.12em;text-transform:uppercase;border-radius:12px;">
              <span class="material-symbols-rounded" style="font-size:16px;">refresh</span>
              Atualizar
            </button>

            <button id="btn-status-details" class="btn-glass"
              style="display:flex;align-items:center;gap:6px;padding:10px 12px;font-size:10px;font-weight:900;letter-spacing:0.12em;text-transform:uppercase;border-radius:12px;">
              <span class="material-symbols-rounded" style="font-size:16px;">expand_more</span>
              Detalhes
            </button>
          </div>
        </div>

        <div id="status-details" style="display:none;margin-top:14px;border-top:1px solid rgba(255,255,255,0.06);padding-top:12px;">
          <div style="font-size:9px;font-weight:900;color:#475569;text-transform:uppercase;letter-spacing:0.14em;margin-bottom:8px;">
            Diagnóstico (pré‑voo)
          </div>
          <div id="health-results" style="font-family:monospace;font-size:11px;line-height:1.6;color:#e2e8f0;"></div>
        </div>
      </div>

      <!-- ===== CICLO COMPLETO ===== -->
      <button id="btn-full-sync" class="btn-sync-main"
        style="width:100%;background:linear-gradient(135deg,rgba(16,185,129,0.12),rgba(16,185,129,0.06));border:1px solid rgba(16,185,129,0.25);border-radius:20px;padding:28px 32px;display:flex;align-items:center;justify-content:space-between;cursor:pointer;overflow:hidden;margin-bottom:16px;">
        <div style="display:flex;align-items:center;gap:20px;">
          <div style="width:56px;height:56px;background:rgba(16,185,129,0.15);border-radius:16px;display:flex;align-items:center;justify-content:center;border:1px solid rgba(16,185,129,0.2);flex-shrink:0;">
            <span class="material-symbols-rounded" style="font-size:32px;color:#10b981;">sync</span>
          </div>
          <div style="text-align:left;">
            <div style="font-size:20px;font-weight:900;color:white;font-style:italic;text-transform:uppercase;letter-spacing:-0.3px;">Executar Ciclo Completo</div>
            <div style="font-size:10px;color:#34d399;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;margin-top:4px;">Importar • Atualizar DB • Distribuir • Devolver</div>
          </div>
        </div>
        <span class="material-symbols-rounded" style="font-size:28px;color:rgba(16,185,129,0.4);flex-shrink:0;">chevron_right</span>
      </button>

      <div id="box-prog" class="hidden glass-card" style="padding:20px;border:1px solid rgba(99,102,241,0.2);background:rgba(99,102,241,0.04);">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
          <div style="display:flex;align-items:center;gap:6px;">
            <div style="width:6px;height:6px;background:#6366f1;border-radius:50%;animation:pulse 2s infinite;"></div>
            <span style="font-size:9px;font-weight:800;color:#818cf8;text-transform:uppercase;letter-spacing:0.12em;">Processando...</span>
          </div>
          <span style="font-weight:900;color:white;font-size:14px;" id="val-prog">0%</span>
        </div>
        <div class="progress-container"><div id="bar-prog" class="progress-bar"></div></div>
      </div>
<div id="box-summary" class="hidden glass-card"
  style="padding:16px 18px;border:1px solid rgba(16,185,129,0.18);background:rgba(16,185,129,0.04);margin-top:16px;">
  <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px;">
    <div style="display:flex;align-items:center;gap:8px;">
      <span class="material-symbols-rounded" style="font-size:18px;color:#34d399;">assignment_turned_in</span>
      <div style="font-size:10px;font-weight:900;color:#475569;text-transform:uppercase;letter-spacing:0.14em;">Resumo do ciclo</div>
    </div>
    <div id="summary-time" style="font-size:10px;font-weight:900;color:#a7f3d0;letter-spacing:0.12em;text-transform:uppercase;">--:--</div>
  </div>

  <div id="summary-lines" style="display:flex;flex-direction:column;gap:8px;font-size:11px;font-weight:800;color:#e2e8f0;"></div>

  <div style="margin-top:10px;font-size:10px;color:#64748b;font-weight:800;">
    Dica: se algo ficou <span style="color:#fbbf24;">0</span>, confira a vigência/pastas e rode “Atualizar”.
  </div>
</div>
      <div id="log-box" class="glass-card"
        style="padding:16px 20px;background:rgba(0,0,0,0.55);height:160px;font-family:'Courier New',monospace;font-size:11px;overflow-y:auto;color:#34d399;border:1px solid rgba(16,185,129,0.1);border-radius:16px;">
        > SISTEMA PRONTO.
      </div>

      <div style="padding-top:16px;">
        <button id="btn-toggle-advanced"
          style="width:100%;display:flex;align-items:center;justify-content:center;gap:6px;color:#334155;background:none;border:none;cursor:pointer;padding:12px;font-size:9px;font-weight:800;letter-spacing:0.15em;text-transform:uppercase;transition:color 0.2s;">
          <span class="material-symbols-rounded" style="font-size:16px;transition:transform 0.2s;">expand_more</span>
          Opções Manuais Avançadas
        </button>

        <div id="advanced-panel" class="hidden mt-4 grid grid-cols-4 gap-3 animate-fade">
          ${[
            {a:'run_import',l:'1. Importar',i:'folder_open',c:'#818cf8'},
            {a:'run_update_db',l:'2. Atualizar DB',i:'update',c:'#60a5fa'},
            {a:'run_distribute',l:'3. Distribuir',i:'hub',c:'#34d399'},
            {a:'run_return',l:'4. Devolver',i:'upload_file',c:'#fbbf24'}
          ].map(b => `
            <button data-acao="${b.a}" class="manual-action btn-action-card glass-card"
              style="margin:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:20px 12px;cursor:pointer;border:1px solid rgba(255,255,255,0.04);">
              <div style="width:44px;height:44px;background:${b.c}18;border-radius:12px;display:flex;align-items:center;justify-content:center;border:1px solid ${b.c}30;">
                <span class="material-symbols-rounded" style="font-size:22px;color:${b.c};">${b.i}</span>
              </div>
              <div style="font-size:9px;font-weight:800;color:#475569;text-transform:uppercase;letter-spacing:0.1em;text-align:center;">${b.l}</div>
            </button>
          `).join('')}
        </div>
      </div>
    </div>
  `;

  const logBox = document.getElementById('log-box');
  const log = (m) => {
    logBox.innerHTML += `<div>[${new Date().toLocaleTimeString()}] ${m}</div>`;
    logBox.scrollTop = logBox.scrollHeight;
  };

  // ── Vigência selector handler ────────────────────────────────────────────
  const vigSelect = document.getElementById('planilhas-vigencia-select');
  const vigBadge  = document.getElementById('planilhas-vigencia-badge');
  if (vigSelect) {
    vigSelect.addEventListener('change', () => {
      const v = vigSelect.value;
      GM_setValue('planilhas_vigencia_selecionada', v);
      if (vigBadge) vigBadge.textContent = v;
      log(`Vigência selecionada: ${v}`);
    });
  }

  const regionMeta = {
    TODAS: { id: 'todas', nome: 'TODAS' },
    NORTE: { id: 'norte', nome: 'NORTE' },
    SUL:   { id: 'sul',   nome: 'SUL' },
    LESTE: { id: 'leste', nome: 'LESTE' },
    OESTE: { id: 'oeste', nome: 'OESTE' }
  };

  function getSelectedRegionMeta() {
    const selected = document.querySelector('input[name="region_select"]:checked');
    const key = selected ? selected.value : 'TODAS';
    return regionMeta[key] || regionMeta.TODAS;
  }

  function createExecContext(actionName) {
    const alvo = getSelectedRegionMeta();
    const execId = `${actionName}_${alvo.id}_${Date.now()}`;
    return { alvo, execId };
  }

  const toggleBtn = document.getElementById('btn-toggle-advanced');
  const advPanel = document.getElementById('advanced-panel');
  if (toggleBtn) toggleBtn.onclick = () => {
    advPanel.classList.toggle('hidden');
    toggleBtn.querySelector('span').style.transform = advPanel.classList.contains('hidden') ? 'rotate(0deg)' : 'rotate(180deg)';
  };

  async function api(act, context) {
    const ctx = context || createExecContext(act);
    const r = ctx.alvo.nome;
    return new Promise(resolve => {
      GM_xmlhttpRequest({
        method: "POST",
        url: URL_APPS_SCRIPT,
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        data: `action=${act}&api_target=panel&token=${TOKEN_ACESSO}&region=${r}&region_id=${ctx.alvo.id}&exec_id=${ctx.execId}`,
        onload: (resp) => {
          try { resolve(JSON.parse(resp.responseText)); }
          catch { resolve({ ok:false, err:"Resposta inválida do servidor" }); }
        }
      });
    });
  }
  function safeNum(x) {
  const n = parseInt(x, 10);
  return isNaN(n) ? 0 : n;
}

function fmtDelta(n) {
  const sign = n > 0 ? "+" : "";
  return `${sign}${n}`;
}

function fmtTime(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

async function fetchDashboardSnapshot() {
  // Usa o mesmo token/URL; action já existe no seu api.gs
  const res = await new Promise(resolve => {
    GM_xmlhttpRequest({
      method: "POST",
      url: URL_APPS_SCRIPT,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      data: `action=obter_dashboard&api_target=panel&token=${TOKEN_ACESSO}&force=false`,
      onload: (resp) => {
        try { resolve(JSON.parse(resp.responseText)); }
        catch { resolve({ ok:false }); }
      }
    });
  });

  if(!res || !res.ok || !res.dados) return null;

  return {
    ts: Date.now(),
    vigencia: normalizeVigencia(res.dados.config?.vigencia || ""),
    fila_egestor: safeNum(res.dados.fila_egestor),
    fila_esus: safeNum(res.dados.fila_esus),
    total_buscado: safeNum(res.dados.total_buscado),
    cadastros_realizados: safeNum(res.dados.cadastros_realizados),
    egestor_atualizados: safeNum(res.dados.egestor_atualizados),
    atualizacoes: safeNum(res.dados.atualizacoes),
    total_db: safeNum(res.dados.total_db),
    concluidos_db: safeNum(res.dados.concluidos_db),
  };
}

function renderCycleSummary(before, after, msTotal) {
  const box = document.getElementById('box-summary');
  const lines = document.getElementById('summary-lines');
  const timeEl = document.getElementById('summary-time');
  if(!box || !lines || !timeEl) return;

  box.classList.remove('hidden');
  timeEl.textContent = `TEMPO: ${fmtTime(msTotal)}`;

  if(!before || !after) {
    lines.innerHTML = `<div style="color:#fbbf24;">Não foi possível gerar resumo (snapshot ausente).</div>`;
    return;
  }

  const dFilaEg = after.fila_egestor - before.fila_egestor;
  const dFilaEs = after.fila_esus - before.fila_esus;

  const dBuscado = after.total_buscado - before.total_buscado;
  const dCadNovos = after.cadastros_realizados - before.cadastros_realizados;
  const dCadJa = after.egestor_atualizados - before.egestor_atualizados;
  const dEsus = after.atualizacoes - before.atualizacoes;

  const dConcluidos = after.concluidos_db - before.concluidos_db;

  const pill = (txt, color) => `
    <span style="
      display:inline-flex;align-items:center;gap:6px;
      padding:4px 8px;border-radius:999px;
      border:1px solid ${color}55;background:${color}18;color:${color};
      font-size:10px;font-weight:900;letter-spacing:0.1em;text-transform:uppercase;">
      ${txt}
    </span>
  `;

  const row = (title, valueHtml, hint="") => `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;">
      <div style="color:#94a3b8;font-weight:900;letter-spacing:0.06em;text-transform:uppercase;font-size:10px;">${title}</div>
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;justify-content:flex-end;">
        ${valueHtml}
        ${hint ? `<span style="color:#475569;font-size:10px;font-weight:900;letter-spacing:0.08em;text-transform:uppercase;">${hint}</span>` : ""}
      </div>
    </div>
  `;

  lines.innerHTML = [
    row("Vigência", pill(after.vigencia || "—", "#a5b4fc"), before.vigencia && after.vigencia && before.vigencia !== after.vigencia ? `ANTES: ${before.vigencia}` : ""),
    row("Fila gerada", [
      pill(`E-GESTOR ${fmtDelta(dFilaEg)}`, dFilaEg >= 0 ? "#34d399" : "#fbbf24"),
      pill(`E-SUS ${fmtDelta(dFilaEs)}`, dFilaEs >= 0 ? "#60a5fa" : "#fbbf24"),
    ].join("")),
    row("Produtividade", [
      pill(`BUSCAS ${fmtDelta(dBuscado)}`, "#94a3b8"),
      pill(`NOVOS ${fmtDelta(dCadNovos)}`, "#34d399"),
      pill(`JÁ CAD. ${fmtDelta(dCadJa)}`, "#059669"),
      pill(`E-SUS ${fmtDelta(dEsus)}`, "#60a5fa"),
    ].join("")),
    row("Concluídos no banco", pill(fmtDelta(dConcluidos), dConcluidos >= 0 ? "#fbbf24" : "#f87171")),
  ].join("");
}

  // ---------- UI compacta ----------
  function setPill(status, text) {
    const pill = document.getElementById('status-pill');
    if (!pill) return;

    const styles = {
      OK:     { bg: "rgba(16,185,129,0.12)", bd: "rgba(16,185,129,0.35)", fg: "#34d399" },
      ALERTA: { bg: "rgba(245,158,11,0.10)", bd: "rgba(245,158,11,0.35)", fg: "#fbbf24" },
      ERRO:   { bg: "rgba(239,68,68,0.10)",  bd: "rgba(239,68,68,0.35)",  fg: "#f87171" },
      INFO:   { bg: "rgba(148,163,184,0.08)",bd: "rgba(255,255,255,0.08)", fg: "#94a3b8" },
    };
    const s = styles[status] || styles.INFO;

    pill.style.background = s.bg;
    pill.style.border = `1px solid ${s.bd}`;
    pill.style.color = s.fg;
    pill.textContent = text || status;
  }

  function showStatusMsg(text, kind) {
    const el = document.getElementById('status-msg');
    if(!el) return;
    if(!text) { el.style.display = "none"; return; }

    el.style.display = "block";
    el.textContent = text;

    if(kind === "ERRO") el.style.color = "#f87171";
    else if(kind === "ALERTA") el.style.color = "#fbbf24";
    else el.style.color = "#94a3b8";
  }

  function renderZonaChips(cfg) {
    const el = document.getElementById('zonas-chips');
    if(!el) return;
    el.innerHTML = "";

    const zonas = [
      {k:"NORTE", c:"#818cf8"},
      {k:"SUL",   c:"#10b981"},
      {k:"LESTE", c:"#f59e0b"},
      {k:"OESTE", c:"#ef4444"},
    ];

    zonas.forEach(z => {
      const ok = cfg && cfg[z.k] && String(cfg[z.k]).trim().length > 0;
      const chip = document.createElement('div');
      chip.style.cssText = `
        padding:6px 10px;border-radius:999px;
        font-size:10px;font-weight:900;letter-spacing:0.1em;text-transform:uppercase;
        border:1px solid ${ok ? (z.c+"55") : "rgba(255,255,255,0.08)"};
        background:${ok ? (z.c+"18") : "rgba(255,255,255,0.02)"};
        color:${ok ? z.c : "#64748b"};
      `;
      chip.textContent = ok ? `${z.k} ✓` : `${z.k} —`;
      el.appendChild(chip);
    });
  }

  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g,"&amp;")
      .replace(/</g,"&lt;")
      .replace(/>/g,"&gt;");
  }

  function renderHealthDetails(checks, vigName) {
    const out = document.getElementById('health-results');
    if(!out) return;

    const order = { "ERRO": 0, "ALERTA": 1, "OK": 2 };
    const sorted = [...(checks || [])].sort((a,b)=> (order[a.status] ?? 9) - (order[b.status] ?? 9));

    const badge = (st) => {
      if(st === "OK") return `<span style="color:#34d399;font-weight:900;">[OK]</span>`;
      if(st === "ALERTA") return `<span style="color:#fbbf24;font-weight:900;">[ALERTA]</span>`;
      return `<span style="color:#f87171;font-weight:900;">[ERRO]</span>`;
    };

    const header = `<div style="margin-bottom:10px;color:#a5b4fc;font-weight:900;">Vigência: ${escapeHtml(vigName || "")}</div>`;
    out.innerHTML = header + sorted.map(c => {
      const label = escapeHtml(c.label);
      const msg = escapeHtml(c.message);
      return `${badge(c.status)} <b>${label}</b> — ${msg}`;
    }).join("<br>");
  }

  async function loadConfigAndHealth({silent=false} = {}) {
    try {
      setPill("INFO", "verificando…");
      showStatusMsg("", "INFO");

      // 1) Config
      const resCfg = await api('get_config', createExecContext('get_config'));
      const cfg = (resCfg && resCfg.ok) ? (resCfg.data || null) : null;

      const vigEl = document.getElementById('vigencia-nome');
      const vigName = cfg?.vigencia ? normalizeVigencia(cfg.vigencia) : VIG_NAO_CONFIGURADA;
      if(vigEl) vigEl.textContent = vigName;
      renderZonaChips(cfg || {});

      // 2) Health check
      const res = await api('health_check', createExecContext('health_check'));
      if(!res || !res.ok) {
        setPill("ERRO", "ERRO");
        showStatusMsg("Falha ao validar. Verifique token/link do Apps Script.", "ERRO");
        if(!silent) window.showToast("Validação: erro ao chamar o servidor.");
        return;
      }

      const checks = res.data?.checks || [];
      const hasError = checks.some(c => c.status === "ERRO");
      const hasWarn  = checks.some(c => c.status === "ALERTA");

      if(hasError) {
        setPill("ERRO", "ERRO");
        showStatusMsg("Há erros de configuração. Clique em “Detalhes”.", "ERRO");
        if(!silent) window.showToast("Validação: ERROS encontrados. Clique em Detalhes.");
      } else if(hasWarn) {
        setPill("ALERTA", "ALERTA");
        showStatusMsg("Operando com alertas (normal se alguma zona estiver vazia).", "ALERTA");
        if(!silent) window.showToast("Validação: OK com alertas.");
      } else {
        setPill("OK", "OK");
        showStatusMsg("", "OK");
        if(!silent) window.showToast("Validação: tudo OK.");
      }

      renderHealthDetails(checks, vigName);
      log(`VIGÊNCIA ATIVA: ${vigName}`);

    } catch (e) {
      console.error(e);
      setPill("ERRO", "ERRO");
      showStatusMsg("Erro interno no painel. Veja o console (F12).", "ERRO");
      if(!silent) window.showToast("Erro no painel ao validar. Veja o console (F12).");
    }
  }

  // Botões do card
  const btnRefresh = document.getElementById('btn-status-refresh');
  if(btnRefresh) btnRefresh.onclick = () => loadConfigAndHealth({silent:false});

  const btnDetails = document.getElementById('btn-status-details');
  if(btnDetails) btnDetails.onclick = () => {
    const details = document.getElementById('status-details');
    if(!details) return;
    const open = details.style.display !== "none";
    details.style.display = open ? "none" : "block";

    const icon = btnDetails.querySelector('span.material-symbols-rounded');
    if(icon) icon.textContent = open ? "expand_more" : "expand_less";
  };

  // Autorun silencioso ao abrir
  setTimeout(() => loadConfigAndHealth({silent:true}), 300);

  // ===== Ciclo completo (mantido do seu) =====
  document.getElementById('btn-full-sync').onclick = async () => {
    if(!confirm("Iniciar processamento automático?")) return;

    document.getElementById('box-prog').classList.remove('hidden');
    const barProg = document.getElementById('bar-prog');
    const valProg = document.getElementById('val-prog');
    barProg.style.width = '0%';
    valProg.innerText = '0%';

    const cicloCtx = createExecContext('full_sync');
    log(`ALVO: ${cicloCtx.alvo.nome} | ID: ${cicloCtx.execId}`);
    log("INICIANDO CICLO COMPLETO...");

    const atualizarBarra = (texto, pctFixa = null) => {
      if (pctFixa !== null) {
        barProg.style.width = pctFixa + '%';
        valProg.innerText = pctFixa + '%';
        return;
      }
      if (!texto) return;
      const match = String(texto).match(/\[(\d+)\/(\d+)\]/);
      if (match) {
        let pct = ((match[1] / match[2]) * 100).toFixed(0);
        if (pct > 99) pct = 99;
        barProg.style.width = pct + '%';
        valProg.innerText = pct + '%';
      }
    };
    const t0 = Date.now();
document.getElementById('box-summary')?.classList.add('hidden');

log("Capturando snapshot (antes)...");
const snapBefore = await fetchDashboardSnapshot();
if(!snapBefore) log("Aviso: não consegui snapshot inicial (resumo pode falhar).");

    // IMPORTAÇÃO
    log("Importando Dados...");
    let finishedImport = false;
    while(!finishedImport) {
      const res = await api('run_import', cicloCtx);
      if(!res || !res.ok) { log("Erro na importação."); break; }

      let textoImp = typeof res.msg === 'object' ? res.msg.msg : res.msg;
      log(textoImp);
      atualizarBarra(textoImp);

      if (typeof res.msg === 'object') finishedImport = res.msg.finished;
      else {
        if (textoImp.includes("Concluíd") || textoImp.includes("finalizad") || textoImp.includes("Nada a")) finishedImport = true;
        else if (!textoImp.includes("[")) finishedImport = true;
      }
    }
    atualizarBarra(null, 30);

    // ATUALIZAR DB
    log("Sincronizando Banco...");
    const resDb = await api('run_update_db', cicloCtx);
    if(resDb && resDb.ok) log(resDb.msg);
    atualizarBarra(null, 60);

    // DISTRIBUIR
    log("Gerando Filas...");
    const resDist = await api('run_distribute', cicloCtx);
    if(resDist && resDist.ok) log(resDist.msg);
    atualizarBarra(null, 80);

    // DEVOLUÇÃO
    log("Devolvendo Dados...");
    let finishedReturn = false;
    while(!finishedReturn) {
      const resRet = await api('run_return', cicloCtx);
      if(!resRet || !resRet.ok) { log("Erro na devolução."); break; }

      let textoRet = typeof resRet.msg === 'object' ? resRet.msg.msg : resRet.msg;
      log(textoRet);
      atualizarBarra(textoRet);

      if (textoRet.includes("Concluída") || textoRet.includes("Nada a")) finishedReturn = true;
    }

log("Capturando snapshot (depois)...");
const snapAfter = await fetchDashboardSnapshot();
if(!snapAfter) log("Aviso: não consegui snapshot final (resumo pode falhar).");

renderCycleSummary(snapBefore, snapAfter, Date.now() - t0);

    atualizarBarra(null, 100);
    log("CONCLUÍDO!");
    setTimeout(() => document.getElementById('box-prog').classList.add('hidden'), 5000);
  };

  // Botões manuais avançados (mantido do seu)
  document.querySelectorAll('.manual-action').forEach(btn => {
    btn.onclick = async function() {
      const acao = this.dataset.acao;
      const acaoCtx = createExecContext(acao);
      log(`ALVO: ${acaoCtx.alvo.nome} | ID: ${acaoCtx.execId}`);

      if (acao === 'run_import') {
        log("INICIANDO IMPORTAÇÃO MANUAL (LOOP)...");
        document.getElementById('box-prog').classList.remove('hidden');

        let finished = false;
        while(!finished) {
          const res = await api(acao, acaoCtx);
          if(!res || !res.ok) { log("Erro na importação."); break; }

          if(typeof res.msg === 'object') {
            finished = res.msg.finished;
            log(res.msg.msg);

            const match = res.msg.msg.match(/\[(\d+)\/(\d+)\]/);
            if(match) {
              const pct = ((match[1]/match[2])*100).toFixed(0);
              document.getElementById('bar-prog').style.width = pct + '%';
              document.getElementById('val-prog').innerText = pct + '%';
            }
          } else {
            log(res.msg);
            finished = true;
          }
        }

        log("IMPORTAÇÃO FINALIZADA.");
        setTimeout(() => document.getElementById('box-prog').classList.add('hidden'), 5000);

      } else if (acao === 'run_return') {
        log("INICIANDO DEVOLUÇÃO MANUAL (LOOP)...");
        document.getElementById('box-prog').classList.remove('hidden');

        let finishedRet = false;
        while(!finishedRet) {
          const resRet = await api(acao, acaoCtx);
          if(!resRet || !resRet.ok) { log("Erro na devolução."); break; }

          log(resRet.msg);
          if (resRet.msg === "Devolução Concluída!" || resRet.msg === "Nada a devolver.") finishedRet = true;
        }

        log("DEVOLUÇÃO FINALIZADA.");
        setTimeout(() => document.getElementById('box-prog').classList.add('hidden'), 5000);

      } else {
        log(`Executando ${acao}...`);
        const res = await api(acao, acaoCtx);
        if(res.ok) log(`Sucesso: ${res.msg || 'Ação concluída'}`);
        else log(`Erro: ${res.err}`);
      }
    };
  });
}

    function renderLogin(cEl, tipo) {
        cEl.innerHTML = `
            <div class="animate-fade" style="max-width:520px;margin:0 auto;">
                <div style="text-align:center;margin-bottom:32px;">
                    <div style="display:inline-flex;align-items:center;gap:8px;background:rgba(99,102,241,0.1);border:1px solid rgba(99,102,241,0.2);border-radius:999px;padding:6px 14px;margin-bottom:16px;">
                        <span class="material-symbols-rounded" style="font-size:14px;color:#818cf8;">${tipo==='esus'?'medical_services':'public'}</span>
                        <span style="font-size:10px;font-weight:800;color:#818cf8;text-transform:uppercase;letter-spacing:0.12em;">${tipo.toUpperCase()}</span>
                    </div>
                    <h2 style="font-size:26px;font-weight:900;color:white;font-style:italic;text-transform:uppercase;margin:0;">Autologin <span style="color:#818cf8;">${tipo.toUpperCase()}</span></h2>
                    <p style="font-size:11px;font-weight:700;color:#334155;text-transform:uppercase;letter-spacing:0.12em;margin-top:8px;">Configuração de Credenciais</p>
                </div>
                <div class="glass-card" style="padding:32px;">
                    <div style="position:relative;margin-bottom:16px;">
                        <div style="position:absolute;left:14px;top:50%;transform:translateY(-50%);z-index:1;pointer-events:none;">
                            <span class="material-symbols-rounded" style="font-size:18px;color:#475569;">person</span>
                        </div>
                        <input id="login-user" class="glass-input" style="padding-left:44px;" value="${GM_getValue(tipo+'_user', '')}" placeholder="Usuário / CPF">
                    </div>
                    <div style="position:relative;margin-bottom:28px;">
                        <div style="position:absolute;left:14px;top:50%;transform:translateY(-50%);z-index:1;pointer-events:none;">
                            <span class="material-symbols-rounded" style="font-size:18px;color:#475569;">lock</span>
                        </div>
                        <input id="login-pass" type="password" class="glass-input" style="padding-left:44px;" value="${GM_getValue(tipo+'_pass', '')}" placeholder="Senha">
                    </div>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                        <button id="save-creds" style="grid-column:span 2;background:linear-gradient(135deg,#6366f1,#818cf8);border:none;color:white;font-weight:800;padding:15px;border-radius:12px;cursor:pointer;font-size:11px;letter-spacing:0.15em;text-transform:uppercase;box-shadow:0 4px 20px rgba(99,102,241,0.3);transition:all 0.2s;">SALVAR CREDENCIAIS</button>
                        <a id="open-target" href="${tipo==='esus'?LINK_ESUS:LINK_EGESTOR}" target="_blank" class="glass-input" style="display:flex;align-items:center;justify-content:center;gap:6px;font-weight:700;border-radius:12px;cursor:pointer;font-size:10px;text-transform:uppercase;letter-spacing:0.1em;text-decoration:none;text-align:center;padding:12px;">
                            <span class="material-symbols-rounded" style="font-size:15px;">open_in_new</span> Abrir Site
                        </a>
                        <button id="copy-autologin" class="glass-input" style="display:flex;align-items:center;justify-content:center;gap:6px;font-weight:700;border-radius:12px;cursor:pointer;font-size:10px;text-transform:uppercase;letter-spacing:0.1em;">
                            <span class="material-symbols-rounded" style="font-size:15px;">link</span> Copiar Link
                        </button>
                    </div>
                </div>
            </div>
        `;
        cEl.querySelector('#save-creds').onclick = () => { GM_setValue(tipo+'_user', cEl.querySelector('#login-user').value); GM_setValue(tipo+'_pass', cEl.querySelector('#login-pass').value); window.showToast('Credenciais guardadas!'); };
        cEl.querySelector('#open-target').onclick = () => GM_setValue('login_time_window', Date.now() + 120000);
        cEl.querySelector('#copy-autologin').onclick = () => {
            const link = `${tipo==='esus'?LINK_ESUS:LINK_EGESTOR}#autologin=${codificarCredenciais(cEl.querySelector('#login-user').value, cEl.querySelector('#login-pass').value)}`;
            navigator.clipboard.writeText(link).then(() => window.showToast('Link copiado!'));
        };
    }

    // =============================================================================
    // 🧩 CONSTRUTOR DE PLANILHAS
    // =============================================================================
    function renderConstrutor(container) {
        const esc = (s) => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

        // ── API helper (reutiliza padrão do script) ─────────────────────────────
        const apiC = (action, extra) => new Promise(resolve => {
            const data = Object.entries(Object.assign({action, api_target:'panel', token:TOKEN_ACESSO}, extra||{}))
                .map(([k,v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v==null?'':String(v))}`).join('&');
            GM_xmlhttpRequest({
                method:'POST', url:URL_APPS_SCRIPT,
                headers:{'Content-Type':'application/x-www-form-urlencoded'}, data,
                onload:(r)=>{ try { resolve(JSON.parse(r.responseText)); } catch{ resolve({ok:false,err:'Resposta inválida'}); } },
                onerror:()=>resolve({ok:false,err:'Erro de rede'})
            });
        });

        // ── Estado ──────────────────────────────────────────────────────────────
        let templatesList = [];
        let tpl = null;          // template em edição
        let activeTab = 'layout';

        // ── Helpers de template ──────────────────────────────────────────────────
        const newBlocoId = () => 'bloco_' + Date.now();
        const newColId   = () => 'col_'   + Date.now();

        const clonePadrao = async () => {
            const res = await apiC('get_template', {id:'__padrao__'});
            if (!res || !res.ok) { window.showToast('Erro ao carregar modelo padrão.'); return null; }
            const t = JSON.parse(JSON.stringify(res.data));
            t.id   = 'tpl_' + Date.now();
            t.nome = 'Novo Template';
            return t;
        };

        // ── Render principal ─────────────────────────────────────────────────────
        container.innerHTML = `
        <div class="animate-fade" style="max-width:1280px;margin:0 auto;">
            <!-- Cabeçalho -->
            <div style="display:flex;align-items:flex-end;justify-content:space-between;border-bottom:1px solid rgba(255,255,255,0.05);padding-bottom:20px;margin-bottom:24px;">
                <div>
                    <h1 style="font-size:26px;font-weight:900;color:white;letter-spacing:-0.5px;font-style:italic;text-transform:uppercase;margin:0;">🧩 Construtor de Planilhas</h1>
                    <p style="font-size:12px;color:#475569;margin-top:6px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;">Crie e customize planilhas com layout visual padronizado</p>
                </div>
                <button id="cb-btn-novo" style="background:linear-gradient(135deg,#6366f1,#818cf8);border:none;color:white;font-weight:800;padding:12px 18px;border-radius:12px;cursor:pointer;font-size:10px;letter-spacing:0.12em;text-transform:uppercase;display:flex;align-items:center;gap:8px;">
                    <span class="material-symbols-rounded" style="font-size:16px;">add</span> NOVO TEMPLATE
                </button>
            </div>

            <!-- Layout: lista + editor -->
            <div style="display:grid;grid-template-columns:270px 1fr;gap:20px;align-items:start;">

                <!-- Sidebar: lista de templates -->
                <div>
                    <div style="font-size:9px;font-weight:800;color:#475569;text-transform:uppercase;letter-spacing:0.14em;margin-bottom:10px;">Templates Salvos</div>
                    <div id="cb-lista" style="display:flex;flex-direction:column;gap:8px;">
                        <div style="font-size:11px;color:#64748b;">Carregando...</div>
                    </div>
                    <button id="cb-btn-padrao" class="btn-glass" style="width:100%;margin-top:12px;font-size:10px;font-weight:800;letter-spacing:0.1em;text-transform:uppercase;display:flex;align-items:center;gap:6px;justify-content:center;">
                        <span class="material-symbols-rounded" style="font-size:15px;">restore</span> CARREGAR MODELO PADRÃO
                    </button>
                </div>

                <!-- Área do editor (preenchida dinamicamente) -->
                <div id="cb-editor">
                    <div style="display:flex;align-items:center;justify-content:center;min-height:400px;color:#475569;font-weight:700;font-size:13px;">
                        Selecione ou crie um template para editar.
                    </div>
                </div>
            </div>
        </div>`;

        // ── Renderiza lista lateral ──────────────────────────────────────────────
        const renderLista = () => {
            const el = document.getElementById('cb-lista');
            if (!el) return;
            if (!templatesList.length) {
                el.innerHTML = `<div style="font-size:11px;color:#64748b;font-weight:600;">Nenhum template salvo.</div>`;
                return;
            }
            el.innerHTML = templatesList.map(t => `
                <div data-tpl-id="${esc(t.id)}" class="cb-tpl-item glass-card"
                     style="padding:12px 14px;cursor:pointer;border-radius:14px;margin:0;border:1px solid ${tpl&&tpl.id===t.id?'rgba(99,102,241,0.6)':'rgba(255,255,255,0.06)'};">
                    <div style="font-size:11px;font-weight:800;color:${tpl&&tpl.id===t.id?'#818cf8':'#cbd5e1'};">${esc(t.nome)}</div>
                    <div style="font-size:9px;color:#475569;margin-top:3px;">${t.atualizadoEm ? new Date(t.atualizadoEm).toLocaleString() : ''}</div>
                </div>
            `).join('');
            el.querySelectorAll('.cb-tpl-item').forEach(item => {
                item.onclick = async () => {
                    const id = item.getAttribute('data-tpl-id');
                    const res = await apiC('get_template', {id});
                    if (!res || !res.ok) { window.showToast('Erro ao carregar template.'); return; }
                    tpl = JSON.parse(JSON.stringify(res.data));
                    renderLista();
                    renderEditor();
                };
            });
        };

        // ── Renderiza editor completo ────────────────────────────────────────────
        const renderEditor = () => {
            const el = document.getElementById('cb-editor');
            if (!el || !tpl) return;
            el.innerHTML = `
            <div>
                <!-- Nome + ações do template -->
                <div class="glass-card" style="padding:16px 20px;margin-bottom:16px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
                    <div style="flex:1;min-width:200px;">
                        <label style="font-size:9px;font-weight:800;color:#475569;text-transform:uppercase;letter-spacing:0.12em;display:block;margin-bottom:5px;">Nome do Template</label>
                        <input id="cb-tpl-nome" class="glass-input" value="${esc(tpl.nome||'')}" placeholder="Ex.: Mapa Vigência 1/2026">
                    </div>
                    <div style="display:flex;gap:8px;flex-shrink:0;">
                        <button id="cb-btn-salvar" style="background:linear-gradient(135deg,#6366f1,#818cf8);border:none;color:white;font-weight:800;padding:10px 14px;border-radius:10px;cursor:pointer;font-size:10px;letter-spacing:0.1em;text-transform:uppercase;">SALVAR</button>
                        <button id="cb-btn-duplicar" class="btn-glass" style="font-size:10px;font-weight:800;letter-spacing:0.1em;text-transform:uppercase;display:flex;align-items:center;gap:5px;"><span class="material-symbols-rounded" style="font-size:15px;">content_copy</span> DUPLICAR</button>
                        <button id="cb-btn-deletar" class="btn-glass" style="font-size:10px;font-weight:800;letter-spacing:0.1em;text-transform:uppercase;color:#fca5a5;border-color:rgba(239,68,68,0.35);display:flex;align-items:center;gap:5px;"><span class="material-symbols-rounded" style="font-size:15px;">delete</span> EXCLUIR</button>
                    </div>
                </div>

                <!-- Tabs -->
                <div style="display:flex;gap:4px;margin-bottom:16px;">
                    ${['layout','regras','acoes'].map(tab => `
                        <button id="cb-tab-${tab}" style="padding:9px 16px;border-radius:10px;border:1px solid ${activeTab===tab?'rgba(99,102,241,0.5)':'rgba(255,255,255,0.08)'};background:${activeTab===tab?'rgba(99,102,241,0.15)':'rgba(255,255,255,0.02)'};color:${activeTab===tab?'#818cf8':'#64748b'};font-size:10px;font-weight:900;letter-spacing:0.1em;text-transform:uppercase;cursor:pointer;">
                            ${{layout:'📐 LAYOUT',regras:'⚙️ REGRAS',acoes:'🚀 AÇÕES'}[tab]}
                        </button>
                    `).join('')}
                </div>

                <!-- Conteúdo da tab ativa -->
                <div id="cb-tab-content"></div>
            </div>`;

            // Bind: nome do template
            document.getElementById('cb-tpl-nome').oninput = (e) => { tpl.nome = e.target.value; };

            // Bind: salvar
            document.getElementById('cb-btn-salvar').onclick = async () => {
                tpl.nome = document.getElementById('cb-tpl-nome').value.trim() || tpl.nome;
                const btn = document.getElementById('cb-btn-salvar');
                btn.innerText = 'SALVANDO...'; btn.disabled = true;
                const res = await apiC('save_template', {template_json: JSON.stringify(tpl)});
                btn.innerText = 'SALVAR'; btn.disabled = false;
                if (!res || !res.ok) { window.showToast('Erro ao salvar: ' + (res&&res.err?res.err:'desconhecido')); return; }
                tpl.id = res.id || tpl.id;
                window.showToast('Template salvo!');
                await loadLista();
            };

            // Bind: duplicar
            document.getElementById('cb-btn-duplicar').onclick = async () => {
                const copia = JSON.parse(JSON.stringify(tpl));
                copia.id   = 'tpl_' + Date.now();
                copia.nome = (tpl.nome || 'Template') + ' (cópia)';
                const res = await apiC('save_template', {template_json: JSON.stringify(copia)});
                if (!res || !res.ok) { window.showToast('Erro ao duplicar.'); return; }
                tpl = copia;
                window.showToast('Template duplicado!');
                await loadLista();
                renderEditor();
            };

            // Bind: excluir
            document.getElementById('cb-btn-deletar').onclick = async () => {
                if (!confirm(`Excluir template "${tpl.nome}"?`)) return;
                await apiC('delete_template', {id: tpl.id});
                tpl = null;
                window.showToast('Template excluído.');
                await loadLista();
                document.getElementById('cb-editor').innerHTML = `<div style="display:flex;align-items:center;justify-content:center;min-height:400px;color:#475569;font-weight:700;font-size:13px;">Selecione ou crie um template.</div>`;
            };

            // Bind: tabs
            ['layout','regras','acoes'].forEach(tab => {
                const btn = document.getElementById('cb-tab-' + tab);
                if (btn) btn.onclick = () => { activeTab = tab; renderEditor(); };
            });

            renderTabContent();
        };

        // ── Conteúdo de cada tab ─────────────────────────────────────────────────
        const renderTabContent = () => {
            const el = document.getElementById('cb-tab-content');
            if (!el || !tpl) return;
            if (activeTab === 'layout')  renderTabLayout(el);
            if (activeTab === 'regras')  renderTabRegras(el);
            if (activeTab === 'acoes')   renderTabAcoes(el);
        };

        // ════════════════════════════════════════════════════════════════════════
        // TAB: LAYOUT
        // ════════════════════════════════════════════════════════════════════════
        const renderTabLayout = (el) => {
            const cfg = tpl.config || {};

            el.innerHTML = `
            <!-- Nome da aba + config geral -->
            <div class="glass-card" style="padding:18px 20px;margin-bottom:14px;">
                <div style="font-size:9px;font-weight:800;color:#475569;text-transform:uppercase;letter-spacing:0.14em;margin-bottom:14px;">Configuração Geral</div>
                <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:12px;align-items:end;">
                    <div style="grid-column:span 2;">
                        <label style="font-size:9px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.1em;display:block;margin-bottom:5px;">Nome da Aba (destino)</label>
                        <input id="cfg-nomeAba" class="glass-input" value="${esc(cfg.nomeAba||'')}" placeholder="Ex.: MAPA INDIVIDUALIZADO VIGÊNCIA 1/2026">
                    </div>
                    <div>
                        <label style="font-size:9px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.1em;display:block;margin-bottom:5px;">Altura cab. colunas (px)</label>
                        <input id="cfg-altCab" type="number" class="glass-input" value="${cfg.alturaLinhaCabecalho||46}" min="18" max="120">
                    </div>
                    <div>
                        <label style="font-size:9px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.1em;display:block;margin-bottom:5px;">Altura linhas dados (px)</label>
                        <input id="cfg-altDados" type="number" class="glass-input" value="${cfg.alturaLinhasDados||21}" min="14" max="80">
                    </div>
                    <div>
                        <label style="font-size:9px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.1em;display:block;margin-bottom:5px;">Congelar N linhas</label>
                        <input id="cfg-freeze" type="number" class="glass-input" value="${cfg.congelarLinhas||4}" min="0" max="20">
                    </div>
                    <div style="display:flex;align-items:center;gap:8px;padding-top:20px;">
                        <input type="checkbox" id="cfg-bordas" ${cfg.bordas!==false?'checked':''}>
                        <label for="cfg-bordas" style="font-size:10px;font-weight:700;color:#94a3b8;cursor:pointer;">Bordas</label>
                    </div>
                </div>
            </div>

            <!-- Faixas superiores -->
            <div class="glass-card" style="padding:18px 20px;margin-bottom:14px;">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
                    <div style="font-size:9px;font-weight:800;color:#475569;text-transform:uppercase;letter-spacing:0.14em;">Faixas do Cabeçalho</div>
                    <button id="btn-add-faixa" class="btn-glass" style="font-size:10px;font-weight:800;letter-spacing:0.1em;text-transform:uppercase;">+ FAIXA</button>
                </div>
                <div id="faixas-lista"></div>
            </div>

            <!-- Blocos e colunas -->
            <div class="glass-card" style="padding:18px 20px;">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
                    <div style="font-size:9px;font-weight:800;color:#475569;text-transform:uppercase;letter-spacing:0.14em;">Blocos e Colunas</div>
                    <button id="btn-add-bloco" class="btn-glass" style="font-size:10px;font-weight:800;letter-spacing:0.1em;text-transform:uppercase;">+ BLOCO</button>
                </div>
                <div id="blocos-lista"></div>
            </div>`;

            // Bind config geral
            document.getElementById('cfg-nomeAba').oninput  = (e) => { cfg.nomeAba = e.target.value; };
            document.getElementById('cfg-altCab').oninput   = (e) => { cfg.alturaLinhaCabecalho = parseInt(e.target.value)||46; };
            document.getElementById('cfg-altDados').oninput = (e) => { cfg.alturaLinhasDados = parseInt(e.target.value)||21; };
            document.getElementById('cfg-freeze').oninput   = (e) => { cfg.congelarLinhas = parseInt(e.target.value)||4; };
            document.getElementById('cfg-bordas').onchange  = (e) => { cfg.bordas = e.target.checked; };

            // ── Faixas ──────────────────────────────────────────────────────────
            const renderFaixas = () => {
                const fl = document.getElementById('faixas-lista');
                if (!fl) return;
                const faixas = cfg.faixas || [];
                if (!faixas.length) { fl.innerHTML = `<div style="font-size:11px;color:#64748b;">Nenhuma faixa. Clique em "+ FAIXA".</div>`; return; }
                fl.innerHTML = faixas.map((f,i) => `
                    <div style="display:grid;grid-template-columns:1fr 80px 80px 80px 30px auto;gap:8px;align-items:end;margin-bottom:10px;padding:10px;background:rgba(0,0,0,0.2);border-radius:10px;">
                        <div>
                            <div style="font-size:9px;font-weight:700;color:#64748b;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.1em;">Texto</div>
                            <input class="glass-input fx-texto" data-i="${i}" value="${esc(f.texto||'')}">
                        </div>
                        <div>
                            <div style="font-size:9px;font-weight:700;color:#64748b;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.1em;">Fundo</div>
                            <input type="color" class="fx-bg" data-i="${i}" value="${f.bgColor||'#1F3864'}" style="width:100%;height:36px;border:none;border-radius:8px;cursor:pointer;background:transparent;">
                        </div>
                        <div>
                            <div style="font-size:9px;font-weight:700;color:#64748b;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.1em;">Fonte</div>
                            <input type="color" class="fx-fc" data-i="${i}" value="${f.fontColor||'#FFFFFF'}" style="width:100%;height:36px;border:none;border-radius:8px;cursor:pointer;background:transparent;">
                        </div>
                        <div>
                            <div style="font-size:9px;font-weight:700;color:#64748b;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.1em;">Altura(px)</div>
                            <input type="number" class="glass-input fx-alt" data-i="${i}" value="${f.altura||28}" min="14" max="120">
                        </div>
                        <div style="padding-top:20px;">
                            <input type="checkbox" class="fx-neg" data-i="${i}" ${f.negrito!==false?'checked':''} title="Negrito">
                        </div>
                        <div style="display:flex;gap:4px;padding-top:16px;">
                            <button class="btn-glass fx-up" data-i="${i}" ${i===0?'disabled':''} style="padding:5px 8px;">↑</button>
                            <button class="btn-glass fx-dn" data-i="${i}" ${i===faixas.length-1?'disabled':''} style="padding:5px 8px;">↓</button>
                            <button class="btn-glass fx-del" data-i="${i}" style="padding:5px 8px;color:#fca5a5;border-color:rgba(239,68,68,0.35);">✕</button>
                        </div>
                    </div>
                `).join('');
                fl.querySelectorAll('.fx-texto').forEach(el => el.oninput  = (e)=>{ cfg.faixas[+e.target.dataset.i].texto = e.target.value; });
                fl.querySelectorAll('.fx-bg').forEach(el    => el.oninput  = (e)=>{ cfg.faixas[+e.target.dataset.i].bgColor = e.target.value; });
                fl.querySelectorAll('.fx-fc').forEach(el    => el.oninput  = (e)=>{ cfg.faixas[+e.target.dataset.i].fontColor = e.target.value; });
                fl.querySelectorAll('.fx-alt').forEach(el   => el.oninput  = (e)=>{ cfg.faixas[+e.target.dataset.i].altura = parseInt(e.target.value)||28; });
                fl.querySelectorAll('.fx-neg').forEach(el   => el.onchange = (e)=>{ cfg.faixas[+e.target.dataset.i].negrito = e.target.checked; });
                fl.querySelectorAll('.fx-up').forEach(el    => el.onclick  = (e)=>{ const i=+e.target.dataset.i; if(i>0){[cfg.faixas[i-1],cfg.faixas[i]]=[cfg.faixas[i],cfg.faixas[i-1]]; renderFaixas(); }});
                fl.querySelectorAll('.fx-dn').forEach(el    => el.onclick  = (e)=>{ const i=+e.target.dataset.i; if(i<cfg.faixas.length-1){[cfg.faixas[i+1],cfg.faixas[i]]=[cfg.faixas[i],cfg.faixas[i+1]]; renderFaixas(); }});
                fl.querySelectorAll('.fx-del').forEach(el   => el.onclick  = (e)=>{ cfg.faixas.splice(+e.target.dataset.i,1); renderFaixas(); });
            };
            document.getElementById('btn-add-faixa').onclick = () => {
                if (!cfg.faixas) cfg.faixas = [];
                cfg.faixas.push({texto:'Nova Faixa', bgColor:'#1F3864', fontColor:'#FFFFFF', negrito:true, altura:28});
                renderFaixas();
            };
            renderFaixas();

            // ── Blocos ──────────────────────────────────────────────────────────
            const renderBlocos = () => {
                const bl = document.getElementById('blocos-lista');
                if (!bl) return;
                const blocos = cfg.blocos || [];
                if (!blocos.length) { bl.innerHTML = `<div style="font-size:11px;color:#64748b;">Nenhum bloco. Clique em "+ BLOCO".</div>`; return; }
                bl.innerHTML = blocos.map((b,bi) => `
                    <div style="border:1px solid rgba(255,255,255,0.07);border-radius:14px;padding:14px;margin-bottom:12px;background:rgba(0,0,0,0.15);">
                        <!-- Header do bloco -->
                        <div style="display:grid;grid-template-columns:1fr 80px 80px auto;gap:8px;align-items:end;margin-bottom:12px;">
                            <div>
                                <div style="font-size:9px;font-weight:700;color:#64748b;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.1em;">Título do Bloco</div>
                                <input class="glass-input bl-titulo" data-bi="${bi}" value="${esc(b.titulo||'')}">
                            </div>
                            <div>
                                <div style="font-size:9px;font-weight:700;color:#64748b;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.1em;">Fundo</div>
                                <input type="color" class="bl-bg" data-bi="${bi}" value="${b.bgColor||'#4472C4'}" style="width:100%;height:36px;border:none;border-radius:8px;cursor:pointer;background:transparent;">
                            </div>
                            <div>
                                <div style="font-size:9px;font-weight:700;color:#64748b;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.1em;">Fonte</div>
                                <input type="color" class="bl-fc" data-bi="${bi}" value="${b.fontColor||'#FFFFFF'}" style="width:100%;height:36px;border:none;border-radius:8px;cursor:pointer;background:transparent;">
                            </div>
                            <div style="display:flex;gap:4px;padding-top:16px;">
                                <button class="btn-glass bl-up"  data-bi="${bi}" ${bi===0?'disabled':''} style="padding:5px 8px;">↑</button>
                                <button class="btn-glass bl-dn"  data-bi="${bi}" ${bi===blocos.length-1?'disabled':''} style="padding:5px 8px;">↓</button>
                                <button class="btn-glass bl-del" data-bi="${bi}" style="padding:5px 8px;color:#fca5a5;border-color:rgba(239,68,68,0.35);">✕</button>
                            </div>
                        </div>

                        <!-- Colunas do bloco -->
                        <div style="font-size:9px;font-weight:800;color:#475569;text-transform:uppercase;letter-spacing:0.12em;margin-bottom:8px;">Colunas do Bloco</div>
                        <div class="bl-cols-lista" data-bi="${bi}">
                        ${(b.colunas||[]).map((col,ci) => `
                            <div style="display:grid;grid-template-columns:40px 1fr 1fr 80px auto;gap:6px;align-items:end;margin-bottom:6px;">
                                <div style="font-size:9px;font-weight:700;color:#475569;text-align:center;padding-top:16px;">#${ci+1}</div>
                                <div>
                                    ${ci===0?'<div style="font-size:9px;font-weight:700;color:#64748b;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.1em;">ID (canônico)</div>':''}
                                    <input class="glass-input col-id" data-bi="${bi}" data-ci="${ci}" value="${esc(col.id||'')}">
                                </div>
                                <div>
                                    ${ci===0?'<div style="font-size:9px;font-weight:700;color:#64748b;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.1em;">Título (visível)</div>':''}
                                    <input class="glass-input col-tit" data-bi="${bi}" data-ci="${ci}" value="${esc(col.titulo||'')}">
                                </div>
                                <div>
                                    ${ci===0?'<div style="font-size:9px;font-weight:700;color:#64748b;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.1em;">Largura(px)</div>':''}
                                    <input type="number" class="glass-input col-larg" data-bi="${bi}" data-ci="${ci}" value="${col.largura||100}" min="30" max="500">
                                </div>
                                <div style="display:flex;gap:4px;${ci===0?'padding-top:16px;':''}">
                                    <button class="btn-glass col-up"  data-bi="${bi}" data-ci="${ci}" ${ci===0?'disabled':''} style="padding:4px 7px;">↑</button>
                                    <button class="btn-glass col-dn"  data-bi="${bi}" data-ci="${ci}" ${ci===(b.colunas||[]).length-1?'disabled':''} style="padding:4px 7px;">↓</button>
                                    <button class="btn-glass col-del" data-bi="${bi}" data-ci="${ci}" style="padding:4px 7px;color:#fca5a5;border-color:rgba(239,68,68,0.35);">✕</button>
                                </div>
                            </div>
                        `).join('')}
                        </div>
                        <button class="btn-glass bl-add-col" data-bi="${bi}" style="width:100%;margin-top:8px;font-size:10px;font-weight:800;letter-spacing:0.1em;text-transform:uppercase;">+ COLUNA</button>
                    </div>
                `).join('');

                // Bind: títulos e cores de bloco
                bl.querySelectorAll('.bl-titulo').forEach(el => el.oninput = (e)=>{ cfg.blocos[+e.target.dataset.bi].titulo = e.target.value; });
                bl.querySelectorAll('.bl-bg').forEach(el    => el.oninput = (e)=>{ cfg.blocos[+e.target.dataset.bi].bgColor = e.target.value; });
                bl.querySelectorAll('.bl-fc').forEach(el    => el.oninput = (e)=>{ cfg.blocos[+e.target.dataset.bi].fontColor = e.target.value; });

                // Bind: mover/excluir bloco
                bl.querySelectorAll('.bl-up').forEach(el => el.onclick = (e)=>{ const bi=+e.target.dataset.bi; if(bi>0){[cfg.blocos[bi-1],cfg.blocos[bi]]=[cfg.blocos[bi],cfg.blocos[bi-1]]; renderBlocos(); }});
                bl.querySelectorAll('.bl-dn').forEach(el => el.onclick = (e)=>{ const bi=+e.target.dataset.bi; if(bi<cfg.blocos.length-1){[cfg.blocos[bi+1],cfg.blocos[bi]]=[cfg.blocos[bi],cfg.blocos[bi+1]]; renderBlocos(); }});
                bl.querySelectorAll('.bl-del').forEach(el => el.onclick = (e)=>{ cfg.blocos.splice(+e.target.dataset.bi,1); renderBlocos(); });

                // Bind: colunas
                bl.querySelectorAll('.col-id').forEach(el  => el.oninput = (e)=>{ cfg.blocos[+e.target.dataset.bi].colunas[+e.target.dataset.ci].id = e.target.value; });
                bl.querySelectorAll('.col-tit').forEach(el => el.oninput = (e)=>{ cfg.blocos[+e.target.dataset.bi].colunas[+e.target.dataset.ci].titulo = e.target.value; });
                bl.querySelectorAll('.col-larg').forEach(el=> el.oninput = (e)=>{ cfg.blocos[+e.target.dataset.bi].colunas[+e.target.dataset.ci].largura = parseInt(e.target.value)||100; });
                bl.querySelectorAll('.col-up').forEach(el  => el.onclick = (e)=>{ const bi=+e.target.dataset.bi,ci=+e.target.dataset.ci; if(ci>0){const cols=cfg.blocos[bi].colunas;[cols[ci-1],cols[ci]]=[cols[ci],cols[ci-1]]; renderBlocos(); }});
                bl.querySelectorAll('.col-dn').forEach(el  => el.onclick = (e)=>{ const bi=+e.target.dataset.bi,ci=+e.target.dataset.ci; const cols=cfg.blocos[bi].colunas; if(ci<cols.length-1){[cols[ci+1],cols[ci]]=[cols[ci],cols[ci+1]]; renderBlocos(); }});
                bl.querySelectorAll('.col-del').forEach(el => el.onclick = (e)=>{ cfg.blocos[+e.target.dataset.bi].colunas.splice(+e.target.dataset.ci,1); renderBlocos(); });
                bl.querySelectorAll('.bl-add-col').forEach(el => el.onclick = (e)=>{ const bi=+e.target.dataset.bi; if(!cfg.blocos[bi].colunas) cfg.blocos[bi].colunas=[]; cfg.blocos[bi].colunas.push({id:'col_'+Date.now(),titulo:'Nova Coluna',largura:100}); renderBlocos(); });
            };

            document.getElementById('btn-add-bloco').onclick = () => {
                if (!cfg.blocos) cfg.blocos = [];
                cfg.blocos.push({id:'bloco_'+Date.now(), titulo:'Novo Bloco', bgColor:'#4472C4', fontColor:'#FFFFFF', colunas:[{id:'col_'+Date.now(),titulo:'Coluna 1',largura:100}]});
                renderBlocos();
            };
            renderBlocos();
        };

        // ════════════════════════════════════════════════════════════════════════
        // TAB: REGRAS
        // ════════════════════════════════════════════════════════════════════════
        const renderTabRegras = (el) => {
            el.innerHTML = `
            <!-- Validação de dados -->
            <div class="glass-card" style="padding:18px 20px;margin-bottom:14px;">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
                    <div>
                        <div style="font-size:9px;font-weight:800;color:#475569;text-transform:uppercase;letter-spacing:0.14em;">Validação de Dados (Dropdowns)</div>
                        <div style="font-size:10px;color:#64748b;margin-top:3px;">Cada regra restringe a entrada de uma coluna a uma lista de valores.</div>
                    </div>
                    <button id="btn-add-val" class="btn-glass" style="font-size:10px;font-weight:800;letter-spacing:0.1em;text-transform:uppercase;flex-shrink:0;">+ REGRA</button>
                </div>
                <div id="val-lista"></div>
            </div>

            <!-- Formatação condicional -->
            <div class="glass-card" style="padding:18px 20px;margin-bottom:14px;">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
                    <div>
                        <div style="font-size:9px;font-weight:800;color:#475569;text-transform:uppercase;letter-spacing:0.14em;">Formatação Condicional</div>
                        <div style="font-size:10px;color:#64748b;margin-top:3px;">Use fórmulas do Sheets (ex.: <code style="background:rgba(255,255,255,0.07);padding:1px 5px;border-radius:4px;">EXATO($A2,"SIM")</code>).</div>
                    </div>
                    <button id="btn-add-cf" class="btn-glass" style="font-size:10px;font-weight:800;letter-spacing:0.1em;text-transform:uppercase;flex-shrink:0;">+ REGRA</button>
                </div>
                <div id="cf-lista"></div>
            </div>

            <!-- Proteções -->
            <div class="glass-card" style="padding:18px 20px;">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
                    <div>
                        <div style="font-size:9px;font-weight:800;color:#475569;text-transform:uppercase;letter-spacing:0.14em;">Proteções de Coluna</div>
                        <div style="font-size:10px;color:#64748b;margin-top:3px;">Defina IDs de colunas separados por vírgula (ex.: <code style="background:rgba(255,255,255,0.07);padding:1px 5px;border-radius:4px;">nis,cns,nome</code>).</div>
                    </div>
                    <button id="btn-add-prot" class="btn-glass" style="font-size:10px;font-weight:800;letter-spacing:0.1em;text-transform:uppercase;flex-shrink:0;">+ PROTEÇÃO</button>
                </div>
                <div id="prot-lista"></div>
            </div>`;

            // ── Validações ────────────────────────────────────────────────────────
            const renderVal = () => {
                const vl = document.getElementById('val-lista');
                if (!vl) return;
                const regras = tpl.regrasValidacao || [];
                if (!regras.length) { vl.innerHTML = `<div style="font-size:11px;color:#64748b;">Nenhuma regra.</div>`; return; }
                vl.innerHTML = regras.map((r,i) => `
                    <div style="display:grid;grid-template-columns:1fr 2fr auto;gap:8px;align-items:center;margin-bottom:8px;">
                        <input class="glass-input v-colid" data-i="${i}" value="${esc(r.colId||'')}" placeholder="ID da coluna (ex.: acomp_us)">
                        <input class="glass-input v-vals"  data-i="${i}" value="${esc((r.valores||[]).join(', '))}" placeholder="Valores separados por vírgula">
                        <button class="btn-glass v-del" data-i="${i}" style="padding:5px 10px;color:#fca5a5;border-color:rgba(239,68,68,0.35);">✕</button>
                    </div>
                `).join('');
                vl.querySelectorAll('.v-colid').forEach(el => el.oninput = (e)=>{ tpl.regrasValidacao[+e.target.dataset.i].colId = e.target.value.trim(); });
                vl.querySelectorAll('.v-vals').forEach(el  => el.oninput = (e)=>{ tpl.regrasValidacao[+e.target.dataset.i].valores = e.target.value.split(',').map(v=>v.trim()).filter(Boolean); });
                vl.querySelectorAll('.v-del').forEach(el   => el.onclick = (e)=>{ tpl.regrasValidacao.splice(+e.target.dataset.i,1); renderVal(); });
            };
            document.getElementById('btn-add-val').onclick = () => {
                if (!tpl.regrasValidacao) tpl.regrasValidacao = [];
                tpl.regrasValidacao.push({colId:'', tipo:'lista', valores:[]});
                renderVal();
            };
            renderVal();

            // ── Formatação condicional ────────────────────────────────────────────
            const renderCF = () => {
                const cfl = document.getElementById('cf-lista');
                if (!cfl) return;
                const regras = tpl.formatacaoCondicional || [];
                if (!regras.length) { cfl.innerHTML = `<div style="font-size:11px;color:#64748b;">Nenhuma regra.</div>`; return; }
                cfl.innerHTML = regras.map((r,i) => `
                    <div style="display:grid;grid-template-columns:2fr 70px 70px 1fr auto;gap:8px;align-items:center;margin-bottom:8px;">
                        <input class="glass-input cf-form" data-i="${i}" value="${esc(r.formula||'')}" placeholder='Fórmula (ex.: EXATO($A2,"SIM"))'>
                        <input type="color" class="cf-bg"   data-i="${i}" value="${r.bgColor||'#FFFF00'}"   title="Cor de fundo"  style="height:36px;width:100%;border:none;border-radius:8px;cursor:pointer;background:transparent;">
                        <input type="color" class="cf-fc"   data-i="${i}" value="${r.fontColor||'#000000'}" title="Cor da fonte" style="height:36px;width:100%;border:none;border-radius:8px;cursor:pointer;background:transparent;">
                        <input class="glass-input cf-desc" data-i="${i}" value="${esc(r.descricao||'')}" placeholder="Descrição (opcional)">
                        <button class="btn-glass cf-del" data-i="${i}" style="padding:5px 10px;color:#fca5a5;border-color:rgba(239,68,68,0.35);">✕</button>
                    </div>
                `).join('');
                cfl.querySelectorAll('.cf-form').forEach(el => el.oninput = (e)=>{ tpl.formatacaoCondicional[+e.target.dataset.i].formula = e.target.value; });
                cfl.querySelectorAll('.cf-bg').forEach(el   => el.oninput = (e)=>{ tpl.formatacaoCondicional[+e.target.dataset.i].bgColor = e.target.value; });
                cfl.querySelectorAll('.cf-fc').forEach(el   => el.oninput = (e)=>{ tpl.formatacaoCondicional[+e.target.dataset.i].fontColor = e.target.value; });
                cfl.querySelectorAll('.cf-desc').forEach(el => el.oninput = (e)=>{ tpl.formatacaoCondicional[+e.target.dataset.i].descricao = e.target.value; });
                cfl.querySelectorAll('.cf-del').forEach(el  => el.onclick = (e)=>{ tpl.formatacaoCondicional.splice(+e.target.dataset.i,1); renderCF(); });
            };
            document.getElementById('btn-add-cf').onclick = () => {
                if (!tpl.formatacaoCondicional) tpl.formatacaoCondicional = [];
                tpl.formatacaoCondicional.push({formula:'', bgColor:'#FFFF00', fontColor:'#000000', descricao:''});
                renderCF();
            };
            renderCF();

            // ── Proteções ─────────────────────────────────────────────────────────
            const renderProt = () => {
                const pl = document.getElementById('prot-lista');
                if (!pl) return;
                const prots = tpl.protecoes || [];
                if (!prots.length) { pl.innerHTML = `<div style="font-size:11px;color:#64748b;">Nenhuma proteção.</div>`; return; }
                pl.innerHTML = prots.map((p,i) => `
                    <div style="display:grid;grid-template-columns:1fr 2fr auto;gap:8px;align-items:center;margin-bottom:8px;">
                        <input class="glass-input pt-cols" data-i="${i}" value="${esc((p.colIds||[]).join(', '))}" placeholder="IDs das colunas (ex.: nis, nome)">
                        <input class="glass-input pt-desc" data-i="${i}" value="${esc(p.descricao||'')}" placeholder="Descrição da proteção">
                        <button class="btn-glass pt-del" data-i="${i}" style="padding:5px 10px;color:#fca5a5;border-color:rgba(239,68,68,0.35);">✕</button>
                    </div>
                `).join('');
                pl.querySelectorAll('.pt-cols').forEach(el => el.oninput = (e)=>{ tpl.protecoes[+e.target.dataset.i].colIds = e.target.value.split(',').map(v=>v.trim()).filter(Boolean); });
                pl.querySelectorAll('.pt-desc').forEach(el => el.oninput = (e)=>{ tpl.protecoes[+e.target.dataset.i].descricao = e.target.value; });
                pl.querySelectorAll('.pt-del').forEach(el  => el.onclick = (e)=>{ tpl.protecoes.splice(+e.target.dataset.i,1); renderProt(); });
            };
            document.getElementById('btn-add-prot').onclick = () => {
                if (!tpl.protecoes) tpl.protecoes = [];
                tpl.protecoes.push({tipo:'coluna', colIds:[], descricao:''});
                renderProt();
            };
            renderProt();
        };

        // ════════════════════════════════════════════════════════════════════════
        // TAB: AÇÕES
        // ════════════════════════════════════════════════════════════════════════
        const renderTabAcoes = (el) => {
            const totalCols = (tpl.config&&tpl.config.blocos||[]).reduce((s,b)=>s+(b.colunas||[]).length,0);
            const numBlocos = (tpl.config&&tpl.config.blocos||[]).length;
            const numFaixas = (tpl.config&&tpl.config.faixas||[]).length;
            const numVal    = (tpl.regrasValidacao||[]).length;
            const numCF     = (tpl.formatacaoCondicional||[]).length;
            const numProt   = (tpl.protecoes||[]).length;

            el.innerHTML = `
            <!-- Prévia do template -->
            <div class="glass-card" style="padding:18px 20px;margin-bottom:14px;">
                <div style="font-size:9px;font-weight:800;color:#475569;text-transform:uppercase;letter-spacing:0.14em;margin-bottom:14px;">Pré-Visualização da Estrutura</div>
                <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;">
                    <div class="glass-card" style="padding:10px 14px;margin:0;text-align:center;min-width:100px;">
                        <div style="font-size:22px;font-weight:900;color:#818cf8;">${numFaixas}</div>
                        <div style="font-size:9px;color:#475569;text-transform:uppercase;letter-spacing:0.1em;margin-top:3px;">Faixas</div>
                    </div>
                    <div class="glass-card" style="padding:10px 14px;margin:0;text-align:center;min-width:100px;">
                        <div style="font-size:22px;font-weight:900;color:#818cf8;">${numBlocos}</div>
                        <div style="font-size:9px;color:#475569;text-transform:uppercase;letter-spacing:0.1em;margin-top:3px;">Blocos</div>
                    </div>
                    <div class="glass-card" style="padding:10px 14px;margin:0;text-align:center;min-width:100px;">
                        <div style="font-size:22px;font-weight:900;color:#818cf8;">${totalCols}</div>
                        <div style="font-size:9px;color:#475569;text-transform:uppercase;letter-spacing:0.1em;margin-top:3px;">Colunas</div>
                    </div>
                    <div class="glass-card" style="padding:10px 14px;margin:0;text-align:center;min-width:100px;">
                        <div style="font-size:22px;font-weight:900;color:#34d399;">${numVal}</div>
                        <div style="font-size:9px;color:#475569;text-transform:uppercase;letter-spacing:0.1em;margin-top:3px;">Validações</div>
                    </div>
                    <div class="glass-card" style="padding:10px 14px;margin:0;text-align:center;min-width:100px;">
                        <div style="font-size:22px;font-weight:900;color:#fbbf24;">${numCF}</div>
                        <div style="font-size:9px;color:#475569;text-transform:uppercase;letter-spacing:0.1em;margin-top:3px;">Cond. Formatos</div>
                    </div>
                    <div class="glass-card" style="padding:10px 14px;margin:0;text-align:center;min-width:100px;">
                        <div style="font-size:22px;font-weight:900;color:#f87171;">${numProt}</div>
                        <div style="font-size:9px;color:#475569;text-transform:uppercase;letter-spacing:0.1em;margin-top:3px;">Proteções</div>
                    </div>
                </div>

                <!-- Preview visual mini dos blocos -->
                <div style="overflow-x:auto;padding-bottom:4px;">
                    <div style="display:inline-flex;gap:0;border:1px solid rgba(255,255,255,0.1);border-radius:8px;overflow:hidden;min-width:100%;">
                        ${(tpl.config&&tpl.config.blocos||[]).map(b=>`
                            <div style="flex-shrink:0;padding:6px 10px;background:${esc(b.bgColor||'#4472C4')}22;border-right:1px solid rgba(255,255,255,0.07);text-align:center;">
                                <div style="font-size:9px;font-weight:800;color:${esc(b.bgColor||'#4472C4')};text-transform:uppercase;white-space:nowrap;">${esc(b.titulo||'')}</div>
                                <div style="font-size:8px;color:#64748b;margin-top:3px;">${(b.colunas||[]).length} col.</div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>

            <!-- Criar nova planilha -->
            <div class="glass-card" style="padding:18px 20px;margin-bottom:14px;border:1px solid rgba(16,185,129,0.2);background:rgba(16,185,129,0.03);">
                <div style="font-size:9px;font-weight:800;color:#475569;text-transform:uppercase;letter-spacing:0.14em;margin-bottom:14px;">🆕 Criar Nova Planilha Google Sheets</div>
                <div style="display:grid;grid-template-columns:1fr auto;gap:12px;align-items:end;">
                    <div>
                        <label style="font-size:9px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.1em;display:block;margin-bottom:5px;">Nome da Nova Aba (deixe em branco para usar o nome configurado no layout)</label>
                        <input id="acao-nome-nova" class="glass-input" placeholder="${esc(tpl.config&&tpl.config.nomeAba||'MAPA INDIVIDUALIZADO')}">
                    </div>
                    <button id="btn-criar-nova" style="background:linear-gradient(135deg,rgba(16,185,129,0.15),rgba(16,185,129,0.08));border:1px solid rgba(16,185,129,0.35);color:#34d399;font-weight:800;padding:12px 18px;border-radius:12px;cursor:pointer;font-size:10px;letter-spacing:0.12em;text-transform:uppercase;white-space:nowrap;display:flex;align-items:center;gap:7px;">
                        <span class="material-symbols-rounded" style="font-size:17px;">add_chart</span> CRIAR PLANILHA
                    </button>
                </div>
                <div id="acao-nova-result" style="margin-top:10px;font-size:11px;color:#64748b;"></div>
            </div>

            <!-- Aplicar em aba existente -->
            <div class="glass-card" style="padding:18px 20px;margin-bottom:14px;border:1px solid rgba(245,158,11,0.2);background:rgba(245,158,11,0.03);">
                <div style="font-size:9px;font-weight:800;color:#475569;text-transform:uppercase;letter-spacing:0.14em;margin-bottom:4px;">⚡ Aplicar Template em Planilha Existente</div>
                <div style="font-size:10px;color:#fbbf24;margin-bottom:14px;font-weight:700;">⚠️ Atenção: isso irá SUBSTITUIR o conteúdo, formato, validações e proteções da aba de destino.</div>
                <div style="display:grid;grid-template-columns:1fr 1fr auto;gap:12px;align-items:end;">
                    <div>
                        <label style="font-size:9px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.1em;display:block;margin-bottom:5px;">ID ou URL da Planilha de Destino</label>
                        <input id="acao-ss-id" class="glass-input" placeholder="Cole o link ou ID da planilha aqui">
                    </div>
                    <div>
                        <label style="font-size:9px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.1em;display:block;margin-bottom:5px;">Nome da Aba (deixe em branco para usar o padrão)</label>
                        <input id="acao-nome-aba" class="glass-input" placeholder="${esc(tpl.config&&tpl.config.nomeAba||'')}">
                    </div>
                    <button id="btn-aplicar-existente" style="background:linear-gradient(135deg,rgba(245,158,11,0.15),rgba(245,158,11,0.06));border:1px solid rgba(245,158,11,0.35);color:#fbbf24;font-weight:800;padding:12px 18px;border-radius:12px;cursor:pointer;font-size:10px;letter-spacing:0.12em;text-transform:uppercase;white-space:nowrap;display:flex;align-items:center;gap:7px;">
                        <span class="material-symbols-rounded" style="font-size:17px;">drive_file_move</span> APLICAR
                    </button>
                </div>
                <div id="acao-exist-result" style="margin-top:10px;font-size:11px;color:#64748b;"></div>
            </div>

            <!-- Exportar / Importar JSON -->
            <div class="glass-card" style="padding:18px 20px;">
                <div style="font-size:9px;font-weight:800;color:#475569;text-transform:uppercase;letter-spacing:0.14em;margin-bottom:14px;">📋 Exportar / Importar Configuração (JSON)</div>
                <textarea id="acao-json" style="width:100%;min-height:120px;background:rgba(0,0,0,0.35);border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:10px;font-size:11px;color:#e2e8f0;font-family:monospace;resize:vertical;">${esc(JSON.stringify(tpl, null, 2))}</textarea>
                <div style="display:flex;gap:8px;margin-top:8px;">
                    <button id="btn-copy-json" class="btn-glass" style="font-size:10px;font-weight:800;letter-spacing:0.1em;text-transform:uppercase;display:flex;align-items:center;gap:6px;">
                        <span class="material-symbols-rounded" style="font-size:15px;">content_copy</span> COPIAR JSON
                    </button>
                    <button id="btn-import-json" class="btn-glass" style="font-size:10px;font-weight:800;letter-spacing:0.1em;text-transform:uppercase;display:flex;align-items:center;gap:6px;">
                        <span class="material-symbols-rounded" style="font-size:15px;">upload</span> IMPORTAR DO JSON
                    </button>
                </div>
            </div>`;

            // Bind: criar nova planilha
            document.getElementById('btn-criar-nova').onclick = async () => {
                const btn = document.getElementById('btn-criar-nova');
                const resEl = document.getElementById('acao-nova-result');
                const nomeAba = document.getElementById('acao-nome-nova').value.trim() || null;
                btn.innerText = 'CRIANDO...'; btn.disabled = true;
                resEl.style.color = '#94a3b8';
                resEl.innerText = 'Aguarde, criando planilha no Google Drive...';
                const res = await apiC('create_sheet_from_template', {
                    template_json: JSON.stringify(tpl),
                    nome_aba: nomeAba || ''
                });
                btn.disabled = false;
                btn.innerHTML = '<span class="material-symbols-rounded" style="font-size:17px;">add_chart</span> CRIAR PLANILHA';
                if (!res || !res.ok) {
                    resEl.style.color = '#f87171';
                    resEl.innerText = '❌ Erro: ' + (res&&res.err ? res.err : 'desconhecido');
                    return;
                }
                resEl.style.color = '#34d399';
                resEl.innerHTML = `✅ Planilha criada com sucesso! <a href="${esc(res.data&&res.data.spreadsheetUrl||'')}" target="_blank" style="color:#818cf8;font-weight:800;">Abrir no Drive ↗</a>`;
                window.showToast('Planilha criada!');
            };

            // Bind: aplicar em existente
            document.getElementById('btn-aplicar-existente').onclick = async () => {
                const btn = document.getElementById('btn-aplicar-existente');
                const resEl = document.getElementById('acao-exist-result');
                const ssRaw = document.getElementById('acao-ss-id').value.trim();
                const nomeAba = document.getElementById('acao-nome-aba').value.trim() || null;
                if (!ssRaw) { window.showToast('Informe o ID/URL da planilha de destino.'); return; }
                // Extrai ID do link
                const ssMatch = ssRaw.match(/[-\w]{25,}/);
                const ssId = ssMatch ? ssMatch[0] : ssRaw;
                if (!confirm('⚠️ Aplicar template na planilha "' + ssId + '"? O conteúdo da aba será substituído.')) return;
                btn.innerText = 'APLICANDO...'; btn.disabled = true;
                resEl.style.color = '#94a3b8';
                resEl.innerText = 'Aguarde, aplicando layout na planilha...';
                const res = await apiC('create_sheet_from_template', {
                    template_json: JSON.stringify(tpl),
                    spreadsheet_id: ssId,
                    nome_aba: nomeAba || ''
                });
                btn.disabled = false;
                btn.innerHTML = '<span class="material-symbols-rounded" style="font-size:17px;">drive_file_move</span> APLICAR';
                if (!res || !res.ok) {
                    resEl.style.color = '#f87171';
                    resEl.innerText = '❌ Erro: ' + (res&&res.err ? res.err : 'desconhecido');
                    return;
                }
                resEl.style.color = '#34d399';
                resEl.innerHTML = `✅ Template aplicado! <a href="${esc(res.data&&res.data.spreadsheetUrl||'')}" target="_blank" style="color:#818cf8;font-weight:800;">Abrir planilha ↗</a>`;
                window.showToast('Template aplicado com sucesso!');
            };

            // Bind: copiar JSON
            document.getElementById('btn-copy-json').onclick = () => {
                const txt = JSON.stringify(tpl, null, 2);
                navigator.clipboard.writeText(txt).then(() => window.showToast('JSON copiado!'));
            };

            // Bind: importar JSON
            document.getElementById('btn-import-json').onclick = () => {
                try {
                    const raw = document.getElementById('acao-json').value;
                    const parsed = JSON.parse(raw);
                    if (!parsed.config) { window.showToast('JSON inválido: falta "config".'); return; }
                    if (!confirm('Substituir template atual pelo JSON colado? Salve antes para não perder alterações.')) return;
                    tpl = parsed;
                    renderEditor();
                    window.showToast('Template importado!');
                } catch(e) {
                    window.showToast('JSON inválido: ' + e.message);
                }
            };
        };

        // ── Carregar lista de templates ──────────────────────────────────────────
        const loadLista = async () => {
            const res = await apiC('list_templates');
            templatesList = (res && res.ok && Array.isArray(res.data)) ? res.data : [];
            renderLista();
        };

        // ── Botão: Novo template ─────────────────────────────────────────────────
        document.getElementById('cb-btn-novo').onclick = async () => {
            const t = await clonePadrao();
            if (!t) return;
            tpl = t;
            renderLista();
            renderEditor();
        };

        // ── Botão: Carregar modelo padrão ────────────────────────────────────────
        document.getElementById('cb-btn-padrao').onclick = async () => {
            const res = await apiC('get_template', {id:'__padrao__'});
            if (!res || !res.ok) { window.showToast('Erro ao carregar modelo padrão.'); return; }
            tpl = JSON.parse(JSON.stringify(res.data));
            tpl.id   = 'tpl_copia_padrao_' + Date.now();
            tpl.nome = 'Modelo Padrão (cópia)';
            renderLista();
            renderEditor();
            window.showToast('Modelo padrão carregado. Clique em SALVAR para guardar.');
        };

        // Carga inicial
        loadLista();
    }

    // =============================================================================
    // 🏭 PIPELINE — CRIAÇÃO DE PLANILHAS POR UNIDADE DE SAÚDE
    // =============================================================================
    function renderPipeline(container) {
        const apiP = (action, extra) => new Promise(resolve => {
            const data = Object.entries(Object.assign({ action, api_target: 'panel', token: TOKEN_ACESSO }, extra || {}))
                .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v == null ? '' : String(v))}`).join('&');
            GM_xmlhttpRequest({
                method: 'POST', url: URL_APPS_SCRIPT,
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, data,
                onload: (r) => { try { resolve(JSON.parse(r.responseText)); } catch { resolve({ ok: false, err: 'Resposta inválida' }); } },
                onerror: () => resolve({ ok: false, err: 'Erro de rede' })
            });
        });

        container.innerHTML = `
        <div class="animate-fade" style="max-width:860px;margin:0 auto;">
            <div style="margin-bottom:28px;border-bottom:1px solid rgba(255,255,255,0.05);padding-bottom:18px;">
                <h2 style="font-size:26px;font-weight:900;color:white;letter-spacing:-0.5px;font-style:italic;text-transform:uppercase;margin:0;">Gerador de Mapas</h2>
                <p style="font-size:12px;color:#475569;margin-top:6px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;">Descarregar Mapas • Criar • Distribuir • Corrigir Validações</p>
            </div>

            <!-- ── ETAPA 0: DESCARREGAR MAPAS ── -->
            <div class="glass-card" style="padding:20px 22px;margin-bottom:16px;border:1px solid rgba(16,185,129,0.2);">
                <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">
                    <div style="width:38px;height:38px;background:rgba(16,185,129,0.12);border-radius:10px;display:flex;align-items:center;justify-content:center;border:1px solid rgba(16,185,129,0.2);flex-shrink:0;">
                        <span class="material-symbols-rounded" style="font-size:20px;color:#34d399;">upload_file</span>
                    </div>
                    <div>
                        <div style="font-size:11px;font-weight:900;color:#34d399;text-transform:uppercase;letter-spacing:0.12em;">Etapa 0 · Descarregar Mapas</div>
                        <div style="font-size:10px;color:#475569;margin-top:2px;">Envie os arquivos .xls baixados do portal BFA para processar os dados aqui, sem precisar do Colab.</div>
                    </div>
                </div>

                <!-- Passo A: Baixar no portal BFA -->
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;padding:10px 12px;background:rgba(16,185,129,0.05);border-radius:10px;border:1px solid rgba(16,185,129,0.12);">
                    <div style="flex:1;min-width:0;">
                        <div style="font-size:9px;font-weight:800;color:#475569;text-transform:uppercase;letter-spacing:0.1em;">Passo A · Baixar no portal BFA</div>
                        <div id="bfa-mapa-status-label" style="font-size:9px;color:#475569;margin-top:3px;">Abre o site BFA e inicia o download automático dos mapas.</div>
                    </div>
                    <button id="btn-baixar-mapas-bfa"
                        style="flex-shrink:0;margin-left:12px;padding:8px 13px;border-radius:10px;border:1px solid rgba(16,185,129,0.3);background:rgba(16,185,129,0.12);color:#34d399;font-size:9px;font-weight:900;letter-spacing:0.1em;text-transform:uppercase;cursor:pointer;display:flex;align-items:center;gap:5px;">
                        <span class="material-symbols-rounded" style="font-size:13px;">open_in_new</span>
                        BAIXAR MAPAS
                    </button>
                </div>

                <!-- Passo B: enviar arquivos -->
                <div style="font-size:9px;font-weight:800;color:#475569;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:10px;">Passo B · Envie os arquivos baixados</div>

                <!-- Área de drag-and-drop -->
                <div id="ingest-dropzone"
                    style="border:2px dashed rgba(16,185,129,0.3);border-radius:14px;padding:28px 20px;text-align:center;cursor:pointer;transition:all 0.2s;margin-bottom:12px;background:rgba(16,185,129,0.03);">
                    <span class="material-symbols-rounded" style="font-size:32px;color:rgba(16,185,129,0.4);display:block;margin-bottom:8px;">cloud_upload</span>
                    <div style="font-size:12px;font-weight:700;color:#94a3b8;">Arraste os arquivos .xls aqui</div>
                    <div style="font-size:10px;color:#475569;margin-top:4px;">ou clique para selecionar • .xls / .html / .htm</div>
                    <input id="ingest-file-input" type="file" multiple accept=".xls,.html,.htm" style="display:none;">
                </div>

                <!-- Lista de arquivos selecionados -->
                <div id="ingest-file-list" style="margin-bottom:12px;"></div>

                <!-- Botão processar -->
                <button id="btn-ingest-process" disabled
                    style="width:100%;padding:13px;border-radius:12px;border:1px solid rgba(16,185,129,0.3);background:rgba(16,185,129,0.1);color:#34d399;font-size:10px;font-weight:900;letter-spacing:0.14em;text-transform:uppercase;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;transition:opacity 0.2s;">
                    <span id="btn-ingest-icon" class="material-symbols-rounded" style="font-size:16px;">send</span>
                    <span id="btn-ingest-label">SELECIONE OS ARQUIVOS ACIMA</span>
                </button>

                <!-- Status do último envio -->
                <div id="ingest-last-status" style="margin-top:10px;font-size:10px;color:#475569;text-align:center;min-height:16px;"></div>
            </div>

            <!-- STATUS DOS CHECKPOINTS -->
            <div class="glass-card" style="padding:18px 20px;margin-bottom:16px;border:1px solid rgba(99,102,241,0.15);">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
                    <div style="font-size:9px;font-weight:900;color:#475569;text-transform:uppercase;letter-spacing:0.14em;">Estado atual das etapas</div>
                    <button id="btn-pipeline-refresh" class="btn-glass" style="padding:8px 12px;font-size:9px;font-weight:800;letter-spacing:0.1em;text-transform:uppercase;border-radius:10px;">
                        <span class="material-symbols-rounded" style="font-size:14px;vertical-align:middle;">refresh</span> Atualizar
                    </button>
                </div>
                <div id="pipeline-status" style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;">
                    ${['Etapa 1 · Criar', 'Etapa 2 · Distribuir', 'Etapa 3 · Validações'].map((l, i) => `
                    <div class="glass-card" style="margin:0;padding:14px;text-align:center;border:1px solid rgba(255,255,255,0.05);">
                        <div style="font-size:9px;font-weight:800;color:#475569;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:8px;">${l}</div>
                        <div id="ps-fase-${i}" style="font-size:12px;font-weight:900;color:#94a3b8;">--</div>
                        <div id="ps-prog-${i}" style="font-size:10px;color:#475569;margin-top:4px;">--</div>
                    </div>`).join('')}
                </div>
            </div>

            <!-- PIPELINE COMPLETO -->
            <button id="btn-pipeline-full" class="btn-sync-main"
                style="width:100%;background:linear-gradient(135deg,rgba(99,102,241,0.12),rgba(99,102,241,0.06));border:1px solid rgba(99,102,241,0.25);border-radius:20px;padding:24px 28px;display:flex;align-items:center;justify-content:space-between;cursor:pointer;margin-bottom:14px;">
                <div style="display:flex;align-items:center;gap:18px;">
                    <div style="width:52px;height:52px;background:rgba(99,102,241,0.15);border-radius:14px;display:flex;align-items:center;justify-content:center;border:1px solid rgba(99,102,241,0.2);flex-shrink:0;">
                        <span class="material-symbols-rounded" style="font-size:28px;color:#818cf8;">account_tree</span>
                    </div>
                    <div style="text-align:left;">
                        <div style="font-size:18px;font-weight:900;color:white;font-style:italic;text-transform:uppercase;letter-spacing:-0.3px;">Executar Pipeline Completo</div>
                        <div id="pipeline-full-hint" style="font-size:10px;color:#818cf8;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;margin-top:4px;">Criar • Distribuir • Corrigir Validações</div>
                    </div>
                </div>
                <span class="material-symbols-rounded" style="font-size:26px;color:rgba(99,102,241,0.4);flex-shrink:0;">chevron_right</span>
            </button>

            <!-- ETAPAS INDIVIDUAIS -->
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:16px;">
                ${[
                    { id: 'criar',      label: '1. Criar Planilhas',    icon: 'add_chart',     color: '#34d399', action: 'run_etapa_criar' },
                    { id: 'distribuir', label: '2. Distribuir Regiões', icon: 'move_location', color: '#60a5fa', action: 'run_etapa_distribuir' },
                    { id: 'validacoes', label: '3. Corrigir Validações',icon: 'rule_settings', color: '#f59e0b', action: 'run_etapa_validacoes' }
                ].map(b => `
                <button data-action="${b.action}" class="pipeline-etapa btn-action-card glass-card"
                    style="margin:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:20px 12px;cursor:pointer;border:1px solid rgba(255,255,255,0.05);">
                    <div style="width:44px;height:44px;background:${b.color}18;border-radius:12px;display:flex;align-items:center;justify-content:center;border:1px solid ${b.color}30;">
                        <span class="material-symbols-rounded" style="font-size:22px;color:${b.color};">${b.icon}</span>
                    </div>
                    <div style="font-size:9px;font-weight:800;color:#475569;text-transform:uppercase;letter-spacing:0.1em;text-align:center;">${b.label}</div>
                </button>`).join('')}
            </div>

            <!-- LOG + RESET -->
            <div id="pipeline-log" class="glass-card"
                style="padding:14px 18px;background:rgba(0,0,0,0.55);height:140px;font-family:'Courier New',monospace;font-size:11px;overflow-y:auto;color:#34d399;border:1px solid rgba(16,185,129,0.1);border-radius:16px;margin-bottom:12px;">
                > PIPELINE PRONTO.
            </div>

            <button id="btn-pipeline-reset" class="btn-glass"
                style="width:100%;padding:12px;font-size:9px;font-weight:800;letter-spacing:0.14em;text-transform:uppercase;border-radius:12px;color:#f87171;border-color:rgba(239,68,68,0.25);">
                <span class="material-symbols-rounded" style="font-size:14px;vertical-align:middle;">restart_alt</span> Resetar Checkpoints
            </button>

            <!-- RESULTADOS / LINKS DAS PASTAS -->
            <div class="glass-card" style="padding:18px 20px;margin-top:16px;border:1px solid rgba(99,102,241,0.15);">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                    <div style="font-size:9px;font-weight:900;color:#475569;text-transform:uppercase;letter-spacing:0.14em;">Resultados · Links das Planilhas</div>
                    <button id="btn-pipeline-results" class="btn-glass" style="padding:8px 12px;font-size:9px;font-weight:800;letter-spacing:0.1em;text-transform:uppercase;border-radius:10px;">
                        <span class="material-symbols-rounded" style="font-size:14px;vertical-align:middle;">folder_open</span> Carregar Links
                    </button>
                </div>
                <div id="pipeline-results-list" style="font-size:10px;color:#94a3b8;">
                    Clique em "Carregar Links" após o pipeline para ver os arquivos gerados e suas pastas.
                </div>
            </div>
        </div>`;

        const logEl = document.getElementById('pipeline-log');
        const log = (msg) => {
            logEl.innerHTML += `<div>[${new Date().toLocaleTimeString()}] ${msg}</div>`;
            logEl.scrollTop = logEl.scrollHeight;
        };

        const setButtonsDisabled = (disabled) => {
            [document.getElementById('btn-pipeline-full'), ...document.querySelectorAll('.pipeline-etapa')]
                .forEach(el => { if (el) el.disabled = disabled; });
        };

        const refreshStatus = async () => {
            const res = await apiP('get_pipeline_status');
            if (!res || !res.ok || !res.data) return;
            const s = res.data;
            const etapas = ['criar', 'distribuir', 'validacoes'];
            etapas.forEach((k, i) => {
                const fase = s[k] ? s[k].fase : 'NAO_INICIADO';
                const prog = s[k] ? s[k].progresso : '0/0';
                const el = document.getElementById('ps-fase-' + i);
                const ep = document.getElementById('ps-prog-' + i);
                if (el) {
                    const color = fase === 'CONCLUIDO' ? '#34d399' : fase === 'PROCESSAMENTO' ? '#fbbf24' : '#64748b';
                    el.style.color = color;
                    el.textContent = fase.replace('_', ' ');
                }
                if (ep) ep.textContent = prog;
            });
        };

        // ── Ingestão de Mapas ────────────────────────────────────────────────

        let arquivosPendentes = [];

        const dropzone    = document.getElementById('ingest-dropzone');
        const fileInput   = document.getElementById('ingest-file-input');
        const fileListEl  = document.getElementById('ingest-file-list');
        const btnProcess  = document.getElementById('btn-ingest-process');
        const btnLabel    = document.getElementById('btn-ingest-label');
        const btnIcon     = document.getElementById('btn-ingest-icon');
        const lastStatus  = document.getElementById('ingest-last-status');
        const hintEl      = document.getElementById('pipeline-full-hint');

        const EXT_OK = /\.(xls|html|htm)$/i;

        function atualizarListaArquivos() {
            if (arquivosPendentes.length === 0) {
                fileListEl.innerHTML = '';
                btnProcess.disabled = true;
                btnLabel.textContent = 'SELECIONE OS ARQUIVOS ACIMA';
                return;
            }
            fileListEl.innerHTML = arquivosPendentes.map((f, idx) =>
                `<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 10px;margin-bottom:4px;background:rgba(255,255,255,0.04);border-radius:8px;border:1px solid rgba(255,255,255,0.06);">
                    <span style="font-size:10px;color:#94a3b8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:75%;">
                        <span class="material-symbols-rounded" style="font-size:12px;vertical-align:middle;color:#34d399;margin-right:4px;">description</span>${f.name}
                    </span>
                    <span style="font-size:9px;color:#475569;flex-shrink:0;margin-left:8px;">${(f.size/1024).toFixed(0)} KB
                        <span data-rm="${idx}" style="cursor:pointer;color:#f87171;margin-left:6px;" title="Remover">✕</span>
                    </span>
                </div>`
            ).join('');
            fileListEl.querySelectorAll('[data-rm]').forEach(btn => {
                btn.onclick = () => {
                    arquivosPendentes.splice(parseInt(btn.dataset.rm), 1);
                    atualizarListaArquivos();
                };
            });
            btnProcess.disabled = false;
            btnLabel.textContent = `PROCESSAR ${arquivosPendentes.length} ARQUIVO${arquivosPendentes.length !== 1 ? 'S' : ''}`;
        }

        function adicionarArquivos(files) {
            const novos = Array.from(files).filter(f => EXT_OK.test(f.name));
            if (novos.length < files.length) {
                log('⚠️ Alguns arquivos foram ignorados (apenas .xls / .html / .htm são aceitos).');
            }
            // Evita duplicatas pela combinação nome+tamanho
            const existentes = new Set(arquivosPendentes.map(f => f.name + '|' + f.size));
            let ignorados = 0;
            novos.forEach(f => {
                const chave = f.name + '|' + f.size;
                if (!existentes.has(chave)) { arquivosPendentes.push(f); existentes.add(chave); }
                else ignorados++;
            });
            if (ignorados > 0) log(`⚠️ ${ignorados} arquivo(s) ignorado(s) por já estarem na lista.`);
            atualizarListaArquivos();
        }

        // ── Botão "Baixar Mapas no BFA" ──────────────────────────────────────
        const btnBaixarMapas   = document.getElementById('btn-baixar-mapas-bfa');
        const bfaStatusLabel   = document.getElementById('bfa-mapa-status-label');

        btnBaixarMapas.onclick = () => {
            window.open('https://bfa.saude.gov.br/principal?bfa_mapa_intent=1', '_blank');
            bfaStatusLabel.textContent = 'Aguardando conclusão do download no portal BFA…';
            bfaStatusLabel.style.color = '#fbbf24';
            btnBaixarMapas.disabled    = true;
            btnBaixarMapas.style.opacity = '0.5';
            btnBaixarMapas.style.cursor  = 'default';
        };

        dropzone.onclick = () => fileInput.click();
        fileInput.onchange = () => { adicionarArquivos(fileInput.files); fileInput.value = ''; };

        dropzone.ondragover  = (e) => { e.preventDefault(); dropzone.style.borderColor = '#34d399'; dropzone.style.background = 'rgba(16,185,129,0.07)'; };
        dropzone.ondragleave = ()  => { dropzone.style.borderColor = 'rgba(16,185,129,0.3)'; dropzone.style.background = 'rgba(16,185,129,0.03)'; };
        dropzone.ondrop = (e) => {
            e.preventDefault();
            dropzone.style.borderColor = 'rgba(16,185,129,0.3)';
            dropzone.style.background  = 'rgba(16,185,129,0.03)';
            adicionarArquivos(e.dataTransfer.files);
        };

        const lerArquivoComoTexto = (file) => new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload  = (e) => resolve({ nome: file.name, conteudo: e.target.result });
            reader.onerror = () => reject(new Error('Falha ao ler o arquivo: ' + file.name));
            reader.readAsText(file, 'utf-8');
        });

        function atualizarStatusIngestao(dados) {
            if (!dados) { lastStatus.textContent = ''; return; }
            const dt = dados.ts ? new Date(dados.ts).toLocaleString('pt-BR') : '';
            lastStatus.innerHTML =
                `<span style="color:#34d399;">✅ Último envio: ${dt}</span> — ` +
                `${dados.unidades || 0} unidade(s), ${dados.pacientes || 0} paciente(s)` +
                (dados.invalidos ? ` <span style="color:#fbbf24;">(${dados.invalidos} inválido(s))</span>` : '');
            if (hintEl) {
                hintEl.textContent = dados.unidades
                    ? `Mapas prontos: ${dados.unidades} unidade(s) • Clique para criar as planilhas`
                    : 'Criar • Distribuir • Corrigir Validações';
                hintEl.style.color = dados.unidades ? '#34d399' : '#818cf8';
            }
        }

        btnProcess.onclick = async () => {
            if (arquivosPendentes.length === 0) return;

            const RESET_DELAY = 4000;

            function setBtnState(icon, label, borderColor, bg, color) {
                btnIcon.textContent  = icon;
                btnLabel.textContent = label;
                btnProcess.style.borderColor = borderColor;
                btnProcess.style.background  = bg;
                btnProcess.style.color       = color;
            }

            function resetBtn() {
                setTimeout(() => {
                    btnProcess.style.borderColor = '';
                    btnProcess.style.background  = '';
                    btnProcess.style.color       = '';
                    btnProcess.disabled = false;
                    setButtonsDisabled(false);
                    atualizarListaArquivos();
                }, RESET_DELAY);
            }

            btnProcess.disabled = true;
            setButtonsDisabled(true);

            // Estado: lendo arquivos ('' params = reset color overrides to default)
            setBtnState('hourglass_top', 'LENDO ARQUIVOS...', '', '', '');
            log(`📂 Lendo ${arquivosPendentes.length} arquivo(s)...`);

            let arquivosLidos;
            try {
                arquivosLidos = await Promise.all(arquivosPendentes.map(lerArquivoComoTexto));
            } catch (e) {
                log('❌ Erro ao ler arquivos: ' + e.message);
                setBtnState('error', 'ERRO — TENTE NOVAMENTE', 'rgba(248,113,113,0.4)', 'rgba(248,113,113,0.1)', '#f87171');
                resetBtn();
                return;
            }

            // Estado: enviando ao servidor ('' params = reset color overrides to default)
            setBtnState('sync', 'PROCESSANDO... (aguarde)', '', '', '');
            log('🔄 Enviando para o servidor... (pode levar alguns segundos)');
            const res = await apiP('ingest_mapas', { arquivos_json: JSON.stringify(arquivosLidos) });

            if (res.ok) {
                arquivosPendentes = [];
                log(`✅ ${res.processados}/${res.recebidos} arquivo(s) processado(s) — ${res.unidades} unidade(s), ${res.pacientes} paciente(s)`);
                if (res.erros && res.erros.length > 0) {
                    res.erros.forEach(e => log(`⚠️ ${e.arquivo}: ${e.erro}`));
                }
                if (res.processados > 0) {
                    log('📋 Mapas gerados! Agora clique em "Executar Pipeline Completo" para criar as planilhas das unidades.');
                }
                atualizarStatusIngestao(res);

                // Estado: concluído — feedback visual antes de resetar
                setBtnState('check_circle', `✔ ${res.processados} ARQUIVO(S) PROCESSADO(S) — CLIQUE EM EXECUTAR PIPELINE`,
                    'rgba(52,211,153,0.5)', 'rgba(52,211,153,0.15)', '#34d399');
            } else {
                log('❌ ' + (res.err || 'Erro desconhecido no servidor'));
                setBtnState('error', 'ERRO NO SERVIDOR — TENTE NOVAMENTE', 'rgba(248,113,113,0.4)', 'rgba(248,113,113,0.1)', '#f87171');
            }

            resetBtn();
        };

        // Carrega status da última ingestão ao abrir a aba
        apiP('get_ingest_status').then(res => {
            if (res && res.ok) atualizarStatusIngestao(res.data);
        });

        // ── Handlers do pipeline ─────────────────────────────────────────────

        document.getElementById('btn-pipeline-refresh').onclick = refreshStatus;

        document.getElementById('btn-pipeline-full').onclick = async () => {
            if (!confirm('Executar pipeline completo? A operação pode levar várias rodadas.')) return;
            setButtonsDisabled(true);
            log('▶ Iniciando pipeline completo...');
            const res = await apiP('run_pipeline_completo');
            log(res.ok ? '✅ ' + res.msg : '❌ ' + (res.err || 'Erro desconhecido'));
            setButtonsDisabled(false);
            refreshStatus();
        };

        document.querySelectorAll('.pipeline-etapa').forEach(btn => {
            btn.onclick = async () => {
                const action = btn.dataset.action;
                const label = btn.querySelector('div:last-child').textContent.trim();
                log('▶ ' + label + '...');
                btn.disabled = true;
                const res = await apiP(action);
                if (res.ok) {
                    const concluido = res.concluido ? '✅ Concluído' : '⏳ Parcial (reexecute)';
                    log(concluido + ' — ' + res.msg);
                } else {
                    log('❌ ' + (res.err || 'Erro desconhecido'));
                }
                btn.disabled = false;
                refreshStatus();
            };
        });

        document.getElementById('btn-pipeline-reset').onclick = async () => {
            if (!confirm('Resetar todos os checkpoints do pipeline? Etapas já concluídas precisarão ser reexecutadas.')) return;
            const res = await apiP('reset_pipeline');
            log(res.ok ? '🔄 ' + res.msg : '❌ ' + (res.err || 'Erro'));
            refreshStatus();
        };

        // ── Resultados / Links das Pastas ─────────────────────────────────────
        const resultsEl = document.getElementById('pipeline-results-list');
        document.getElementById('btn-pipeline-results').onclick = async () => {
            if (resultsEl) resultsEl.innerHTML = '<span style="color:#fbbf24;">Carregando...</span>';
            const res = await apiP('get_pipeline_results');
            if (!res || !res.ok) {
                if (resultsEl) resultsEl.innerHTML = `<span style="color:#f87171;">Erro ao carregar resultados: ${res && res.err ? res.err : 'sem resposta'}</span>`;
                return;
            }
            const items = res.data || [];
            if (items.length === 0) {
                if (resultsEl) resultsEl.innerHTML = '<span style="color:#64748b;">Nenhuma planilha criada ainda. Execute o pipeline primeiro.</span>';
                return;
            }
            if (resultsEl) {
                resultsEl.innerHTML = items.map(it => {
                    const ssLink = it.ssId ? `<a href="https://docs.google.com/spreadsheets/d/${it.ssId}" target="_blank" style="color:#60a5fa;text-decoration:underline;margin-left:6px;" title="Abrir planilha">📄 Planilha</a>` : '';
                    const folderLink = it.folderId ? `<a href="https://drive.google.com/drive/folders/${it.folderId}" target="_blank" style="color:#34d399;text-decoration:underline;margin-left:6px;" title="Abrir pasta">📁 Pasta</a>` : `<span style="color:#475569;margin-left:6px;">Pasta: ${it.folderMsg || 'não distribuída'}</span>`;
                    return `<div style="display:flex;align-items:center;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.04);gap:4px;">
                        <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#e2e8f0;">${it.nome}</span>
                        ${ssLink}${folderLink}
                    </div>`;
                }).join('');
            }
        };

        refreshStatus();
    }

})();