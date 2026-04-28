# Acompanhamento Bolsa Família — Sistema de Gestão SMS/Porto Alegre

Sistema integrado de acompanhamento de condicionalidades do Bolsa Família,
desenvolvido para a Secretaria Municipal de Saúde de Porto Alegre.

---

## Visão Geral do Fluxo Ponta a Ponta

```
[1] Tampermonkey (bfa.saude.gov.br)
       │  Baixa arquivos "falso XLS" de mapa de acompanhamento
       ▼
[2] Script Python (Google Colab)
       │  Faz parsing dos .xls, extrai metadados
       │  (Código do Mapa, Unidade/EAS, pacientes)
       │  Gera Google Spreadsheet consolidada
       ▼
[3] Pipeline Apps Script — etapaCriarPlanilhasPorUnidade()
       │  Lê a planilha consolidada
       │  Cria uma planilha formatada por Unidade de Saúde
       │  a partir do template (ConstrutorPlanilhas.gs)
       ▼
[4] Pipeline Apps Script — etapaDistribuirPorRegiao()
       │  Move cada planilha para a pasta regional
       │  (LESTE / NORTE / OESTE / SUL) pelo dicionário
       │  de palavras-chave
       ▼
[5] Pipeline Apps Script — etapaCorrigirValidacoes()
       │  (Re)aplica regras de validação de dados em todas
       │  as planilhas sem apagar conteúdo já preenchido
       ▼
[6] Operação Diária (Painel Mestre 2.0.gs + api.gs)
       │  Importar dados → Atualizar DB → Distribuir → Devolver
       │  Automação via robôs Tampermonkey (e-Gestor / e-SUS)
       ▼
[7] Painel Web (Painel_sincronização.user.js)
       └  Dashboard, Gestão Planilhas, Pipeline, Construtor
```

---

## Arquivos do Repositório

| Arquivo | Responsabilidade |
|---------|-----------------|
| `Config_Pipeline.gs` | **Configuração centralizada** do pipeline: IDs de pastas, template, vigência, dicionário de regiões, time budget |
| `Utils_Pipeline.gs` | Utilitários compartilhados: `normalizarTextoSemAcento`, `withTimeBudget`, `loadCheckpoint`/`saveCheckpoint`/`clearCheckpoint`, `logPadrao` |
| `Pipeline_BolsaFamilia.gs` | Orquestrador do pipeline: `runPipelineCompleto`, `etapaCriarPlanilhasPorUnidade`, `etapaDistribuirPorRegiao`, `etapaCorrigirValidacoes` |
| `ConstrutorPlanilhas.gs` | Motor de criação de planilhas por template (layout, validações, formatação condicional) |
| `Painel Mestre 2.0.gs` | Módulo de importação (crawler de planilhas das unidades) e orquestrador de menu |
| `Fila.gs` | Distribuição de dados mestre para planilhas regionais e fila de robôs |
| `Devolução.gs` | Escrita de dados de retorno (Data, Peso, Altura, E-Gestor) nas planilhas das unidades |
| `api.gs` | API centralizada: expõe endpoints para o Painel Web e robôs Tampermonkey |
| `Painel_sincronização.user.js` | Userscript Tampermonkey/Violentmonkey: painel web de gestão e automação |
| `automacao_egestor.user.js` | Userscript de automação do e-Gestor |
| `automacao_esus.user.js` | Userscript de automação do e-SUS |

---

## Pré-requisitos

### Google Apps Script
- Projeto Apps Script vinculado a uma Google Spreadsheet (Master DB)
- Permissões: `SpreadsheetApp`, `DriveApp`, `PropertiesService`, `LockService`
- API do Google Sheets habilitada no projeto (para operações batch)

### Configuração obrigatória antes do pipeline
Edite **`Config_Pipeline.gs`** e preencha:

```javascript
const CONFIG_PIPELINE = {
  templateId: '__padrao__',           // ou ID de template salvo no Construtor
  vigencia: '1/2026',
  nomeAbaVigencia: 'MAPA INDIVIDUALIZADO VIGÊNCIA 1/2026',

  idPlanilhaConsolidada: 'ID_AQUI',   // ← planilha gerada pelo script Python
  nomeAbaConsolidada: 'DADOS',

  pastaOrigemId: 'ID_PASTA_AQUI',     // ← pasta raiz no Drive

  pastasRegionais: {
    LESTE: 'ID_PASTA_LESTE',
    NORTE: 'ID_PASTA_NORTE',
    OESTE: 'ID_PASTA_OESTE',
    SUL:   'ID_PASTA_SUL'
  },

  // dicionarioRegioes: ajuste palavras-chave conforme nomenclatura local
};
```

---

## Ordem de Execução por Vigência

### Etapa de Setup (início de cada vigência)

```
1. [Python/Colab]   Executar script de parsing dos .xls do BFA
                    → gera planilha consolidada no Drive

2. [Apps Script]    Preencher Config_Pipeline.gs com IDs atualizados

3. [Apps Script]    runPipelineCompleto()
                    ou etapas individuais (ver abaixo)
```

### Operação Diária

```
1. Importar dados das planilhas das unidades
   → executarCicloImportacao()  (menu ⚙️ ou Painel Web)

2. Atualizar banco com retorno dos robôs
   → atualizarMestreComRetornoFila()

3. Distribuir para filas/zonas
   → distribuirDadosCentral()

4. Devolver dados processados para as planilhas das unidades
   → executarDevolucaoCiclo()
```

---

## Como Executar o Pipeline

### Via Painel Web (recomendado)

1. Abra o painel e navegue até **"Pipeline Unidades"**
2. Clique em **"Executar Pipeline Completo"** para rodar as 3 etapas
3. Ou clique nas etapas individuais:
   - **1. Criar Planilhas** → cria as planilhas por unidade
   - **2. Distribuir Regiões** → move para pastas regionais
   - **3. Corrigir Validações** → corrige regras de validação em massa

### Via Apps Script (Editor de Scripts)

```javascript
// Pipeline completo
runPipelineCompleto();

// Ou etapas individuais
etapaCriarPlanilhasPorUnidade();
etapaDistribuirPorRegiao();
etapaCorrigirValidacoes();
```

---

## Como Retomar Após Timeout

O Apps Script encerra execuções após **6 minutos**. O pipeline salva
automaticamente o progresso em `ScriptProperties` antes de atingir o
limite (4,5 min de margem de segurança).

**Para retomar:** simplesmente reexecute a mesma função. Ela carrega o
checkpoint salvo e continua de onde parou, sem duplicar nenhuma operação.

O progresso aparece no log como:
```
⏳ Pausa de segurança [45/120]. Reexecute para continuar.
```

---

## Como Resetar Checkpoints

Use quando precisar reprocessar tudo do zero (nova vigência, erro grave, etc.)

### Via Painel Web
- Navegue até **"Pipeline Unidades"** → clique **"Resetar Checkpoints"**

### Via Apps Script
```javascript
// Limpa todos os checkpoints do pipeline
clearAllPipelineCheckpoints();

// Ou individualmente:
clearCheckpoint('PIPELINE_CRIAR_CPK');
clearCheckpoint('PIPELINE_DISTRIBUIR_CPK');
clearCheckpoint('PIPELINE_VALIDACOES_CPK');
```

### Resetar TUDO (inclusive stats e configurações do sistema)
```javascript
// ⚠️ Cuidado: apaga todas as propriedades do script
PropertiesService.getScriptProperties().deleteAllProperties();
```

---

## Dicionário de Regiões

O roteamento regional usa correspondência de palavras-chave com texto
normalizado (sem acento, maiúsculo). Edite o `dicionarioRegioes` em
`Config_Pipeline.gs` conforme a nomenclatura das unidades locais.

**Lógica de prioridade:** a ordem `LESTE → NORTE → OESTE → SUL` define
qual região vence quando há múltiplos termos correspondentes.

Unidades não reconhecidas são registradas no log e no status do checkpoint
para revisão manual.

---

## Comportamento Idempotente

Todas as etapas do pipeline são **idempotentes**:
- **Criar:** verifica se a unidade já tem planilha criada (via checkpoint)
  antes de criar uma nova
- **Distribuir:** registra quais arquivos já foram movidos; pula na
  reexecução
- **Validações:** aplica as regras sem apagar dados; seguro para rodar
  várias vezes

---

## Variáveis de Configuração Adicionais

Além de `Config_Pipeline.gs`, algumas configurações de operação diária
ficam salvas em `ScriptProperties` e podem ser editadas via:

```
Menu ⚙️ → Ver Configuração Ativa
```
ou

```
Menu ⚙️ → Painel Web → Configuração → Salvar Vigência
```

---

## Resolução de Problemas Comuns

| Problema | Causa Provável | Solução |
|----------|---------------|---------|
| "idPlanilhaConsolidada não configurado" | `Config_Pipeline.gs` não preenchido | Adicione o ID da planilha consolidada |
| "Pasta regional não configurada" | Pasta regional sem ID em `Config_Pipeline.gs` | Preencha os IDs de `pastasRegionais` |
| "Nenhuma aba padrão encontrada" | Planilha da unidade usa aba com nome diferente | Adicione o nome em `nomesAlternativos` em `Pipeline_BolsaFamilia.gs` |
| Unidades "não reconhecidas" no log | Nome da unidade não contém nenhum termo do dicionário | Adicione termos ao `dicionarioRegioes` em `Config_Pipeline.gs` |
| Pipeline não continua após timeout | Checkpoint corrompido | Verifique com `getPipelineStatus()` ou resete com `clearAllPipelineCheckpoints()` |
