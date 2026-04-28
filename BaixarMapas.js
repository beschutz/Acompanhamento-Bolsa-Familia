// ==UserScript==
// @name        Baixar Mapas BFA - Acionado pelo Painel
// @namespace   Violentmonkey Scripts
// @match       https://bfa.saude.gov.br/mapaacompanhamento*
// @match       https://bfa.saude.gov.br/principal*
// @grant       none
// @version     6.0
// @run-at      document-end
// ==/UserScript==

(function() {
    'use strict';

    const FLAG_INTENT  = 'bf_mapa_intent';
    const FLAG_RUNNING = 'bf_running';
    const FLAG_INDEX   = 'bf_index';

    const esperar = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    // ── /principal: redireciona para /mapaacompanhamento somente com flag ativa ──
    if (window.location.pathname.startsWith('/principal')) {
        // Aceita tanto o parâmetro de URL (vindo do painel, outra origem) quanto o localStorage
        if (new URLSearchParams(window.location.search).get('bfa_mapa_intent') === '1') {
            localStorage.setItem(FLAG_INTENT, 'true');
        }
        if (localStorage.getItem(FLAG_INTENT) === 'true') {
            window.location.replace('https://bfa.saude.gov.br/mapaacompanhamento');
        }
        // Sem flag → não interfere; outros robôs continuam funcionando normalmente.
        return;
    }

    // ── /mapaacompanhamento: só executa se o usuário clicou "Baixar Mapas" no painel ──
    if (localStorage.getItem(FLAG_INTENT) !== 'true') return;

    // ── Estilos do painel (padrão visual das automações BFA) ──
    const styleEl = document.createElement('style');
    styleEl.textContent = `
        #bfaMapaPanel { font-family: 'Roboto', 'Segoe UI', sans-serif; position: fixed; bottom: 20px; right: 20px; z-index: 999999; width: 280px; user-select: none; }
        .bfa-mapa-glass { background: rgba(15,23,42,0.95); backdrop-filter: blur(12px); border: 1px solid rgba(255,255,255,0.08); box-shadow: 0 10px 30px -5px rgba(0,0,0,0.6); border-radius: 12px; overflow: hidden; }
        .bfa-mapa-header { display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; background: rgba(255,255,255,0.03); border-bottom: 1px solid rgba(255,255,255,0.07); }
        .bfa-mapa-body { padding: 12px 14px; display: flex; flex-direction: column; gap: 10px; }
        .bfa-mapa-console { background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.05); border-radius: 6px; padding: 8px 10px; font-family: monospace; font-size: 10px; color: #60a5fa; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .bfa-mapa-progress { font-size: 10px; color: #94a3b8; text-align: center; font-weight: 600; min-height: 14px; }
        .bfa-mapa-btn-stop { width: 100%; border: none; padding: 8px 0; border-radius: 6px; font-weight: 700; font-size: 10px; cursor: pointer; color: white; text-transform: uppercase; letter-spacing: 0.08em; background: linear-gradient(135deg, #9f1239 0%, #e11d48 100%); }
        .bfa-mapa-done-box { border: 1px solid rgba(16,185,129,0.3); padding: 12px; border-radius: 8px; background: rgba(16,185,129,0.08); text-align: center; color: #34d399; font-size: 10px; font-weight: 700; line-height: 1.6; }
    `;
    document.head.appendChild(styleEl);

    // ── Painel de status ──
    const painel = document.createElement('div');
    painel.id = 'bfaMapaPanel';
    painel.innerHTML = `
        <div class="bfa-mapa-glass">
            <div class="bfa-mapa-header">
                <div style="display:flex;align-items:center;gap:8px;">
                    <span style="font-size:16px;">🗺️</span>
                    <span style="font-size:11px;font-weight:700;color:white;">Baixar Mapas BFA</span>
                </div>
                <div id="bfaMapaBadge" style="background:rgba(96,165,250,0.15);color:#60a5fa;font-size:9px;padding:2px 7px;border-radius:4px;font-weight:700;border:1px solid rgba(96,165,250,0.25);">INICIANDO</div>
            </div>
            <div class="bfa-mapa-body">
                <div id="bfaMapaConsole" class="bfa-mapa-console">Aguardando carregamento da página...</div>
                <div id="bfaMapaProgress" class="bfa-mapa-progress"></div>
                <div id="bfaMapaActions"></div>
            </div>
        </div>
    `;
    document.body.appendChild(painel);

    const elBadge    = document.getElementById('bfaMapaBadge');
    const elConsole  = document.getElementById('bfaMapaConsole');
    const elProgress = document.getElementById('bfaMapaProgress');
    const elActions  = document.getElementById('bfaMapaActions');

    const BADGE_CORES = {
        INICIANDO:      { color: '#60a5fa', bg: 'rgba(96,165,250,0.15)',   border: 'rgba(96,165,250,0.25)'  },
        RODANDO:        { color: '#fbbf24', bg: 'rgba(251,191,36,0.15)',   border: 'rgba(251,191,36,0.25)'  },
        'AG.DOWNLOAD':  { color: '#e879f9', bg: 'rgba(232,121,249,0.15)',  border: 'rgba(232,121,249,0.25)' },
        FINALIZADO:     { color: '#34d399', bg: 'rgba(52,211,153,0.15)',   border: 'rgba(52,211,153,0.25)'  },
        ERRO:           { color: '#f87171', bg: 'rgba(248,113,113,0.15)',  border: 'rgba(248,113,113,0.25)' },
        PARADO:         { color: '#94a3b8', bg: 'rgba(148,163,184,0.1)',   border: 'rgba(148,163,184,0.2)'  },
    };

    function setStatus(msg, estado, prog) {
        elConsole.textContent = msg;
        if (estado && BADGE_CORES[estado]) {
            const c = BADGE_CORES[estado];
            elBadge.textContent    = estado;
            elBadge.style.color    = c.color;
            elBadge.style.background = c.bg;
            elBadge.style.borderColor = c.border;
        }
        if (prog !== undefined) elProgress.textContent = prog;
    }

    function renderBotaoParar() {
        elActions.innerHTML = `<button class="bfa-mapa-btn-stop" id="bfaMapaBtnStop">■ PARAR AUTOMAÇÃO</button>`;
        document.getElementById('bfaMapaBtnStop').onclick = () => {
            pararAutomacao();
            setStatus('Automação cancelada pelo usuário.', 'PARADO', '');
            elActions.innerHTML = '';
        };
    }

    function renderMensagemFinal() {
        elActions.innerHTML = `
            <div class="bfa-mapa-done-box">
                ✅ Mapas gerados!<br>
                <span style="font-size:9px;color:#94a3b8;font-weight:600;">Volte para o painel web e execute o pipeline completo.</span>
            </div>
        `;
    }

    function pararAutomacao() {
        localStorage.removeItem(FLAG_RUNNING);
        localStorage.removeItem(FLAG_INDEX);
        localStorage.removeItem(FLAG_INTENT);
    }

    // ── Rotina principal de download ──
    async function executarPasso() {
        try {
            let indexAtual = parseInt(localStorage.getItem(FLAG_INDEX)) || 1;
            setStatus('Preparando seleção...', 'RODANDO', '');

            // 1. Seleciona o radio "Estabelecimento"
            const radioMapa = document.querySelector('input[name="TP_MAPA"][value="2"]');
            if (radioMapa && !radioMapa.checked) {
                radioMapa.click();
                radioMapa.dispatchEvent(new Event('change', { bubbles: true }));
                if (window.angular) window.angular.element(radioMapa).triggerHandler('click');
            }

            // 2. Aguarda a lista de estabelecimentos carregar
            let selectClinicas = null;
            for (let t = 0; t < 20; t++) {
                selectClinicas = document.querySelector('select[name="CO_CNES_ATENDIMENTO"]');
                if (selectClinicas && selectClinicas.options && selectClinicas.options.length > 1) break;
                await esperar(1000);
            }

            if (!selectClinicas || selectClinicas.options.length <= 1) {
                setStatus('Erro ao carregar lista de estabelecimentos.', 'ERRO', '');
                pararAutomacao();
                return;
            }

            const total = selectClinicas.options.length;

            // 3. Verifica se concluiu todos
            if (indexAtual >= total) {
                setStatus('Todos os mapas foram gerados.', 'FINALIZADO', `${total - 1} de ${total - 1}`);
                renderMensagemFinal();
                pararAutomacao();
                return;
            }

            setStatus(`Gerando mapa ${indexAtual}...`, 'RODANDO', `${indexAtual} de ${total - 1}`);
            renderBotaoParar();

            // 4. Seleciona o estabelecimento atual
            selectClinicas.value = selectClinicas.options[indexAtual].value;
            selectClinicas.dispatchEvent(new Event('change', { bubbles: true }));
            if (window.angular) window.angular.element(selectClinicas).triggerHandler('change');

            await esperar(3000);

            // 5. Seleciona "Todos os Indivíduos"
            const selectsNaPagina = document.querySelectorAll('select');
            for (const select of selectsNaPagina) {
                for (const opt of select.options) {
                    if (opt.text.toUpperCase().includes('TODOS OS INDIVÍDUOS')) {
                        select.value = opt.value;
                        select.dispatchEvent(new Event('change', { bubbles: true }));
                        if (window.angular) window.angular.element(select).triggerHandler('change');
                        break;
                    }
                }
            }

            await esperar(2000);

            // 6. Clica em "Gerar XLS"
            const botoes = document.querySelectorAll('button');
            for (const btn of botoes) {
                if (btn.innerText.includes('Gerar XLS') || btn.id === 'gerarMapa') {
                    btn.click();
                    break;
                }
            }

            // 7. Aguarda o popup de confirmação de download (botão OK)
            let clicouOk = false;
            for (let t = 0; t < 60; t++) {
                await esperar(1000);
                const botoesOk = document.querySelectorAll('button');
                for (const btn of botoesOk) {
                    if (btn.innerText.trim() === 'OK' && btn.offsetParent !== null) {
                        setStatus('Aguardando download do arquivo...', 'AG.DOWNLOAD', `${indexAtual} de ${total - 1}`);
                        // Aguarda o arquivo ser salvo pelo navegador antes de confirmar
                        await esperar(8000);
                        // Persiste o próximo índice antes do reload da página
                        localStorage.setItem(FLAG_INDEX, indexAtual + 1);
                        btn.click();
                        clicouOk = true;
                        break;
                    }
                }
                if (clicouOk) break;
            }

            if (!clicouOk) {
                setStatus('Tempo esgotado aguardando popup de download.', 'ERRO', `${indexAtual} de ${total - 1}`);
                pararAutomacao();
            }

        } catch (error) {
            console.error('Erro na automação de mapas BFA:', error);
            pararAutomacao();
            setStatus('Erro inesperado na automação.', 'ERRO', '');
        }
    }

    // ── Ponto de entrada: retoma automação em curso ou inicia do zero ──
    if (localStorage.getItem(FLAG_RUNNING) === 'true') {
        setStatus('Retomando automação...', 'RODANDO', '');
        renderBotaoParar();
        setTimeout(executarPasso, 2000);
    } else {
        localStorage.setItem(FLAG_RUNNING, 'true');
        localStorage.setItem(FLAG_INDEX, '1');
        setStatus('Iniciando automação...', 'INICIANDO', '');
        renderBotaoParar();
        setTimeout(executarPasso, 2000);
    }

})();
