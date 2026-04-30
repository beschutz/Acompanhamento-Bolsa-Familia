/**
 * ⚙️ CONFIGURAÇÃO CENTRALIZADA DO PIPELINE
 *
 * Edite APENAS este arquivo antes de executar o pipeline de criação de
 * planilhas por Unidade de Saúde do Bolsa Família.
 *
 * Todos os IDs de pastas, template, vigência, dicionário de regiões e
 * parâmetros de execução ficam aqui — nenhum outro arquivo precisa ser
 * alterado para adaptar o pipeline a uma nova vigência.
 */

// =============================================================================
// CONFIGURAÇÕES PRINCIPAIS — ajuste antes de cada vigência
// =============================================================================

const CONFIG_PIPELINE = {

  // ── Template de layout ────────────────────────────────────────────────────
  // Use '__padrao__' para o template embutido em ConstrutorPlanilhas.gs ou
  // informe o ID de um template salvo via Construtor de Planilhas no painel.
  templateId: '__padrao__',

  // ── Vigência ──────────────────────────────────────────────────────────────
  vigencia: '1/2026',

  // Nome da aba que será criada em cada planilha de unidade.
  // Deve coincidir com o campo config.nomeAba do template escolhido.
  nomeAbaVigencia: 'MAPA INDIVIDUALIZADO VIGÊNCIA 1/2026',

  // ── Planilha consolidada (saída do script Python) ─────────────────────────
  // ID da Google Spreadsheet que contém os dados consolidados de pacientes
  // por Unidade de Saúde, gerada pelo script Python a partir dos arquivos
  // baixados em https://bfa.saude.gov.br/mapaacompanhamento.
  idPlanilhaConsolidada: '',  // ← preencha com o ID da planilha

  // Nome da aba nessa planilha que contém os dados (sem cabeçalho de metadados).
  nomeAbaConsolidada: 'DADOS',

  // ── Índices de coluna na planilha consolidada (base 0) ───────────────────
  // Ajuste conforme a estrutura gerada pelo script Python.
  colunasConsolidada: {
    NOME_UNIDADE:  0,   // Ex.: "UBS MODELO"
    NIS:           1,
    CNS:           2,
    CPF:           3,
    NOME_PACIENTE: 4,
    DATA_NASC:     5,
    IDADE:         6,
    DATA_ACOMP:    7,
    VACINACAO:     8,
    PESO:          9,
    ALTURA:        10,
    GESTANTE:      11,
    PRE_NATAL:     12,
    DUM:           13
  },

  // ── Pasta de origem (onde as novas planilhas serão criadas) ───────────────
  pastaOrigemId: '',  // ← ID da pasta raiz no Google Drive

  // ── Pastas por unidade de saúde (opcional) ────────────────────────────────
  // Se preenchido, a planilha de cada unidade será criada diretamente na
  // pasta correspondente, ignorando pastaOrigemId para essa unidade.
  // Chave: nome exato da unidade (igual ao que aparece no arquivo BFA).
  // Valor: ID da pasta no Google Drive.
  //
  // Exemplo:
  //   pastasUnidades: {
  //     'UBS MODELO NORTE': '1AbC...folderId...',
  //     'UBS CRISTAL':       '2DeF...folderId...'
  //   }
  //
  // Unidades sem entrada aqui continuam usando pastaOrigemId → regional.
  pastasUnidades: {},  // ← preencha se quiser pastas por unidade

  // ── Pastas regionais de destino ───────────────────────────────────────────
  // As planilhas criadas em pastaOrigemId serão movidas para a pasta
  // correspondente à região da unidade após o roteamento.
  pastasRegionais: {
    LESTE: '',   // ← IDs das pastas regionais no Google Drive
    NORTE: '',
    OESTE: '',
    SUL:   ''
  },

  // ── Dicionário de palavras-chave para roteamento regional ────────────────
  // A correspondência é feita com normalização (sem acento, maiúsculo).
  // A primeira região cujos termos aparecerem no nome da unidade vence.
  // A ordem LESTE → NORTE → OESTE → SUL define a prioridade.
  dicionarioRegioes: {
    LESTE: [
      'LESTE', 'PARTENON', 'LOMBA DO PINHEIRO', 'LOMBA', 'RESTINGA',
      'BELEM NOVO', 'SERRARIA', 'VILA NOVA', 'MARIO QUINTANA',
      'PONTA GROSSA', 'RUBEM BERTA'
    ],
    NORTE: [
      'NORTE', 'SARANDI', 'JARDIM ITA', 'MORRO SANTANA',
      'JARDIM BOTANICO', 'NORDESTE', 'ARQUIMEDES', 'SAO JOAO BATISTA',
      'PASSO DAS PEDRAS'
    ],
    OESTE: [
      'OESTE', 'BELEM VELHO', 'CRISTAL', 'CAMAQUA', 'MEDIANEIRA',
      'SANTA TEREZA', 'HUMAITA', 'NAVEGANTES', 'SAO GERALDO',
      'ESPIRITO SANTO'
    ],
    SUL: [
      'SUL', 'CAVALHADA', 'TRISTEZA', 'IPANEMA', 'GLORIA',
      'ABERTA DOS MORROS', 'EXTREMO SUL', 'CHAPEU DO SOL',
      'PINHEIRO', 'LAGEADO', 'PEDRA REDONDA'
    ]
  },

  // ── Limite de tempo por execução (ms) ────────────────────────────────────
  // Apps Script encerra execuções após 6 min. O valor aqui é o orçamento
  // seguro por chamada (padrão: 4,5 min). O pipeline salva checkpoint
  // antes de ultrapassar esse limite e pode ser retomado.
  timeBudgetMs: 270000,

  // ── Chaves de checkpoint (PropertiesService) ──────────────────────────────
  // Altere apenas se precisar rodar múltiplos pipelines em paralelo.
  checkpointKeys: {
    criar:      'PIPELINE_CRIAR_CPK',
    distribuir: 'PIPELINE_DISTRIBUIR_CPK',
    validacoes: 'PIPELINE_VALIDACOES_CPK',
    ingestao:   'PIPELINE_INGEST_CPK'
  },

  // ── Ingestão de Mapas ─────────────────────────────────────────────────────
  // Parâmetros usados pelo módulo IngestaoMapas.gs e pelo Painel Web para
  // receber e processar os arquivos .xls (HTML) baixados do BFA.
  ingestao: {
    // Tamanho máximo por arquivo em bytes (padrão: 10 MB).
    maxFileSizeBytes: 10485760,

    // Extensões de arquivo aceitas pelo painel (em minúsculas, com ponto).
    extensoesPermitidas: ['.xls', '.html', '.htm']
  }
};
