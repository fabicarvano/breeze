# GitHub Issue → Pull Request (versão local com portões de aprovação)

> Antes de começar, leia `references/local-rules.md`. Ela prevalece sobre este fluxo.
> Adaptado do `issue-to-pr` original: mantém a disciplina de validação (premissa, duplicatas,
> teste de sabotagem, CI honesto), mas **nenhuma etapa publica algo sozinha**.

## Quando usar

- "Resolve a issue #123", "implementa essa feature da issue", "leva esse bug até CI verde".
- Não usar para: revisar PR existente (use `code-review.md`) ou responder dúvida sem mudança de código.

## Procedimento

### 0. Preflight e worktree (local)

1. `gh auth status` (só leitura). Falhou → reportar e parar.
2. Confirmar a raiz do repositório e o remoto (`git remote -v`); identificar `owner/repo` e a branch base.
3. `git fetch origin`. Criar worktree **novo** para esta issue, a partir da base atualizada:
   `git worktree add ../<repo>-<N>-<slug> -b <branch> origin/<base>`.
4. Trabalhar somente nesse worktree. Nunca em worktree de outra tarefa.

Pronto quando: worktree novo, limpo, na base atualizada.

### 1. Ler a issue inteira e fixar o escopo aprovado

`gh issue view <N> --comments` (e `gh api --paginate` se houver muitos comentários). Ler também
`AGENTS.md`, `CONTRIBUTING*` e instruções do repositório. Produzir um quadro **"Escopo aprovado"**:

| item | aprovado por (autor/data/link) | dentro do escopo? |
|---|---|---|

Incluir: o que foi aprovado, o que foi explicitamente excluído, perguntas ainda sem resposta.
Sem aprovação do maintainer para a abordagem → **parar e perguntar ao Fabio**.

Pronto quando: o escopo cabe em poucas linhas e cada item tem origem rastreável.

### 2. Varredura de trabalho existente e duplicado

`gh pr list --search "#<N>" --state all` + pelo menos duas variações de palavras-chave do sintoma
(`gh pr list --search "<subsistema> <sintoma>" --state open`). Checar também
`git log --oneline -20 -- <arquivos relevantes>`. Existindo PR aberto cobrindo a issue → reportar ao Fabio antes de continuar.

### 3. Validar a premissa no código atual — e a intenção de design

Reproduzir o bug (ou demonstrar a falta) na base atual, com teste ou fixture que falha. Depois checar se
o comportamento é deliberado: `git log -p -S "<símbolo>"` e ler a intenção do commit original.
Se a premissa da issue estiver errada ou o comportamento for intencional → reportar, não implementar às cegas.

### 4. Critérios de aceite e risco (restritos ao escopo aprovado)

Listar critérios, interfaces, migrações, compatibilidade, segurança, rollback. Mapear cada critério para
um teste ou verificação explícita. Nada fora do escopo aprovado entra aqui.

### 5. Implementar a menor mudança completa — sem ampliar escopo

Teste de regressão primeiro, depois a correção. Cada linha alterada deve ser rastreável a um item do
escopo aprovado; sem limpeza "de carona". **Diferença em relação ao original:** o original manda corrigir
a classe inteira do bug no mesmo PR. Aqui, locais irmãos com o mesmo defeito **fora do escopo aprovado**
são apenas listados como sugestão para o Fabio/maintainer decidirem.

### 6. Provar que o teste morde (sabotagem local)

Restaurar temporariamente o comportamento antigo da função sob teste, confirmar que o novo teste FALHA,
restaurar a correção e confirmar que PASSA. Garantir que a sabotagem foi revertida (`git diff`).

### 7. Qualidade local e PARADA

Rodar formatter, lint, typecheck e o ponto de entrada canônico de testes das áreas afetadas.
Em seguida **parar** e apresentar ao Fabio, em português:

- resumo do que mudou (arquivos, diff stat) e como cada item do escopo foi atendido;
- testes e validações executados, com resultado real;
- itens fora do escopo encontrados (apenas listados);
- riscos e dúvidas.

Nada de commit, push ou PR até autorização explícita.

### 8. Commit — somente se autorizado

Mensagem de commit redigida em português → aprovação → publicar em inglês (Conventional Commits, ver
`conventional-commits.md`). Sem `Co-Authored-By`, sem link de sessão, sem menção de IA.

### 9. Push — somente se autorizado (autorização separada do commit)

### 10. PR — somente se o Fabio pedir explicitamente

Título e corpo redigidos em português (usar `templates/pr-body-*.md` como base) → aprovação → publicar em
inglês. O corpo vincula a issue, descreve problema, abordagem, testes, risco e exclusões — sem assinatura
de IA e sem link de conversa. Depois de criado, ler de volta (`gh pr view`) e conferir head SHA, base,
título e arquivos.

### 11. CI e fechamento do ciclo (leitura livre; escrita autorizada)

- Ler `gh pr checks` e logs (`gh run view --log-failed`). Distinguir falha introduzida pelo diff de falha
  de baseline/infra; reproduzir na base quando houver dúvida.
- Correção de CI = voltar ao passo 5/7 e pedir nova autorização para commit e push.
- `gh run rerun` conta como escrita: só com autorização.
- Comentário na issue com o link do PR: redigir em português → aprovação → publicar em inglês.
- **Nunca fazer merge.** Informar ao Fabio o estado real: CI, bloqueios, pendências do review.

## Armadilhas

- Programar antes de ler todos os comentários ou antes de varrer PRs duplicados.
- "Corrigir" algo que o commit original mostra ser intencional.
- Ampliar escopo (inclusive corrigir "irmãos" do bug sem aprovação).
- Teste de regressão que passa sem a correção.
- Trabalhar em worktree de outra tarefa, ou numa base desatualizada.
- Publicar qualquer coisa (commit, push, PR, comentário) sem autorização explícita.
- Incluir assinatura de IA ou link da conversa em textos do GitHub.
- Dizer que a issue foi entregue porque o PR existe.

## Checklist de verificação

- [ ] Worktree novo, a partir da base atualizada, usado só para esta issue.
- [ ] Issue e todos os comentários lidos; quadro "Escopo aprovado" preenchido com origem.
- [ ] Varredura de PRs duplicados (número da issue + 2 variações).
- [ ] Premissa reproduzida e intenção de design checada.
- [ ] Teste de regressão provado por sabotagem, e sabotagem revertida.
- [ ] Toda linha alterada rastreável ao escopo aprovado.
- [ ] Relatório em português entregue; nenhuma escrita remota feita sem autorização.
- [ ] Textos do GitHub aprovados em português e publicados em inglês, sem IA/link de conversa.
- [ ] Estado de CI reportado só com leitura `gh` fresca; sem merge.
