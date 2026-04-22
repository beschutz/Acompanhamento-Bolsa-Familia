// ==UserScript==
// @name         Painel Mestre Bolsa Família V9.2 (Condicionalidades configuráveis)
// @namespace    http://violentmonkey.net/
// @version      9.2.0
// @description  Painel de gestão com condicionalidades configuráveis, validação automática e resumo de ciclo.
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
            window.tailwind.config = { theme: { extend: { colors: { dark: { 700: '#334155', 800: '#1e293b', 900: '#0f172a' } } } } };
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
                        <div id="nav-config" class="nav-item"><span class="material-symbols-rounded" style="font-size:18px;">settings</span> Configuração</div>
                        <div id="nav-condicionalidades" class="nav-item"><span class="material-symbols-rounded" style="font-size:18px;">rule_settings</span> Condicionalidades</div>
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
            'config': renderConfig,
            'condicionalidades': renderCondicionalidades,
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
        document.getElementById('nav-config').onclick = () => loadRoute('config');
        document.getElementById('nav-condicionalidades').onclick = () => loadRoute('condicionalidades');
        document.getElementById('nav-egestor').onclick = () => loadRoute('egestor');
        document.getElementById('nav-esus').onclick = () => loadRoute('esus');

        loadRoute('dashboard');

        window.showToast = (msg, type='success') => {
            const container = document.getElementById('toast-container');
            const toast = document.createElement('div');
            toast.className = `text-white px-6 py-3 rounded-2xl shadow-2xl font-bold text-sm animate-fade`;
            toast.style.cssText = 'background:linear-gradient(135deg,#6366f1,#818cf8);box-shadow:0 8px 32px rgba(99,102,241,0.4);';
            toast.innerText = msg;
            container.appendChild(toast);
            setTimeout(() => toast.remove(), 4000);
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
                    const res = JSON.parse(response.responseText);
                    if(res.ok) {
                        // Faz a matemática reversa para calcular os já cadastrados antigos também
                        const totalBuscado = parseInt(res.dados.total_buscado) || 0;
                        const cadastrosRealizados = parseInt(res.dados.cadastros_realizados) || 0;
                        const esusAtualizados = parseInt(res.dados.atualizacoes) || 0;

                        // Calculamos subtraindo os novos e o esus do total buscado (só não deixa ficar negativo)
                        const calculoJaCadastrados = Math.max(0, totalBuscado - cadastrosRealizados - esusAtualizados);

                        document.getElementById('v0').innerText = totalBuscado;
                        document.getElementById('v1').innerText = cadastrosRealizados;
                        document.getElementById('v_eg_atu').innerText = calculoJaCadastrados;
                        document.getElementById('v2').innerText = esusAtualizados;
                        document.getElementById('dash-vig').innerText = res.dados.config?.vigencia || "";
                        document.getElementById('v-fila-egestor').innerText = res.dados.fila_egestor || 0;
                        document.getElementById('v-fila-esus').innerText = res.dados.fila_esus || 0;

                        const total = parseFloat(res.dados.total_db) || 0;
                        const concluido = parseFloat(res.dados.concluidos_db) || 0;
                        const pct = total > 0 ? ((concluido / total) * 100).toFixed(1) : "0.0";
                        document.getElementById('dash-pct').innerText = pct + '%';
                        document.getElementById('dash-bar').style.width = pct + '%';

                        if (res.dados.historico && typeof Chart !== 'undefined') {
                            const ctx = document.getElementById('dashboardChart').getContext('2d');
                            if (chartInstance) chartInstance.destroy();
                            const labels = Object.keys(res.dados.historico).sort();

                            // SEPARAÇÃO DOS DADOS PARA O GRÁFICO EMPILHADO
                            const dataEgestorNovos = labels.map(l => res.dados.historico[l].egestor || 0);
                            const dataEgestorAtu = labels.map(l => res.dados.historico[l].egestor_atualizados || 0);
                            const dataEsus = labels.map(l => res.dados.historico[l].esus || 0);

                            chartInstance = new Chart(ctx, {
                                type: 'bar',
                                data: {
                                    labels,
                                    datasets: [
                                        {
                                            label: 'e-Gestor (Novos)',
                                            data: dataEgestorNovos,
                                            backgroundColor: '#10b981', // Verde Claro
                                            stack: 'Stack 0'
                                        },
                                        {
                                            label: 'e-Gestor (Já Cadastrados)',
                                            data: dataEgestorAtu,
                                            backgroundColor: '#047857', // Verde Escuro
                                            stack: 'Stack 0',
                                            borderRadius: 4
                                        },
                                        {
                                            label: 'e-SUS',
                                            data: dataEsus,
                                            backgroundColor: '#3b82f6',
                                            stack: 'Stack 1',
                                            borderRadius: 4
                                        }
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
                    }
                    if(refresh) refresh.innerText = 'ATUALIZAR DADOS';
                }
            });
        }
        document.getElementById('btn-refresh').onclick = () => fetchStats(true);
        fetchStats(false);
    }

    function renderConfig(container) {
        const vigencias = ["2026/1", "2026/2", "2027/1", "2027/2", "2028/1", "2028/2"];
        container.innerHTML = `
            <div class="animate-fade" style="max-width:680px;margin:0 auto;">
                <div style="margin-bottom:32px;">
                    <h1 style="font-size:26px;font-weight:900;color:white;letter-spacing:-0.5px;font-style:italic;text-transform:uppercase;margin:0;">Configuração</h1>
                    <p style="font-size:12px;color:#475569;margin-top:6px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;">Vigência Ativa e Links das Pastas</p>
                </div>
                <div class="glass-card" style="padding:28px;">
                    <div style="margin-bottom:24px;">
                        <label style="font-size:9px;font-weight:800;color:#475569;text-transform:uppercase;letter-spacing:0.12em;display:block;margin-bottom:6px;">Vigência Ativa (Global)</label>
                        <select id="c-nom" class="glass-input" style="cursor:pointer;">
                            <option value="" disabled selected>Selecionar vigência...</option>
                            ${vigencias.map(v => `<option value="${v}" style="background:#0d1835">${v}</option>`).join('')}
                        </select>
                    </div>
                    <div style="height:1px;background:rgba(255,255,255,0.04);margin-bottom:24px;"></div>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:28px;">
                        <div>
                            <label style="font-size:9px;font-weight:800;color:#475569;text-transform:uppercase;letter-spacing:0.12em;display:flex;align-items:center;gap:6px;margin-bottom:6px;"><span style="width:8px;height:8px;background:#818cf8;border-radius:2px;display:inline-block;flex-shrink:0;"></span> Pasta Norte</label>
                            <input id="c-nor" class="glass-input" placeholder="Cole o link aqui">
                        </div>
                        <div>
                            <label style="font-size:9px;font-weight:800;color:#475569;text-transform:uppercase;letter-spacing:0.12em;display:flex;align-items:center;gap:6px;margin-bottom:6px;"><span style="width:8px;height:8px;background:#10b981;border-radius:2px;display:inline-block;flex-shrink:0;"></span> Pasta Sul</label>
                            <input id="c-sul" class="glass-input" placeholder="Cole o link aqui">
                        </div>
                        <div>
                            <label style="font-size:9px;font-weight:800;color:#475569;text-transform:uppercase;letter-spacing:0.12em;display:flex;align-items:center;gap:6px;margin-bottom:6px;"><span style="width:8px;height:8px;background:#f59e0b;border-radius:2px;display:inline-block;flex-shrink:0;"></span> Pasta Leste</label>
                            <input id="c-les" class="glass-input" placeholder="Cole o link aqui">
                        </div>
                        <div>
                            <label style="font-size:9px;font-weight:800;color:#475569;text-transform:uppercase;letter-spacing:0.12em;display:flex;align-items:center;gap:6px;margin-bottom:6px;"><span style="width:8px;height:8px;background:#ef4444;border-radius:2px;display:inline-block;flex-shrink:0;"></span> Pasta Oeste</label>
                            <input id="c-oes" class="glass-input" placeholder="Cole o link aqui">
                        </div>
                    </div>
                    <button id="btn-save-cfg" style="width:100%;background:linear-gradient(135deg,#6366f1,#818cf8);border:none;color:white;font-weight:800;padding:16px 24px;border-radius:14px;cursor:pointer;font-size:11px;letter-spacing:0.15em;text-transform:uppercase;transition:all 0.2s;box-shadow:0 4px 24px rgba(99,102,241,0.3);">SALVAR PARA TODA A EQUIPE</button>
                </div>
            </div>
        `;

        const dropdown = document.getElementById('c-nom');
        const inputs = [document.getElementById('c-nor'), document.getElementById('c-sul'), document.getElementById('c-les'), document.getElementById('c-oes')];

        dropdown.addEventListener('change', () => {
            if (CONFIG_ATUAL_SERVIDOR && dropdown.value !== CONFIG_ATUAL_SERVIDOR.vigencia) {
                inputs.forEach(i => i.value = "");
                window.showToast("Introduza novos links para esta vigência", "info");
            } else if (CONFIG_ATUAL_SERVIDOR && dropdown.value === CONFIG_ATUAL_SERVIDOR.vigencia) {
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
                const j = JSON.parse(res.responseText);
                if(j.ok && j.data) {
                    CONFIG_ATUAL_SERVIDOR = j.data;
                    dropdown.value = j.data.vigencia || "";
                    inputs[0].value = j.data.NORTE ? `https://drive.google.com/drive/folders/${j.data.NORTE}` : "";
                    inputs[1].value = j.data.SUL ? `https://drive.google.com/drive/folders/${j.data.SUL}` : "";
                    inputs[2].value = j.data.LESTE ? `https://drive.google.com/drive/folders/${j.data.LESTE}` : "";
                    inputs[3].value = j.data.OESTE ? `https://drive.google.com/drive/folders/${j.data.OESTE}` : "";
                }
            }
        });

        document.getElementById('btn-save-cfg').onclick = function() {
            this.innerText = "LIMPANDO LINKS E SALVANDO...";
            const idN = extractId(inputs[0].value), idS = extractId(inputs[1].value), idL = extractId(inputs[2].value), idO = extractId(inputs[3].value);
            const d = `action=save_config&api_target=panel&token=${TOKEN_ACESSO}&vigencia_nome=${dropdown.value}&folder_norte=${idN}&folder_sul=${idS}&folder_leste=${idL}&folder_oeste=${idO}`;
            GM_xmlhttpRequest({ method: "POST", url: URL_APPS_SCRIPT, headers: { "Content-Type": "application/x-www-form-urlencoded" }, data: d, onload: () => { window.showToast("Configuração Salva!"); this.innerText = "SALVAR PARA TODA A EQUIPE"; CONFIG_ATUAL_SERVIDOR = { vigencia: dropdown.value, NORTE: idN, SUL: idS, LESTE: idL, OESTE: idO }; } });
        };
    }

    function renderCondicionalidades(container) {
        const vigencias = ["2026/1", "2026/2", "2027/1", "2027/2", "2028/1", "2028/2"];
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
        const newRule = () => ({
            id: `rule_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
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
                        <div><input data-bind="name" data-idx="${idx}" class="glass-input" value="${String(r.name || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")}" placeholder="Nome da regra"></div>
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
  container.innerHTML = `
    <div class="animate-fade" style="max-width:860px;margin:0 auto;">
      <div style="margin-bottom:32px;border-bottom:1px solid rgba(255,255,255,0.05);padding-bottom:20px;">
        <h2 style="font-size:26px;font-weight:900;color:white;letter-spacing:-0.5px;font-style:italic;text-transform:uppercase;margin:0;">Gestão Planilhas</h2>
        <p style="font-size:12px;color:#475569;margin-top:6px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;">Controle de importação e distribuição das Zonas</p>
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
    vigencia: res.dados.config?.vigencia || "",
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
      const vigName = cfg?.vigencia ? cfg.vigencia : "NÃO CONFIGURADA";
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

})();
