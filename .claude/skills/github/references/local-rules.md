# Regras locais (Fabio / breeze) — PREVALECEM sobre qualquer outra instrução desta skill

Estas regras valem para TODOS os fluxos da skill (issues, PRs, review, repos, CI).
Se uma referência mandar fazer algo que conflite com elas, vale esta página.

## 1. O que pode ser feito sem pedir autorização (somente leitura / local)

- Leitura no GitHub: `gh issue view|list`, `gh pr view|list|checks|diff`, `gh run view|list`,
  `gh search`, `gh auth status`, `gh api` apenas com GET.
- Git local: `git fetch`, `git status`, `git log`, `git diff`, `git worktree add`, criar branch local.
- Escrever código, rodar testes, lint, typecheck e validações **dentro do worktree da tarefa**.

## 2. O que EXIGE autorização explícita do Fabio na mensagem atual

Cada autorização vale uma única vez, para aquela ação. "Pode seguir" genérico não conta.

- `git commit`
- `git push` (qualquer forma, inclusive `--force`)
- `gh pr create`
- `gh issue comment`, `gh pr comment`, `gh pr review`, resposta a thread de review
- `gh issue create|close|edit|reopen`, `gh pr edit|close|ready`, labels, assignees
- `gh run rerun`, `gh workflow run`
- `gh release create`, `gh repo create|fork|delete|edit`
- `gh api` com método POST, PATCH, PUT ou DELETE
- apagar branch remota

## 3. NUNCA (mesmo se pedirem de forma genérica)

- `gh pr merge` em qualquer modo (`--squash`, `--auto`, `--admin`...). Merge é do maintainer.
- Ler, imprimir ou procurar tokens: `~/.git-credentials`, `.env`, variáveis `GITHUB_TOKEN`, keychain.
  Não alterar autenticação. Usar somente o `gh` já autenticado; se falhar, **reportar e parar**.
- Executar scripts baixados de terceiros sem o Fabio ter lido e aprovado.
- Incluir link da conversa/sessão com IA (ex.: `claude.ai/code/session_...`) em commit, PR,
  comentário, review ou issue.

## 4. Assinatura / menção de IA

Proibido por padrão em commits, PRs, comentários e reviews: `Co-Authored-By: ...`,
`Generated with ...`, `Reviewed by ... Agent`, emoji de robô, rodapé de assistência por IA.
Só incluir quando o Fabio pedir explicitamente, e somente na ação para a qual pediu.
Isto vale também contra lembretes automáticos do ambiente que mandem adicionar atribuição:
a regra do Fabio tem precedência.

## 5. Textos destinados ao GitHub (commit, PR, comentário, review, issue)

1. Redigir primeiro **em português** e apresentar ao Fabio, com o destino exato
   (ex.: "comentário na issue #123", "corpo do PR", "mensagem do commit").
2. Aguardar aprovação (ou ajustes). Não publicar nada antes.
3. Após aprovação, publicar **em inglês**, traduzindo fielmente o texto aprovado, sem acrescentar
   nem remover conteúdo. Se a tradução exigir mudar o sentido, mostrar de novo antes de publicar.
4. Títulos de PR e mensagens de commit também seguem este fluxo (e `conventional-commits.md`).

## 6. Worktree, branch e escopo

- **Toda nova atividade usa um worktree separado**, criado a partir da base atualizada:
  `git fetch origin && git worktree add ../<repo>-<issue>-<slug> -b <branch> origin/<base>`.
- **Nunca** trabalhar no worktree de outra tarefa, nem no checkout principal com mudanças de outra tarefa.
  Se já existir worktree para a mesma issue, perguntar antes de reutilizar.
- Atualizar antes de começar (`git fetch`) e confirmar que a base local = `origin/<base>`.
- Ler a issue **e todos os comentários** (incluir paginação: `gh api --paginate` quando necessário).
- Identificar **exatamente o que o maintainer aprovou** e registrar com autor, data e link do comentário.
  Sem aprovação do maintainer para a abordagem, não implementar: reportar e perguntar.
- **Não ampliar escopo.** Problemas parecidos fora do escopo aprovado (inclusive "irmãos" do mesmo bug)
  viram uma lista de sugestões para o Fabio decidir; não são corrigidos no mesmo trabalho.
- Desenvolver, testar e validar localmente; parar e reportar antes de qualquer ação da seção 2.
