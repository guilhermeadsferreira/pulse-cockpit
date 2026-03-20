# SRE / Platform Engineer

## Visão Geral

Responsável pela confiabilidade, disponibilidade e segurança da plataforma de tecnologia. Opera com forte interface com os times de desenvolvimento, mas sem pertencer à gestão direta. Seu produto é a infraestrutura e a plataforma — não as features de negócio.

---

## Responsabilidades

- Definir, implementar e monitorar SLOs e SLAs dos sistemas críticos
- Manter e evoluir a infraestrutura de cloud (servidores, redes, storage, segurança)
- Gerenciar pipelines de CI/CD e garantir sua confiabilidade e velocidade
- Implementar e manter observabilidade: logs estruturados, métricas, alertas e distributed tracing
- Conduzir resposta a incidentes: detecção, mitigação, postmortem e ações corretivas
- Garantir segurança de infraestrutura: acesso, redes, segredos, conformidade
- Criar e manter documentação operacional e runbooks
- Reduzir trabalho manual via automação e IaC

---

## Não Responsabilidades

- Desenvolver funcionalidades de produto ou negócio
- Definir arquitetura de aplicação de forma unilateral — colabora, mas a decisão é do Tech Lead
- Gerir ou avaliar pessoas dos times de desenvolvimento
- Ser o único responsável por segurança de código-fonte — essa responsabilidade é dos desenvolvedores
- Substituir o monitoramento de qualidade do QA Engineer

---

## Interfaces

| Com quem | Natureza da interface |
|---|---|
| Tech Lead / Backend Sênior | Decisões de deploy, arquitetura de infra e observabilidade de sistemas |
| QA Engineer | Ambientes de teste, testes de performance e integração com pipelines de CI |
| Coordenador / Gerente de TI | Escalada de incidentes críticos, roadmap de infra e riscos operacionais |
| Produto | Impacto de incidentes em usuários e SLAs de disponibilidade |

---

## Competências Esperadas

- Cloud (AWS, GCP ou Azure): compute, networking, storage, IAM
- Containers e orquestração: Docker, Kubernetes ou equivalentes
- Observabilidade: Prometheus, Grafana, OpenTelemetry, ELK ou equivalentes
- IaC: Terraform, Pulumi ou equivalentes
- CI/CD: GitHub Actions, GitLab CI, ArgoCD ou equivalentes
- Resposta a incidentes e gestão de on-call
- Segurança de infraestrutura: secrets management, least privilege, network policies
