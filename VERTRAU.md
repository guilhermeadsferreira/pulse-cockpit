# ESPECIFICAÇÃO DE INTEGRAÇÃO
## Contrato JSON — Protocolo Genérico CNAB
### Mais Todos ⇄ Vertrau

| **Versão:** | 1.0 |
|---|---|
| **Data de criação:** | 25/03/2025 |
| **Última revisão:** | 30/03/2026 |
| **Padrão:** | Genérico (CNAB 240, 400 e similares) |
| **Status:** | Para revisão e aprovação da Vertrau |
| **Responsáveis:** | **Guilherme Ferreira** — Coordenador de TI · **Guilherme Carvalho** — Staff Engineer |

> **Sobre este documento:** Fluxo 1: além dos dados brutos do CNAB (fields), a Vertrau retorna um payload semântico por tipo de transação (objeto transaction), permitindo que a Mais Todos crie agendamentos sem interpretar segmentos CNAB. Fluxo 2: a Mais Todos envia os dados brutos da remessa (persistidos do Fluxo 1) + os dados de resultado de cada transação. A Vertrau é stateless — não guarda estado entre fluxos. Responsabilidades: a fronteira entre os dois sistemas é clara — Vertrau fala CNAB, Mais Todos fala pagamentos.

---

## Sumário

1. Princípios de Design
2. Visão Geral dos Fluxos
3. Estrutura Genérica do Contrato
   - 3.1 Objeto raiz
   - 3.2 Objeto metadados
   - 3.3 Estrutura de Lote
   - 3.4 Estrutura de Detalhe (Segmento)
4. Fluxo 1 — Parser de Arquivo de Remessa
   - 4.1 Descrição
   - 4.2 Estrutura do JSON de Saída
   - 4.3 Estrutura do objeto transaction
   - 4.4 Exemplos de transaction por tipo
5. Fluxo 2 — Gerador de Arquivo de Retorno
   - 5.1 Descrição
   - 5.2 Estrutura do JSON de Entrada
   - 5.3 Objeto resultado
   - 5.4 Responsabilidade da Vertrau no Fluxo 2
6. Papéis e Responsabilidades
7. Convenções Gerais
   - 7.1 Tratamento de Erros
8. Decisões de Integração
   - 8.1 Mapeamento de Status — Mais Todos para FEBRABAN (G059)
   - 8.2 Modelo de Retorno Parcial
   - 8.3 Identificação de Transações — numero_documento
   - 8.4 Retenção dos Fields Brutos
   - 8.5 Vertrau é Stateless
   - 8.6 Separação de Domínios
   - 8.7 O que a Mais Todos Não Precisa Saber
   - 8.8 Infraestrutura SFTP — Itens a Alinhar com a Vertrau
9. Plano de Ação
10. Glossário

---

# 1. Princípios de Design

Esta versão reforça a separação de responsabilidades entre os sistemas. Os princípios abaixo guiam todas as decisões de contrato:

| **Princípio** | **Mais Todos** | **Vertrau** |
|---|---|---|
| Linguagem de domínio | Fala em pagamentos: tipo, valor, favorecido, status, autenticação. | Fala em CNAB: segmentos, fields, layouts, posições. |
| Conhecimento de CNAB | Zero. Não interpreta segmentos, não monta fields, não conhece layouts. | Total. Parser, gerador, mapeamento posicional e semântico. |
| Estado entre fluxos | Persistem os dados estruturados do Fluxo 1 para uso no Fluxo 2. | Stateless. Cada chamada é autocontida — não guarda dados entre fluxos. |
| Contrato de agendamento | Define seus próprios DTOs internamente. Faz o mapeamento final do objeto transaction para seus DTOs internos. | Retorna payload semântico genérico — não conhece a API interna da Mais Todos. |

---

# 2. Visão Geral dos Fluxos

A integração é composta por dois fluxos independentes.

| **#** | **Nome** | **Entrada** | **Saída** |
|---|---|---|---|
| 1 | Parser (Remessa) | Arquivo .rem via SFTP | JSON com dados brutos (fields) + objeto transaction semântico por transação. |
| 2 | Gerador (Retorno) | JSON com dados brutos da remessa + resultado de cada transação | Arquivo .ret depositado via SFTP. Nota: a entrada do Fluxo 2 também fará uso de SFTP. |

---

# 3. Estrutura Genérica do Contrato

Todo arquivo CNAB — independente do tipo — possui uma hierarquia bem definida. O contrato JSON espelha exatamente essa hierarquia:

```
arquivo
  ├── metadados          (tipo CNAB, versão do layout, banco, datas)
  ├── cabecalho_arquivo  (registro 0 — Cabeçalho de Arquivo)
  ├── lotes[]
  │     ├── cabecalho_lote  (Cabeçalho de Lote)
  │     ├── detalhes[]      (Segmentos: A, B, J, O, etc.)
  │     │     ├── segmento            (tipo do segmento)
  │     │     ├── numero_sequencial   (posição no lote)
  │     │     ├── fields[]            (campos brutos chave-valor)
  │     │     └── transaction         (payload semântico — apenas Fluxo 1)
  │     └── trailer_lote   (Trailer de Lote)
  └── trailer_arquivo    (registro 9 — Trailer de Arquivo)
// Nota: transaction existe apenas em detalhes[] — não em trailers
```

## 3.1 Objeto raiz

O objeto raiz do JSON contém sempre os seguintes blocos de primeiro nível:

| **Campo** | **Tipo** | **Obrigatório** | **Descrição** |
|---|---|---|---|
| metadados | object | Sim | Identificação do tipo de CNAB, versão do layout e banco. Permite que a Vertrau saiba qual dicionário aplicar. |
| cabecalho_arquivo | object | Sim | Campos do registro Cabeçalho de Arquivo (tipo 0). Contém dados da empresa pagadora. |
| lotes | array | Sim | Lista de lotes do arquivo. Cada lote possui cabeçalho, detalhes e trailer próprios. |
| trailer_arquivo | object | Sim | Campos do registro Trailer de Arquivo (tipo 9). Contém totalizadores globais. |

## 3.2 Objeto metadados

O bloco metadados é o que torna o contrato genérico. No Fluxo 1, ele é extraído do próprio arquivo .rem pela Vertrau e retornado no JSON — a Mais Todos deve persistir esse bloco junto com os fields brutos. No Fluxo 2, a Mais Todos reenvia o bloco metadados recebido no Fluxo 1 para que a Vertrau identifique qual banco e layout aplicar na geração do .ret (ver seção 8.5 — Vertrau é stateless).

```json
"metadados": {
  "tipo_cnab":      "240",       // "240" | "400" | "150" | ...
  "versao_layout":  "040",       // versão conforme especificação FEBRABAN
  "codigo_banco":   "341",       // código de compensação do banco (3 dígitos)
  "nome_banco":     "ITAU",      // nome legível — auxiliar, não obrigatório
  "data_geracao":   "2025-03-25",
  "hora_geracao":   "14:30:00"
}
```

| **Campo** | **Tipo** | **Obrigatório** | **Descrição** |
|---|---|---|---|
| tipo_cnab | string | Sim | Tipo do layout CNAB. Exemplos: 240, 400. |
| versao_layout | string | Sim | Versão do layout conforme especificação FEBRABAN. Exemplo: 040. |
| codigo_banco | string | Sim | Código de compensação do banco com 3 dígitos. Exemplo: 341 para Itaú, 237 para Bradesco. |
| nome_banco | string | Não | Nome legível do banco. Meramente informativo. |
| data_geracao | string | Sim | Data de geração do arquivo no formato ISO 8601 (YYYY-MM-DD). |
| hora_geracao | string | Sim | Hora de geração no formato HH:MM:SS. |

## 3.3 Estrutura de Lote

Cada elemento do array lotes contém:

| **Campo** | **Tipo** | **Obrigatório** | **Descrição** |
|---|---|---|---|
| numero_lote | number | Sim | Número sequencial do lote dentro do arquivo. Inicia em 1. |
| cabecalho_lote.fields | array | Sim | Campos do Cabeçalho de Lote. Inclui tipo de serviço, forma de lançamento, etc. |
| detalhes | array | Sim | Lista de registros de detalhe (segmentos). Cada detalhe representa uma transação ou parte dela. |
| trailer_lote.fields | array | Sim | Campos do Trailer de Lote. Calculado pela Vertrau — inclui totalizadores do lote. |

## 3.4 Estrutura de Detalhe (Segmento)

Cada detalhe dentro de um lote representa um registro de segmento. A estrutura é idêntica para todos os tipos — o campo segmento identifica o tipo, e os campos específicos ficam no array fields. No Fluxo 1, cada detalhe inclui também o objeto transaction com o payload semântico.

| **Campo** | **Tipo** | **Obrigatório** | **Descrição** |
|---|---|---|---|
| segmento | string | Sim | Identificador do tipo de segmento: A, B, J ou O. |
| numero_sequencial | number | Sim | Número do registro dentro do lote. Calculado pela Vertrau no Fluxo 1 e no .ret. |
| fields | array | Sim | Campos brutos extraídos do CNAB no formato chave-valor `{ name, value }`. |
| transaction | object | Fluxo 1 apenas | Payload semântico por tipo de transação. Presente apenas no retorno do Fluxo 1. Ver seção 4.3. |

> **Relação entre Segmento A e Segmento B:** No CNAB 240, o Segmento B é complementar ao Segmento A. Quando presente, o Segmento B DEVE aparecer imediatamente após o Segmento A correspondente no array detalhes, com `numero_sequencial = numero_sequencial(A) + 1`.

---

# 4. Fluxo 1 — Parser de Arquivo de Remessa

## 4.1 Descrição

A Mais Todos disponibiliza o arquivo .rem via SFTP. A Vertrau processa e retorna um JSON com duas camadas por transação:

- **fields**: dados brutos extraídos do CNAB, exatamente como estão no arquivo. A Mais Todos persiste isso para uso no Fluxo 2.
- **transaction**: payload semântico genérico que descreve a transação na linguagem de pagamentos. A Mais Todos usa isso para criar agendamentos, mapeando para seus próprios DTOs.

## 4.2 Estrutura do JSON de Saída

O JSON mantém a hierarquia genérica descrita na seção 3 (metadados → cabecalho_arquivo → lotes → detalhes → trailer). O diferencial está dentro de cada detalhe: além dos fields brutos, cada registro inclui o objeto transaction.

```json
{
  "metadados": {
    "tipo_cnab":      "240",
    "versao_layout":  "040",
    "codigo_banco":   "341",
    "nome_banco":     "ITAU",       // opcional — meramente informativo
    "data_geracao":   "2025-03-25",
    "hora_geracao":   "14:30:00"
  },
  "cabecalho_arquivo": { "fields": [ ... ] },
  "lotes": [
    {
      "numero_lote": 1,
      "cabecalho_lote": { "fields": [ ... ] },
      "detalhes": [
        {
          "segmento":          "A",
          "numero_sequencial": 1,
          "fields": [ ... ],      // dados brutos do CNAB — persistir para o Fluxo 2
          "transaction": { ... }  // objeto semântico — usar para criar agendamento
        }
      ],
      "trailer_lote": { "fields": [ ... ] }
    }
    // Nota PIX (pix_chave / pix_conta): detalhes terá Seg A (com transaction)
    // + Seg B logo após (sem transaction — dados complementares apenas em fields[])
  ],
  "trailer_arquivo": { "fields": [ ... ] }
}
```

## 4.3 Estrutura do objeto transaction

**transaction** é o objeto que elimina o conhecimento de CNAB da Mais Todos. Ele sempre possui:

| **Campo** | **Tipo** | **Obrigatório** | **Descrição** |
|---|---|---|---|
| tipo | string | Sim | Tipo semântico da transação. Ver tabela de tipos abaixo. |
| numero_documento | string | Sim | Identificador da transação extraído do CNAB. Chave de correlação entre Fluxo 1 e Fluxo 2. |
| data_liquidacao | string | Sim | Data de liquidação no formato ISO 8601 (YYYY-MM-DD). |
| valor | string | Sim | Valor da transação como string decimal com 2 casas. Ex: "5000.00". |
| pagamento | object | Sim | Dados semânticos específicos de cada tipo. Ver exemplos por tipo abaixo. |

### Tipos de transação suportados

| **tipo** | **Origem no CNAB** | **Descrição** |
|---|---|---|
| pix_chave | Seg A + forma_lancamento 45 + Seg B com chave | PIX por chave (CPF, CNPJ, EVP, e-mail, telefone) |
| pix_conta | Seg A + forma_lancamento 45 + Seg B sem chave | PIX manual com dados bancários do favorecido |
| pix_qrcode | Seg A + forma_lancamento 45 + Seg B com payload EMV | PIX por QR Code — payload completo BR Code/EMV |
| ted | Seg A + forma_lancamento 41 | TED — transferência com dados bancários |
| boleto | Seg J | Pagamento de boleto por código de barras |
| concessionaria | Seg O | Pagamento de concessionária / tributo por código de barras |

## 4.4 Exemplos de transaction por tipo

### PIX por chave (tipo: pix_chave)

```json
"transaction": {
  "tipo":             "pix_chave",
  "numero_documento": "REF-2025-001",
  "data_liquidacao":  "2025-03-26",
  "valor":            "5000.00",
  "pagamento": {
    "chave": {
      "tipo":  "cpf",           // cpf | cnpj | evp | email | telefone
      "valor": "98765432100"
    },
    "descricao": "PGTO FAT 123"
  }
}
```

### PIX Manual (tipo: pix_conta)

```json
"transaction": {
  "tipo":             "pix_conta",
  "numero_documento": "REF-2025-002",
  "data_liquidacao":  "2025-03-26",
  "valor":            "3000.00",
  "pagamento": {
    "favorecido": {
      "nome":      "JOAO SILVA",
      "documento": "98765432100",
      "conta": {
        "agencia": "4321",
        "numero":  "654321-2",
        "tipo":    "corrente",
        "banco": {
          "codigo": "341",
          "nome":   "ITAU",
          "ispb":   "0341000"
        }
      }
    },
    "descricao": "PGTO SERVICOS"
  }
}
```

### PIX QR Code (tipo: pix_qrcode)

```json
"transaction": {
  "tipo":             "pix_qrcode",
  "numero_documento": "REF-2025-006",
  "data_liquidacao":  "2025-03-26",
  "valor":            "163.05",
  "pagamento": {
    "qrcode":    "00020126...",
    "descricao": "PGTO PIX QRCODE"
  }
}
```

### TED (tipo: ted)

```json
"transaction": {
  "tipo":             "ted",
  "numero_documento": "REF-2025-003",
  "data_liquidacao":  "2025-03-26",
  "valor":            "8000.00",
  "pagamento": {
    "favorecido": {
      "nome":      "MARIA SOUZA",
      "documento": "12345678900",
      "conta": {
        "agencia": "0001",
        "numero":  "987654-3",
        "tipo":    "corrente",
        "banco": {
          "codigo": "237",
          "nome":   "BRADESCO"
        }
      }
    },
    "descricao": "PGTO FORNECEDOR"
  }
}
```

### Boleto (tipo: boleto)

```json
"transaction": {
  "tipo":             "boleto",
  "numero_documento": "REF-2025-004",
  "data_liquidacao":  "2025-03-26",
  "valor":            "1500.00",
  "pagamento": {
    "codigo_barras": "00190000090265044100074831016573740000010000",
    "descricao":     "PGTO BOLETO FORN XYZ"
  }
}
```

### Concessionária (tipo: concessionaria)

```json
"transaction": {
  "tipo":             "concessionaria",
  "numero_documento": "REF-2025-005",
  "data_liquidacao":  "2025-03-26",
  "valor":            "163.05",
  "pagamento": {
    "codigo_barras": "836600000011630500069032025032600000015000",
    "descricao":     "CONTA LUZ MAR25"
  }
}
```

> **Como a Mais Todos usa o objeto transaction:** A Mais Todos não interpreta os campos do transaction para entender regras de CNAB — ele é tratado como payload de negócio. Ela lê o campo tipo e mapeia para seu DTO interno de agendamento correspondente. Os campos de pagamento são mapeados para o DTO interno correspondente ao tipo — uma operação simples de transformação de campos. O mapeamento CNAB → transaction (ex: Seg A + forma_lancamento 45 → tipo: pix_chave) é responsabilidade exclusiva da Vertrau.

---

# 5. Fluxo 2 — Gerador de Arquivo de Retorno

## 5.1 Descrição

O Fluxo 2 é utilizado em dois momentos: **Aprovação** e **Retorno** (após execução D-0). Em ambos, a Mais Todos envia à Vertrau um JSON com os dados necessários para gerar o arquivo .ret.

- **Dados brutos da remessa (fields)**: persistidos do Fluxo 1, exatamente como foram recebidos. A Mais Todos não interpreta — só armazena e reenvia.
- **Dados de resultado**: gerados pela Mais Todos conforme o momento — AGENDADO (na aprovação) ou PAGO/FALHA/DEVOLVIDO (no retorno).

> **Vertrau é stateless (ver seção 8.5):** cada chamada ao Fluxo 2 deve ser autocontida — tudo que a Vertrau precisa para gerar o .ret deve estar no payload recebido.

## 5.2 Estrutura do JSON de Entrada

```json
{
  "id_solicitacao":         "RET_20250325_001",
  "arquivo_remessa_origem": "CNAB_20250325_001.rem",
  "tipo_retorno":           "RETORNO",
  "data_referencia":        "2025-03-26",
  "transacoes": [
    {
      "id_interno":        "agt_20250325_00123",  // gerado pela Mais Todos
      "numero_documento": "REF-2025-001",
      "dados_remessa": {
        "segmento":          "A",
        "numero_sequencial": 1,
        "fields": [
          { "name": "favorecido_banco",    "value": "341"          },
          { "name": "favorecido_agencia",  "value": "4321"         },
          { "name": "favorecido_conta",    "value": "654321"       },
          { "name": "favorecido_nome",     "value": "JOAO SILVA"   },
          { "name": "favorecido_cpf_cnpj", "value": "98765432100"  },
          { "name": "data_pagamento",      "value": "2025-03-26"  },
          { "name": "valor",               "value": "5000.00"     },
          { "name": "numero_documento",     "value": "REF-2025-001"}
        ]
      },
      "resultado": {
        "status":          "PAGO",
        "data_efetivacao": "2025-03-26",
        "valor_pago":      "5000.00",
        "autenticacao":    "75392018364",
        "motivo_falha":    null
      }
    },
    {
      "id_interno":        "agt_20250325_00124",
      "numero_documento": "REF-2025-004",
      "dados_remessa": {
        "segmento":          "J",
        "numero_sequencial": 3,
        "fields": [
          { "name": "codigo_barras",   "value": "00190000090265..." },
          { "name": "nome_cedente",    "value": "FORNECEDOR XYZ"    },
          { "name": "data_vencimento", "value": "2025-03-30"        },
          { "name": "valor_nominal",   "value": "1500.00"           },
          { "name": "numero_documento","value": "REF-2025-004"      }
        ]
      },
      "resultado": {
        "status":          "FALHA",
        "data_efetivacao": null,
        "valor_pago":      null,
        "autenticacao":    null,
        "motivo_falha":    "saldo_insuficiente"
      }
    }
  ]
}
```

## 5.3 Objeto resultado

O campo status varia conforme o tipo_retorno enviado:

| **tipo_retorno** | **status esperados** | **Descrição** |
|---|---|---|
| APROVACAO | AGENDADO | Transação aprovada, aguardando execução. |
| RETORNO | PAGO, FALHA, DEVOLVIDO | Resultado consolidado após processamento. |

| **Campo** | **Tipo** | **Obrigatório** | **Descrição** |
|---|---|---|---|
| status | string | Sim | AGENDADO (aprovação) ou PAGO/FALHA/DEVOLVIDO (retorno). |
| data_efetivacao | string | Sim se PAGO | Data real de efetivação no formato ISO 8601. Null nos demais casos. |
| valor_pago | string | Sim se PAGO | Valor efetivamente debitado. Pode diferir do nominal em boletos com juros/mora. Null nos demais casos. |
| autenticacao | string | Sim se PAGO | Número de autenticação/comprovante fornecido pelo banco. Null nos demais casos. |
| motivo_falha | string | Sim se FALHA | Descrição genérica do motivo da falha. A lista de valores válidos é definida pela Vertrau com base nos códigos FEBRABAN. A Vertrau usa esse campo para determinar o código G059 no .ret. Null nos demais casos. |

> **Sobre o status DEVOLVIDO:** Indica estorno após execução bem-sucedida. Os campos `data_efetivacao` e `valor_pago` devem ser preenchidos com os dados da transação original que foi devolvida. Os campos `autenticacao` e `motivo_falha` são null.

## 5.4 Responsabilidade da Vertrau no Fluxo 2

A Vertrau recebe o payload e é responsável por:

- Ler os fields de dados_remessa e reconstruir os registros do .ret na posição correta de cada campo.
- Ler os campos de resultado e mapear para os campos CNAB correspondentes (ex: status + motivo_falha → código G059, autenticacao → campo autenticação do banco).
- Calcular totalizadores do trailer de lote e trailer de arquivo.
- Gerar o arquivo .ret válido e depositá-lo no SFTP.

> **O que a Mais Todos não precisa saber:** Em qual campo posicional do .ret o código G059 é escrito. Qual segmento corresponde a cada tipo de transação no arquivo de retorno. Como calcular os totalizadores do trailer. Qualquer regra de formatação posicional do CNAB.

---

# 6. Papéis e Responsabilidades

| **Responsabilidade** | **Mais Todos** | **Vertrau** |
|---|---|---|
| Definição do contrato JSON | Responsável. Define e documenta os contratos dos Fluxos 1 e 2. | Implementa conforme o contrato recebido. |
| Parser CNAB → JSON + transaction | Não aplicável. | Responsável. Parseia o .rem, monta os fields brutos e gera o objeto transaction semântico por transação. |
| Mapeamento CNAB → tipo de transação | Não aplicável. | Responsável. Define internamente qual segmento + forma de lançamento resulta em qual tipo do objeto transaction. |
| Mapeamento transaction → DTO interno | Responsável. Lê o tipo e transforma no seu próprio DTO de agendamento. | Não aplicável. Não conhece a API interna da Mais Todos. |
| Persistência dos dados do parse | Responsável. Persiste os fields brutos do Fluxo 1 para reenvio no Fluxo 2. | Não aplicável. Stateless — não persiste dados entre fluxos. |
| Gerador JSON → CNAB (.ret) | Não aplicável. | Responsável. Recebe o payload do Fluxo 2 e gera o arquivo .ret completo. |
| Regras de formatação do .ret | Não aplicável. | Responsável. Monta posições, calcula totalizadores, aplica layout do banco. |
| Disponibilização via SFTP — arquivo .rem | Responsável por realizar o upload do arquivo .rem na pasta combinada. | Responsável por depositar o resultado da ingestão do .rem em formato JSON no diretório combinado. |
| Disponibilização via SFTP — arquivo de retorno | Responsável por realizar o upload do JSON com dados para geração do arquivo de retorno na pasta combinada. | Responsável por depositar o arquivo .ret gerado no diretório combinado. |

---

# 7. Convenções Gerais

As convenções abaixo se aplicam a todos os campos de todos os contratos:

- **Valores monetários:** sempre string decimal com 2 casas usando ponto. Ex: "5000.00". Nunca usar number ou vírgula.
- **Datas:** sempre ISO 8601 no formato YYYY-MM-DD. Horários no formato HH:MM:SS.
- **numero_documento:** é a chave de correlação entre Fluxo 1 e Fluxo 2. Recomendamos que seja único por lote para facilitar a conciliação. A Mais Todos o preserva sem alteração, mas não o utiliza como chave primária — essa função é do id_interno.
- **fields:** a Mais Todos persiste e reenvia exatamente como recebeu — sem transformação, reordenação ou enriquecimento.
- **Campos nulos:** omitir do objeto quando não aplicável, exceto motivo_falha e data_efetivacao que devem ser explicitamente null quando não preenchidos.

## 7.1 Tratamento de Erros

Quando a Vertrau não conseguir processar o arquivo ou o payload, deve retornar o seguinte formato:

```json
{
  "arquivo_origem":  "CNAB_20250325_001.rem",
  "id_solicitacao":  null,                      // preenchido apenas no Fluxo 2
  "codigo_erro":     "LAYOUT_NAO_SUPORTADO",
  "mensagem":        "Banco 999 não está configurado.",
  "timestamp":       "2025-03-25T14:30:00Z"
}
```

---

# 8. Decisões de Integração

Esta seção documenta as decisões arquiteturais tomadas durante o processo de especificação. Serve como referência para ambas as partes sobre o raciocínio por trás de cada escolha.

## 8.1 Mapeamento de Status — Mais Todos para FEBRABAN (G059)

A Mais Todos opera em linguagem de negócio: AGENDADO, PAGO, FALHA ou DEVOLVIDO. A Vertrau é responsável por traduzir esses status genéricos para os códigos G059 corretos no arquivo .ret.

> **Regra:** A Mais Todos envia: `status` (genérico) + `motivo_falha` (descrição textual, apenas quando FALHA). A Vertrau traduz para o código G059 correspondente. A Mais Todos é agnóstica em relação a códigos FEBRABAN — isso é domínio exclusivo da Vertrau.

### Definição dos motivos de falha

Os `motivo_falha` válidos são definidos pela **Vertrau**, que conhece os códigos FEBRABAN. A Vertrau deve compartilhar a lista de `motivo_falha` suportados, cada um mapeado para o código G059 correspondente.

> **A definir com a Vertrau:** A lista de `motivo_falha` e seus códigos G059 correspondentes será definida em conjunto. A Vertrau propõe os motivos em linguagem de negócio que façam sentido para a Mais Todos, e a Mais Todos adota esses motivos na sua comunicação.

### Tabela de mapeamento — status semântico → G059

| **Status (Mais Todos)** | **Código G059** | **Significado FEBRABAN** | **Quando usar** |
|---|---|---|---|
| AGENDADO | *(a definir com Vertrau)* | Registro agendado | Momento de aprovação |
| PAGO | 00 | Crédito ou débito efetivado | Sucesso na execução |
| DEVOLVIDO | 02 | Cancelado pelo pagador/credor | Estorno após execução |

### Tabela de mapeamento — motivo_falha → G059 (a definir com Vertrau)

A Vertrau deve fornecer a lista completa de `motivo_falha` suportados. Exemplo de formato:

| **motivo_falha** | **Código G059** | **Significado FEBRABAN** |
|---|---|---|
| *(a definir)* | *(a definir)* | *(a definir)* |

> **Como a Vertrau aplica esta tabela:** Para PAGO e DEVOLVIDO, o código G059 é direto. Para FALHA, a Vertrau interpreta o `motivo_falha` e consulta a tabela de mapeamento. Se o motivo não estiver mapeado, usa BF (rejeição genérica) como fallback. O campo G059 no .ret suporta até 5 ocorrências simultâneas (10 caracteres, 2 por código).

## 8.2 Modelo de Retorno Parcial

Uma remessa pode conter transações agendadas para dias diferentes. O arquivo de retorno não é único — ele é gerado em versões ao longo do ciclo de vida da remessa, refletindo cada momento do processamento.

### Momentos de geração do .ret

| **Momento** | **Gatilho** | **Status no .ret** | **Descrição** |
|---|---|---|---|
| Aprovação do lote | Usuário com permissão aprova transações | Registro agendado | Confirma que as transações foram aceitas e estão agendadas para execução em D-1. |
| D0 (solicitação) | Processing D-1 concluído | Liquidação efetivada ou Rejeição operacional | Consolida o resultado final de cada transação do D-1. |

**Definição de D-1 e D0:**
> **Atenção:** D-1 e D0 não significam "um dia antes" e "dia atual" no sentido calendário genérico. São termos relativos ao ciclo de processamento:
- **D-1 (dia de referência)**: Dia em que as transações foram executadas. É o dia ao qual o .ret se refere.
- **D0 (dia de processamento)**: Dia em que a Mais Todos solicita o .ret — sempre posterior ao D-1.

### Fluxo completo

1. **Aprovação**: Quando um lote de transações é aprovado por um usuário com permissão, a Mais Todos envia o JSON do Fluxo 2 e a Vertrau gera um .ret com status **Registro agendado** para cada transação aprovada.
2. **Solicitação D0**: No dia de solicitação (D0), a Mais Todos (agindo como banco para seus clientes) processa as transações executadas no D-1. A Mais Todos envia um novo JSON do Fluxo 2 com os resultados consolidados do D-1, e a Vertrau gera um novo .ret com **Liquidação efetivada** (sucesso) ou **Rejeição operacional** (falha).

> **Regra:** Uma remessa gera múltiplos .ret ao longo do tempo. Cada .ret é amarrado à remessa de origem pelo arquivo_remessa_origem. O .ret de aprovação e o .ret de execução são independentes — transações não aparecem no .ret de execução enquanto não forem aprovadas.

### Mapa de Status CNAB — Visão arquivo Retorno (.ret)

| **Status CNAB (.ret)** | **Momento** | **Significado** |
|---|---|---|
| Registro agendado | Aprovação do lote | Transação aprovada e aguardando execução em D-1. |
| Liquidação efetivada | D0 (solicitação) | Item processado com sucesso pela Mais Todos. |
| Rejeição operacional | D0 (solicitação) | Item resultou em erro no processamento. |

### Exemplo de ciclo de vida

```
CNAB_20250325_001.rem
  Transação 1  data_liquidacao: 2025-03-26  (agendada para D-1 = 26/03)
  Transação 2  data_liquidacao: 2025-03-26  (agendada para D-1 = 26/03)
  Transação 3  data_liquidacao: 2025-03-28  (agendada para D-1 = 28/03)

--- MOMENTO 1: Aprovação ---
RET_CNAB_20250325_001_20250325_APROVACAO.ret  → Todas: Registro agendado

--- MOMENTO 2: Solicitação D0 (27/03) — reporta D-1 (26/03) ---
RET_CNAB_20250325_001_20250326_RETORNO.ret  → Transações 1 e 2: Liquidação efetivada
                                               Transação 3: ainda não aparece (agendada para 28)

--- MOMENTO 3: Solicitação D0 (29/03) — reporta D-1 (28/03) ---
RET_CNAB_20250325_001_20250328_RETORNO.ret  → Transação 3: Liquidação efetivada
```

### Convenção de nomenclatura do .ret

O .ret possui dois tipos de nomenclatura, um para cada momento do ciclo:

| **Tipo** | **Partes** | **Formato** | **Exemplo** |
|---|---|---|---|
| Aprovação | Prefixo + Nome do arquivo .rem de origem + _ + Data aprovação + _ + APROVACAO | RET\_{arquivo_remessa}\_{data_aprovacao}\_APROVACAO.ret | RET\_CNAB\_20250325\_001\_20250325\_APROVACAO.ret |
| Retorno | Prefixo + Nome do arquivo .rem de origem + _ + Data D-1 + _ + RETORNO | RET\_{arquivo_remessa}\_{data_d1}\_RETORNO.ret | RET\_CNAB\_20250325\_001\_20250326\_RETORNO.ret |

### Campo data_referencia no JSON do Fluxo 2

O JSON do Fluxo 2 inclui o campo data_referencia no objeto raiz, identificando o período ao qual aquele lote de resultados se refere. O campo tipo_retorno indica se é uma aprovação ou um retorno:

```json
{
  "id_solicitacao":         "RET_20250325_001",
  "arquivo_remessa_origem": "CNAB_20250325_001.rem",
  "tipo_retorno":          "APROVACAO",
  "data_referencia":       "2025-03-25",
  "transacoes": [
    {
      "numero_documento": "REF-2025-001",
      "dados_remessa": { ... },
      "resultado": {
        "status":          "AGENDADO",
        "data_efetivacao": null,
        "valor_pago":      null,
        "autenticacao":    null,
        "motivo_falha":    null
      }
    }
  ]
}
```

| **Campo** | **Tipo** | **Obrigatório** | **Descrição** |
|---|---|---|---|
| tipo_retorno | string | Sim | Indica o momento do .ret: APROVACAO (após aprovação) ou RETORNO (após solicitação D0). |
| data_referencia | string | Sim | Data do período reportado. Em APROVACAO: data da aprovação. Em RETORNO: data D-1 das transações. |
| arquivo_remessa_origem | string | Sim | Nome do arquivo .rem de origem. Amarra o .ret à remessa correspondente. |

## 8.3 Identificação de Transações — numero_documento

O numero_documento é um campo preenchido pelo ERP do cliente no arquivo de remessa para identificar cada transação com uma referência própria. É o elo de conciliação entre o arquivo CNAB e o sistema do pagador.

> **Regra:** O numero_documento é tratado como dado informativo de conciliação — não como chave primária. A Mais Todos gera um id_interno próprio para cada transação ao criar o agendamento. No Fluxo 2, o id_interno é a chave primária que identifica cada transação. O numero_documento é enviado como dado complementar.
>
> O numero_documento é campo obrigatório e não pode estar vazio. Recomendamos que o ERP do cliente preencha com até 15 caracteres alfanuméricos. Arquivos de remessa com transações sem numero_documento serão rejeitados no Fluxo 1 — a ausência do campo indica um problema no ERP do cliente que deve ser corrigido na origem. Essa validação existe para garantir a rastreabilidade e a conciliação do lado do cliente.

| **Campo** | **Responsável** | **Papel na integração** |
|---|---|---|
| numero_documento | ERP do cliente | Referência de conciliação do lado do cliente. Extraído do .rem pela Vertrau no Fluxo 1 e preservado pela Mais Todos. Retorna no .ret para o cliente reconciliar com seu sistema. |
| id_interno | Mais Todos | Chave primária da transação no sistema da Mais Todos. Gerado no momento da criação do agendamento. Usado como identificador no Fluxo 2. |

```json
// Fluxo 2 — cada transação identifica-se pelo id_interno
{
  "id_interno":       "agt_20250326_00123",  // gerado pela Mais Todos
  "numero_documento": "REF-2025-001",        // preservado do .rem original
  "dados_remessa": { ... },
  "resultado":     { ... }
}
```

## 8.4 Retenção dos Fields Brutos

A Mais Todos é responsável por persistir os fields brutos recebidos no Fluxo 1. Esses dados são necessários tanto para a criação de agendamentos quanto para o reenvio no Fluxo 2 na geração do .ret.

> **Regra:** Retenção definida em 5 anos — alinhada com exigências do Banco Central para registros de transações financeiras. A retenção é responsabilidade exclusiva da Mais Todos. A Vertrau é stateless e não guarda nenhum dado entre fluxos. Se a Mais Todos precisar regenerar um .ret de uma remessa antiga, ela precisa ter os fields disponíveis para reenviar.

### Estratégia de armazenamento por camadas (S3 Lifecycle)

| **Período** | **Storage class** | **Custo relativo** | **Uso esperado** |
|---|---|---|---|
| 0 a 90 dias | S3 Standard | Normal | Acesso frequente — geração de .ret e reconciliação recente. |
| 90 dias a 1 ano | S3 Standard-IA | ~60% menor | Acesso infrequente — consultas ocasionais e reprocessamentos. |
| 1 a 5 anos | S3 Glacier | ~80% menor | Arquivo frio — auditoria, compliance e disputas. |
| Após 5 anos | Exclusão automática | — | Dados expirados conforme política de retenção. |

## 8.5 Vertrau é Stateless

| **Regra** | **Justificativa** |
|---|---|
| Vertrau não persiste dados entre fluxos | Permite escalar para múltiplos clientes sem acumular estado por cliente. Cada chamada é independente. |
| Mais Todos persiste os fields brutos do Fluxo 1 | Já precisa persistir os dados do parse para criar agendamentos. Reutiliza a mesma persistência para o Fluxo 2. |
| Fluxo 2 reenvia os fields sem alteração | A Mais Todos não interpreta os fields — só armazena e reenvia. Elimina risco de transformação incorreta de dados CNAB. |

## 8.6 Separação de Domínios

| **Mais Todos sabe** | **Vertrau sabe** |
|---|---|
| Que um pagamento PIX foi executado com sucesso | Que Seg A + forma_lancamento 45 + Seg B = PIX |
| Que o banco retornou um código de autenticação | Em qual posição do Segmento A o código de autenticação é escrito |
| Que o valor pago foi R$ 5.000,00 | Que o valor pago vai nas posições 87-101 com 2 casas decimais |
| Que o pagamento falhou por insuficiência de fundos | Que insuficiência de fundos = código G059 AB no arquivo .ret |
| Que o favorecido tem CPF 987.654.321-00 | Que o CPF do favorecido vai nas posições 18-32 do Segmento A |
| Que o ISPB do banco favorecido é necessário para PIX Manual | Em qual campo posicional do segmento o ISPB é escrito e como deve ser formatado |

## 8.7 O que a Mais Todos Não Precisa Saber

Lista explícita do conhecimento de CNAB que foi abstraído para a Vertrau:

- Que um pagamento PIX gera 2 linhas no arquivo (Segmento A + Segmento B).
- Que existe cabeçalho e trailer de lote — e que precisam ser calculados.
- Como os pagamentos são agrupados em lotes dentro do arquivo.
- Quantas linhas tem o arquivo .ret no total.
- Qual posição no arquivo cada campo ocupa.
- Que o código de ocorrência G059 ocupa as posições 231-240 de cada segmento.
- Que o G059 suporta até 5 ocorrências simultâneas de 2 dígitos cada.
- Qual código G059 corresponde a cada resultado de pagamento.
- Que boleto com juros resulta em valor_pago diferente do valor_nominal no .ret.

## 8.8 Infraestrutura SFTP — Itens a Alinhar com a Vertrau

Com a definição de que o servidor SFTP será de responsabilidade da Vertrau, os pontos abaixo precisam ser acordados antes da etapa de implementação.

### SLAs de processamento

Precisamos entender os tempos garantidos para cada etapa do ciclo de vida dos dois fluxos:

| **Etapa** | **Descrição** | **SLA esperado** |
|---|---|---|
| Leitura do .rem | Tempo entre o upload do arquivo .rem no SFTP e o início do processamento pela Vertrau | ? |
| Escrita do JSON parseado | Tempo entre o início do processamento do .rem e a disponibilização do JSON (fields + transaction) no SFTP | ? |
| Leitura do JSON de entrada | Tempo entre o upload do JSON do Fluxo 2 no SFTP e o início da geração do .ret | ? |
| Escrita do arquivo .ret | Tempo entre o início da geração e a disponibilização do .ret no SFTP | ? |

### Estrutura de pastas no servidor SFTP

A organização dos diretórios precisa ser definida antes da implementação:

- Haverá separação por cliente/empresa?
- Qual será a estrutura para arquivos de entrada (.rem e JSON do Fluxo 2) e de saída (JSON do Fluxo 1 e .ret)?
- Haverá pastas intermediárias (ex: /inbox, /processing, /done, /error)?
- Quem define a convenção de nomenclatura das pastas — a Vertrau propõe ou é negociado por cliente?

### Comunicação por eventos

A Vertrau suporta ou tem planos para algum mecanismo de notificação de eventos ao longo do ciclo de vida do processamento? Os eventos de interesse para a Mais Todos seriam:

- Remessa recebida (upload detectado)
- Remessa em processamento
- JSON de saída do Fluxo 1 disponível
- JSON de entrada do Fluxo 2 recebido
- Arquivo .ret em geração
- Arquivo .ret disponível
- Erro de processamento (com detalhe do motivo)

Caso haja suporte a webhooks, callbacks ou fila de mensagens (SNS, SQS, etc.), como funcionaria a integração?

### Confirmação de integridade do upload

Como a Vertrau valida que o upload de um arquivo foi concluído com sucesso antes de iniciar o processamento? Opções a discutir:

- Arquivo sentinela (ex: .done ou .ready depositado após o upload)
- Checksum (MD5 ou SHA-256) enviado junto ao arquivo
- Verificação por tamanho de arquivo
- Polling com tentativas e timeout
- Outro mecanismo que a Vertrau já utilize

O objetivo é evitar que um arquivo parcialmente transferido seja processado incorretamente.

---

# 9. Plano de Ação

| **#** | **Etapa** | **Descrição** | **Responsável** |
|---|---|---|---|
| 1 | Revisão deste documento | Vertrau revisa e valida a estrutura proposta. Levanta dúvidas ou necessidades de ajuste. | Ambos |
| 2 | Definição do dicionário de campos | Vertrau compartilha os nomes semânticos (campo name) que utilizará para cada tipo de CNAB e banco suportado. | Vertrau |
| 3 | Publicação do JSON Schema | Formalizar o contrato em JSON Schema (draft-07) e publicar em repositório compartilhado para validação automática. | Mais Todos |
| 4 | Infraestrutura SFTP | Configurar o servidor SFTP da Vertrau, criar usuário para a Mais Todos e trocar chaves SSH. | Vertrau |
| 5 | Implementação em sandbox | Ambos os lados implementam os fluxos 1 e 2 em ambiente de homologação. | Ambos |
| 6 | Testes de validação | Testes com arquivos CNAB reais para cada segmento (A, B, J, O). Validar round-trip: .rem → JSON + transaction → .ret. | Ambos |
| 7 | Aprovação e go-live | Validação final, assinatura do contrato de SLA e habilitação em produção. | Ambos |

---

# 10. Glossário

| **Termo** | **Definição** |
|---|---|
| CNAB | Centro Nacional de Automação Bancária. Padrão de arquivos de remessa/retorno bancário no Brasil, mantido pela FEBRABAN. |
| FEBRABAN | Federação Brasileira de Bancos. Mantenedora das especificações do padrão CNAB. |
| Remessa (.rem) | Arquivo enviado pela empresa ao banco com instruções de pagamento. |
| Retorno (.ret) | Arquivo enviado pelo banco à empresa com o resultado do processamento da remessa. |
| Lote | Agrupamento de transações dentro de um arquivo CNAB com tipo de serviço e forma de lançamento comuns. |
| Segmento | Tipo de registro de detalhe dentro de um lote. Ex: A (crédito em conta / PIX / TED), B (PIX complementar), J (boleto), O (concessionárias). |
| fields | Array de campos brutos extraídos do CNAB no formato chave-valor semântico. Definidos pela Vertrau, preservados pela Mais Todos. |
| transaction | Objeto semântico retornado pela Vertrau no Fluxo 1 por transação. Contém tipo, numero_documento, data_liquidacao, valor e pagamento. Usado pela Mais Todos para criar agendamentos. |
| pagamento | Campo dentro do objeto transaction com os dados específicos do tipo de pagamento (chave PIX, dados bancários, código de barras, QR Code, etc.). |
| numero_documento | Identificador da transação preenchido pelo ERP do cliente no arquivo de remessa. Usado para conciliação. Campo obrigatório — arquivos com transações sem numero_documento são rejeitados no Fluxo 1. Não é chave primária — a Mais Todos usa id_interno como chave. |
| id_interno | Identificador único da transação gerado pela Mais Todos ao criar o agendamento. Chave primária no Fluxo 2. |
| G059 | Campo FEBRABAN que armazena os códigos de ocorrência no arquivo de retorno. Posições 231-240 de cada segmento. Suporta até 5 ocorrências de 2 dígitos cada. |
| Parser | Processo de leitura e extração de dados de um arquivo CNAB posicional para JSON estruturado. Responsabilidade da Vertrau. |
| Gerador | Processo de criação de um arquivo CNAB posicional a partir de um JSON estruturado. Responsabilidade da Vertrau. |
| Dicionário de campos | Mapa de nomes semânticos para posições, tamanhos e tipos de cada campo em um layout/banco específico. Mantido internamente pela Vertrau. |
| data_referencia | Campo no JSON do Fluxo 2 que identifica o período reportado. Em APROVACAO: data da aprovação. Em RETORNO: data D-1 das transações reportadas. |
| Stateless | Modelo em que a Vertrau não persiste dados entre chamadas. Cada requisição deve ser autocontida. |

---

*Fim do Documento — v1.0 — 25/03/2025 (revisto em 30/03/2026)*