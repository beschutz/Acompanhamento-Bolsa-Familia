// ==UserScript==
// @name        Baixar Mapas Bolsa Família - Automático
// @namespace   Violentmonkey Scripts
// @match       https://bfa.saude.gov.br/mapaacompanhamento*
// @grant       none
// @version     4.0
// ==/UserScript==

(function() {
    'use strict';

    const esperar = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    // Cria o botão na tela
    let btnStart = document.createElement("button");
    btnStart.style = "position:fixed; bottom:20px; right:20px; z-index:99999; padding:15px; background-color:#008CBA; color:white; border:none; border-radius:5px; cursor:pointer; font-weight:bold; box-shadow: 2px 2px 5px rgba(0,0,0,0.5);";
    document.body.appendChild(btnStart);

    function atualizarBotao(texto, cor) {
        btnStart.innerHTML = texto;
        btnStart.style.backgroundColor = cor;
    }

    // Função para limpar a memória se você quiser parar
    function pararAutomacao() {
        localStorage.removeItem('bf_running');
        localStorage.removeItem('bf_index');
        atualizarBotao("▶ INICIAR AUTOMAÇÃO", "#008CBA");
    }

    // O que acontece ao clicar no botão
    btnStart.onclick = function() {
        if (localStorage.getItem('bf_running') === 'true') {
            // Se clicar enquanto estiver rodando, ele cancela
            pararAutomacao();
            alert("Automação parada!");
        } else {
            // Inicia do zero
            localStorage.setItem('bf_running', 'true');
            localStorage.setItem('bf_index', '1'); // Começa pela clínica 1
            executarPasso();
        }
    };

    // Função principal que faz o trabalho
    async function executarPasso() {
        try {
            // Lê do caderninho em qual clínica parou (ou começa do 1)
            let indexAtual = parseInt(localStorage.getItem('bf_index')) || 1;
            atualizarBotao(`⏳ PREPARANDO...`, "#ff9800");

            // 1. Clica no Radio de Estabelecimento
            let radioMapa = document.querySelector('input[name="TP_MAPA"][value="2"]');
            if(radioMapa && !radioMapa.checked) {
                radioMapa.click();
                radioMapa.dispatchEvent(new Event('change', { bubbles: true }));
                if(window.angular) window.angular.element(radioMapa).triggerHandler('click');
            }

            // 2. Espera a lista de clínicas carregar do sistema
            let selectClinicas = null;
            for(let t=0; t<20; t++) {
                selectClinicas = document.querySelector('select[name="CO_CNES_ATENDIMENTO"]');
                if (selectClinicas && selectClinicas.options && selectClinicas.options.length > 1) break;
                await esperar(1000);
            }

            if (!selectClinicas || selectClinicas.options.length <= 1) {
                alert("Erro ao carregar lista de clínicas. A automação vai parar.");
                pararAutomacao();
                return;
            }

            let total = selectClinicas.options.length;

            // 3. Verifica se já baixou todas as clínicas
            if (indexAtual >= total) {
                atualizarBotao("✅ FINALIZADO!", "#4CAF50");
                alert("Sucesso! Todos os mapas foram baixados.");
                pararAutomacao(); // Limpa a memória
                return;
            }

            atualizarBotao(`⏳ RODANDO: ${indexAtual} de ${total - 1}<br><small>(Clique para cancelar)</small>`, "#ff9800");

            // 4. Seleciona a clínica correta baseada no número salvo
            selectClinicas.value = selectClinicas.options[indexAtual].value;
            selectClinicas.dispatchEvent(new Event('change', { bubbles: true }));
            if (window.angular) window.angular.element(selectClinicas).triggerHandler('change');

            await esperar(3000);

            // 5. Seleciona "Todos os Indivíduos"
            let selectsNaPagina = document.querySelectorAll('select');
            for (let select of selectsNaPagina) {
                for(let opt of select.options) {
                    if (opt.text.toUpperCase().includes("TODOS OS INDIVÍDUOS")) {
                        select.value = opt.value;
                        select.dispatchEvent(new Event('change', { bubbles: true }));
                        if (window.angular) window.angular.element(select).triggerHandler('change');
                        break;
                    }
                }
            }

            await esperar(2000);

            // 6. Clica em Gerar XLS
            let botoes = document.querySelectorAll('button');
            for (let btn of botoes) {
                if (btn.innerText.includes("Gerar XLS") || btn.id === "gerarMapa") {
                    btn.click();
                    break;
                }
            }

            // 7. Espera a janela do OK aparecer
            let clicouOk = false;
            for(let t=0; t<60; t++) {
                await esperar(1000); // Fica procurando a cada 1 segundo
                let botoesOk = document.querySelectorAll('button');

                for (let btn of botoesOk) {
                    // Se achar o botão OK e ele estiver visível na tela
                    if (btn.innerText.trim() === "OK" && btn.offsetParent !== null) {

                        atualizarBotao(`⏳ AGUARDANDO DOWNLOAD...`, "#E91E63");

                        // !!! AQUI ESTÁ A PAUSA DO DOWNLOAD !!!
                        // Espera 8 segundos para o arquivo baixar antes de apertar OK
                        await esperar(8000);

                        // Atualiza o caderninho para o próximo número ANTES de recarregar
                        localStorage.setItem('bf_index', indexAtual + 1);

                        // Clica no OK (isso vai fazer a página dar refresh)
                        btn.click();
                        clicouOk = true;
                        break;
                    }
                }
                if(clicouOk) break;
            }

        } catch (error) {
            console.error("Erro na automação:", error);
            pararAutomacao();
            atualizarBotao("❌ ERRO!", "#f44336");
        }
    }

    // --- O PULO DO GATO ---
    // Assim que a página abre, ele checa se estava no meio de uma automação
    if (localStorage.getItem('bf_running') === 'true') {
        atualizarBotao("⏳ RETOMANDO...", "#ff9800");
        // Espera 2 segundos para a página carregar bem e chama a função sozinha
        setTimeout(executarPasso, 2000);
    } else {
        atualizarBotao("▶ INICIAR AUTOMAÇÃO", "#008CBA");
    }

})();
