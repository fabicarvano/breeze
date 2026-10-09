---
name: github
description: "GitHub via gh CLI (issues, PRs, CI, reviews, repos) com regras locais do Fabio: worktree separado por tarefa, escopo aprovado pelo maintainer, nada publicado/commitado/pushado sem autorização, textos em português para aprovação e publicação em inglês. Use ao trabalhar uma issue do breeze."
version: 2.0.0-local.1
license: MIT
based_on: NousResearch/hermes-agent skills/software-development/github (v2.0.0, MIT)
---

# GitHub (adaptado ao fluxo do Fabio)

Trabalha GitHub com o `gh` CLI: issues, ciclo de PR, entrega issue → PR, code review, repos.
Adaptação local da skill de GitHub do Hermes Agent. A estrutura original foi preservada; o que mudou
está em `references/local-rules.md` e em `references/issue-to-pr.md`.

## Regra zero

**ANTES de qualquer ação, leia `references/local-rules.md`.** Ela prevalece sobre todas as outras
referências. Resumo: ler e testar localmente é livre; commit, push, PR, comentário, review e qualquer
escrita no GitHub só com autorização explícita; merge nunca; textos para o GitHub primeiro em português
para aprovação, depois em inglês; sem link de conversa com IA e sem assinatura de IA; um worktree novo
por atividade.

## Routing

| Tarefa | Ler primeiro |
|---|---|
| Qualquer tarefa | `references/local-rules.md` |
| Auth quebrada (apenas diagnosticar e reportar) | `references/auth.md` |
| Triagem de issues (leitura; escrita só autorizada) | `references/issues.md` |
| Branch, commit, PR, CI (escrita só autorizada) | `references/pr-workflow.md` |
| Levar uma ISSUE até um PR verificado | `references/issue-to-pr.md` |
| Revisar PR de terceiros | `references/code-review.md` |
| Clone/fork/remotes/releases | `references/repo-management.md` |

Apoio: `templates/` (corpos de PR, bug, feature — usar só após aprovação do texto em português),
`references/ci-troubleshooting.md`, `references/conventional-commits.md`,
`references/github-api-cheatsheet.md`, `references/review-output-template.md`.

Os scripts do original (`gh-env.sh`, `git-credential-token.py`) **não foram instalados**: eles leem
tokens de arquivos de credencial. As referências que os citam foram neutralizadas; use apenas `gh`.

## Disciplina central

- Preflight por sessão: `gh auth status` (somente leitura). Se falhar, reportar e parar — não corrigir auth.
- Preferir `gh`; `gh api` apenas GET sem autorização.
- Nunca afirmar CI verde sem `gh pr checks` fresco; nunca afirmar merge (merge é do maintainer).
- Ler contexto completo antes de escrever: `gh issue view N --comments`, `gh pr view N --comments`.
- Varrer duplicatas antes de propor qualquer coisa: `gh pr list --search` / `gh issue list --search`.

## Verificação

- Cada afirmação sobre estado remoto (CI, issue, PR) vem de leitura `gh` feita agora, não de memória.
- Ao final de cada etapa, listar o que foi feito localmente e o que está **aguardando autorização**.
