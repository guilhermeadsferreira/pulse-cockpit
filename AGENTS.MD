# Projeto CNAB 240 — Instruções Base
**Integração Mais Todos × Vertrau** | Versão 1.0 | Março 2026

---

## 1. Contexto Geral

Este projeto tem como objetivo viabilizar a troca de arquivos e dados financeiros entre **Mais Todos** e **Vertrau** por meio do padrão **CNAB 240**, garantindo rastreabilidade, padronização de contrato JSON e operação via SFTP.

---

## 2. Fluxos de Dados

### Fluxo 1 — Remessa (CNAB → JSON)
- A Mais Todos gera o arquivo de remessa no padrão CNAB 240 (`.rem`)
- O arquivo é disponibilizado via SFTP para a Vertrau
- A Vertrau realiza o parse posicional conforme o layout e banco suportado
- A Vertrau retorna um JSON estruturado conforme contrato definido pela Mais Todos

### Fluxo 2 — Retorno (JSON → CNAB)
- A Mais Todos envia um JSON com os dados de retorno à Vertrau
- A Vertrau processa o JSON e gera o arquivo CNAB 240 correspondente (`.ret`)
- O arquivo de retorno é disponibilizado no SFTP para consumo pela Mais Todos

---

## 3. Papéis e Responsabilidades

| Responsabilidade | Mais Todos | Vertrau |
|---|---|---|
| Definição do contrato JSON | ✅ Define e documenta | Implementa conforme spec |
| Parser CNAB → JSON | — | ✅ Desenvolve e mantém |
| Gerador JSON → CNAB | — | ✅ Desenvolve e mantém |
| Disponibilização via SFTP (`.rem` / `.ret`) | ✅ Disponibiliza | Consome |
| Infraestrutura SFTP | A definir | A definir |
| Dicionário posicional CNAB | — | ✅ Mantém internamente |
| Arquivos de homologação / teste | ✅ Fornece arquivos reais | Valida parser e gerador |

---

## 4. Padrão Técnico

| Parâmetro | Valor / Definição |
|---|---|
| Protocolo | CNAB 240 |
| Extensão — Remessa | `.rem` |
| Extensão — Retorno | `.ret` |
| Transporte de arquivos | SFTP (caminho a definir) |
| Formato de contrato de dados | JSON (schema definido pela Mais Todos) |
| Codificação do arquivo | ISO-8859-1 ou UTF-8 (a confirmar por banco) |
| Bancos suportados | A mapear por mapeamento posicional (Vertrau) |

---

## 5. Entregas Esperadas

### 5.1 Documentação
- Especificação completa do layout CNAB 240 de entrada
- Definição formal do schema JSON de retorno (Fluxo 1)
- Definição formal do schema JSON de entrada (Fluxo 2)
- Documentação técnica da API / contrato de integração

### 5.2 Artefatos Técnicos
- Parser CNAB 240 → JSON (responsabilidade Vertrau)
- Gerador JSON → CNAB 240 (responsabilidade Vertrau)
- Scripts ou serviços de transferência SFTP
- Suíte de testes com arquivos reais de homologação

### 5.3 Processo
- Plano de ação com cronograma e marcos definidos
- Ambiente de homologação com casos de teste validados
- Aprovação formal (sign-off) das especificações antes do desenvolvimento

---

## 6. Convenções e Boas Práticas

> **Nomenclatura de arquivos:**
> - Arquivo de remessa: extensão `.rem` — enviado pela Mais Todos ao banco via SFTP
> - Arquivo de retorno: extensão `.ret` — recebido do banco e disponibilizado no SFTP para processamento pela Vertrau

- O contrato JSON deve ser versionado e qualquer alteração exige notificação formal entre as partes
- Arquivos CNAB reais fornecidos para homologação devem ter dados sensíveis anonimizados
- Toda especificação deve ser aprovada por ambas as partes antes do início da implementação
- Logs de processamento devem ser mantidos para rastreabilidade das transações

---

## 7. Próximos Passos

| # | Ação | Responsável |
|---|---|---|
| 1 | Validar e assinar as instruções base deste documento | Mais Todos + Vertrau |
| 2 | Definir e documentar o schema JSON (Fluxo 1 e Fluxo 2) | Mais Todos |
| 3 | Mapear todos os bancos e layouts CNAB suportados | Vertrau |
| 4 | Definir infraestrutura e credenciais SFTP | A definir |
| 5 | Fornecer arquivos CNAB reais para homologação | Mais Todos |
| 6 | Desenvolver parser e gerador CNAB | Vertrau |
| 7 | Executar testes de homologação e validar resultados | Mais Todos + Vertrau |
| 8 | Aprovação final e entrada em produção | Mais Todos + Vertrau |