# Catálogo de Serviços sobre Intake Forms — Specification de design

**Data:** 10/10/2026
**Status:** Rascunho para revisão. Somente specification; implementação sem agendamento.
**Acompanhamento:** [#8325](https://github.com/LanternOps/breeze/issues/8325)
**Origem:** [Discussão #7792](https://github.com/LanternOps/breeze/discussions/7792#discussioncomment-18844392)
**Dependências:** #7900 somente para o futuro mapeamento de tipos de chamado. A entrega inicial de catálogo, acesso e portal é independente.
**Base do código:** `4d46c8961af36a0c0a485936c3df64e89a184f5b`
**Idioma:** Versão em português para revisão; identificadores do código preservados.

## 1. Problema e objetivo

Os Intake Forms já atendem solicitações estruturadas, mas não oferecem uma hierarquia de serviços gerenciada pelo parceiro nem acesso a itens individuais definido pelo contrato. O catálogo comercial atende preços e faturamento; Service Deliverables atende obrigações recorrentes.

**Objetivo:** disponibilizar um catálogo leve de serviços sob demanda, gerenciado pelo parceiro. O cliente com acesso navega pelo serviço, preenche um formulário existente e cria um chamado nativo com o SLA resolvido e registrado na criação.

Fluxo da solicitação: acesso pelo contrato → item de serviço → formulário → chamado nativo → motor de SLA existente.

Fluxo recorrente: contrato → Service Deliverable → ocorrência → vencimento → execução → evidência.

### 1.1 Decisões de escopo

| ID | Decisão | Contrato inicial |
| --- | --- | --- |
| D1 | Camada leve de catálogo | Cada item resolve para Intake Form existente e criação nativa de chamado. |
| D2 | Reutilização do SLA | Gravar os campos atuais de resposta/resolução e manter o motor existente. |
| D3 | Serviços sob demanda | Obrigações recorrentes permanecem em Service Deliverables. |
| D4 | Configuração compartilhada | Um catálogo por parceiro; registros de acesso por organização. |
| D5 | Metadados mínimos | Pilar, linha de serviço, atividade, classe ITIL, entrega, meta de SLA, formulário, categoria e tipo de trabalho. |
| D6 | Entrega inicial independente | Chamados genéricos antes da #7900; mapeamento de tipos em integração posterior. |
| D7 | Escopo separado | Acompanhamento na #8325, sem ampliar #7900–#7902. |

Esses limites seguem a discussão vinculada. A descrição da issue conserva vertical, tipo de atividade e elegibilidade fora do horário da proposta ampliada; a lista reduzida define a entrega inicial.

### 1.2 Estado do desenho

Nomes de tabelas, rotas, elegibilidade por datas, precedência do SLA, proteção do histórico e preenchimento de Work Type são contratos propostos. R1–R5 identificam as decisões para revisão da spec. O status de rascunho vale para o desenho completo; este documento não autoriza implementação.

## 2. Fundamentos existentes

| Capacidade existente | Referência | Consequência |
| --- | --- | --- |
| Catálogo comercial com hardware, software, serviços, preços e faturamento | `apps/api/src/db/schema/catalog.ts` | Não substituir nem reaproveitar `catalog_items` como controle de solicitações. |
| Formulários com propriedade por parceiro/organização, categoria, prioridade, campos, versão e visibilidade | `apps/api/src/db/schema/ticketForms.ts` | Reutilizar definições e renderização. |
| Formulários do parceiro com lista de organizações permitidas | `apps/api/src/db/schema/ticketFormOrgLinks.ts`, `apps/api/src/services/ticketFormService.ts` | O acesso contratual acrescenta uma verificação; não ignora a visibilidade do formulário. |
| Criação nativa valida formulários, monta descrições e preserva respostas | `apps/api/src/services/ticketService.ts:createTicket` | Estender o caminho comum de criação. |
| Portal lista formulários e usa a criação nativa | `apps/api/src/routes/portal/tickets.ts`, `apps/portal/src/components/portal/NewTicketForm.tsx` | Preservar organização da sessão, CSRF, propriedade do chamado e respostas atuais. |
| Metas de SLA gravadas no chamado e avaliadas pelo worker existente | `apps/api/src/services/ticketSla.ts`, `apps/api/src/services/ticketService.ts`, `apps/api/src/jobs/ticketSlaWorker.ts` | Sem novo relógio, regra de pausa ou worker de violação. |
| Categoria/prioridade podem recalcular o SLA antes da primeira resposta | `apps/api/src/services/ticketService.ts`, `apps/api/src/services/ticketService.slaRestamp.test.ts` | Proteger compromissos específicos do serviço. |
| Contratos possuem organização, parceiro, status e datas | `apps/api/src/db/schema/contracts.ts` | Reutilizar contratos sem alterar faturamento. |
| Work Types classificam o trabalho; categorias oferecem um padrão | `apps/api/src/db/schema/workTypes.ts`, `apps/api/src/db/schema/tickets.ts` | Tipo de trabalho não é tipo de chamado, modalidade de entrega, preço ou trabalho agendado. |

**Contratos do repositório:** `CLAUDE.md`, `docs/agents/tenancy-rls.md` e `docs/agents/settings.md` exigem configuração primeiro no parceiro, RLS obrigatório, um local de configuração por conceito e herança explícita.

A spec antiga dos formulários e o serviço atual contêm leituras em contexto de sistema. Isso descreve o comportamento existente, sem autorizar contornar RLS no novo catálogo. Novas leituras seguem as orientações atuais de isolamento.

## 3. Escopo

### 3.1 Entrega inicial

- Catálogo compartilhado por parceiro.
- Hierarquia: pilar → linha de serviço → atividade.
- Metadados iniciais reduzidos.
- Acesso aos itens por contrato e organização.
- Administração pela equipe e navegação no portal.
- Item → formulário existente → chamado nativo, com registro do SLA e rastreabilidade.
- Chamados genéricos, sem depender da #7900.

### 3.2 Fora do escopo

Vertical, tipo de atividade, elegibilidade fora do horário, sincronização com calendários, agendamento recorrente, motor de workflow, execução automática de serviços, mudanças em preços/faturamento, CAB, implementação de registros de mudança, novos relógios de SLA, pacotes de serviços, SLAs diferentes por contrato e conversão automática de formulários ou itens comerciais.

Na primeira entrega, `change` é apenas classificação ITIL descritiva. Não significa aprovação CAB nem autoriza executar uma mudança.

## 4. Configuração do item de serviço

| Campo | Comportamento inicial proposto |
| --- | --- |
| Nome/descrição | Nome da atividade e explicação curta para o cliente. |
| Pilar | Agrupamento opcional, sem motor separado de taxonomia. |
| Linha de serviço | Agrupamento opcional dentro do pilar. Itens sem grupo continuam acessíveis. |
| Atividade | O próprio item selecionável, sem duplicar o nome em outro campo. |
| Classe ITIL | `incident`, `service_request`, `problem`, `change`; metadado antes da #7900. |
| Entrega | `remote`, `onsite`, `hybrid`; informação, sem despacho automático. |
| Meta de SLA | Par opcional: `response` ou `resolution` + minutos inteiros positivos. Ambos ausentes significam herdar; zero não significa herdar. |
| Formulário | Formulário existente obrigatório; campos continuam sendo editados somente em Intake Forms. |
| Categoria | Substituição opcional da categoria do formulário; deve pertencer ao mesmo parceiro. |
| Tipo de trabalho | Padrão opcional para apontamentos posteriores; caso contrário, comportamento atual da categoria. Mesmo parceiro e ativo na configuração. |
| Ativo/visível/ordem | Controles operacionais; começa oculto até publicação explícita. |

Não acrescentar prioridade própria ao item. Preservar a prioridade atual do formulário/solicitante. Substituir a categoria no catálogo não modifica o formulário nem outros chamados.

Um item compartilhado do parceiro vincula somente formulário compartilhado daquele parceiro. Formulários específicos de organização permanecem no caminho atual; substituição de formulário por organização exige outra spec. As listas de organizações permitidas continuam valendo.

## 5. Modelo de dados e isolamento

Os nomes são distintos do catálogo comercial `catalog_items`.

### 5.1 Configuração

- `service_catalogs`: id, partner_id/org_id opcionais com regra XOR, name, is_active e datas.
- `service_catalog_items`: id, catalog_id, partner_id/org_id com XOR, name, description, pillar, service_line, itil_class, delivery, sla_target_kind, sla_target_minutes, form_id, category_id, work_type_id, is_active, show_in_portal, sort_order, version e datas.

XOR significa que exatamente um proprietário está preenchido: parceiro ou organização.

Na primeira entrega, a criação ocorre somente no nível do parceiro, com um catálogo único por parceiro. A API não cria cópias por cliente. O formato de propriedade segue #8325 e Partner-Wide First; criação por organização no futuro depende de uma política de resolução definida.

Catálogo e item devem ter o mesmo proprietário, garantido por restrições de banco. Formulário, categoria e tipo de trabalho precisam pertencer ao mesmo parceiro. Usar chaves/referências compostas quando aplicável.

**Decisão R1:** confirmar XOR com criação inicial somente por parceiro. Se o mantenedor preferir tabelas estritamente de parceiro, registrar a exceção antes de implementar.

### 5.2 Acesso contratual

`service_catalog_entitlements`: id, org_id, partner_id, contract_id, item_id, created_at e updated_at. Unicidade por (contract_id, item_id). Contrato e organização devem corresponder; item, contrato e organização precisam compartilhar o parceiro.

São registros de acesso por organização, sem copiar a configuração do item. A proposta inicial exige contrato, sem liberação implícita para todos e sem concessão direta desvinculada de contrato.

Vários contratos ativos podem liberar o mesmo item. A disponibilidade é a união dos acessos, sem duplicar o item. Nenhum contrato vence arbitrariamente, pois a concessão não altera a configuração do serviço.

O registro histórico guarda os IDs dos contratos que justificaram o acesso. Isso não escolhe contrato de faturamento, não aloca horas nem consome franquia. Uma futura atribuição financeira deve usar seu próprio resolvedor de faturamento, sem escolher a primeira concessão.

Sem concessão, nenhum item disponível. Uma lista vazia de acessos nunca significa acesso a tudo.

### 5.3 Segurança e ciclo de vida

- Habilitar e forçar RLS junto da criação das tabelas.
- Configuração usa as políticas padrão de propriedade e a permissão adicional somente de leitura necessária às organizações.
- Poder ler configuração do parceiro não concede acesso contratual. O portal retorna apenas itens autorizados.
- Sessões de clientes não alteram configurações nem concessões.
- Alterações compartilhadas exigem `canManagePartnerWidePolicies` e permissão do domínio; concessões exigem gerenciamento de contrato naquela organização.
- Proprietário é definido na criação e não muda em atualização parcial.
- Não elevar novas leituras para contexto de sistema. Derivar contexto da autenticação.
- Registrar cobertura de RLS, exclusão em cascata, união/exportação de organizações e movimentação de chamados quando aplicável. Referências compostas com organização devem respeitar o adiamento de restrições exigido pela união.
- Arquivar itens sem invalidar chamados. Edições e expiração do contrato afetam novas solicitações, preservando o histórico.
- Mover um chamado de organização não pode expor IDs de contratos da organização anterior ao novo cliente. O acesso histórico não vale como autorização na organização de destino.
- Exclusão física de referência pode limpar o vínculo atual somente se preservar a cópia histórica. Definir comportamento das referências antes das migrações.

Esta mudança não contém migração. A implementação deve ler o README de migrações e escolher nomes posteriores à última migração publicada.

## 6. Camada de serviços: resolução do acesso

Usar um único resolvedor no servidor para lista/detalhe no portal e criação de chamado pelo catálogo.

Um item só fica disponível quando:

1. A pessoa pode criar chamados na organização e as regras atuais do portal/Service Management permitem.
2. Catálogo e item estão ativos, pertencem ao parceiro daquela organização e são visíveis no portal quando aplicável.
3. Existe concessão daquela organização com contrato elegível.
4. O formulário está ativo e disponível para a organização, respeitando lista de organizações e visibilidade no portal.

**Elegibilidade proposta:** contrato `active`, início até a data local atual da organização e término ausente ou a partir dessa data. Datas inclusivas. Usar o resolvedor de fuso da organização e sua alternativa configurada; nunca o fuso da máquina do servidor. Identificar essa função e testar a alternativa antes de implementar.

Contratos draft, paused, cancelled e expired não liberam acesso. Reutilizar regra canônica existente se ela corresponder; não inferir acesso de fatura ou next_billing_at.

Revalidar no envio. Versões vistas do item/formulário servem para detectar mudanças concorrentes, sem confiar na configuração enviada pelo cliente. Mudanças retornam conflito identificado, permitindo revisar formulário/SLA e preservar respostas ainda compatíveis.

A criação e alterações de contrato/concessão/configuração precisam de uma ordem transacional definida. Revogação concluída antes da verificação autoritativa deve valer; criação bem-sucedida registra o estado efetivamente usado. Definir bloqueios e revalidação para impedir um chamado parcialmente validado.

IDs inacessíveis retornam indisponibilidade sem revelar dados. O cliente não escolhe outra organização, contratos justificadores, formulário, categoria, tipo de trabalho, SLA ou mapeamento ITIL.

**Decisão R2:** confirmar datas inclusivas, união dos contratos e exigência de contrato. Essas regras de borda não estão definidas na discussão. A spec de Service Deliverables (`docs/superpowers/specs/billing/2026-09-10-service-deliverables-portal-design.md`, D1) distingue status de faturamento de vigência do serviço. Confirmar se `active` e as datas do contrato representam o direito ao serviço antes de adotar essa regra; caso contrário, definir a vigência do acesso separadamente.

## 7. Camada de serviços: criação de chamados e SLA

### 7.1 Caminho comum

Acrescentar `serviceCatalogItemId` opcional à submissão existente, mantendo endpoint e campos atuais para chamados fora do catálogo.

O serviço comum:

1. Resolve e autoriza a organização.
2. Resolve acesso e versões atuais do item/formulário.
3. Usa o formulário vinculado e valida respostas com o validador existente.
4. Resolve categoria: substituição do item → categoria do formulário, validando parceiro.
5. Preserva prioridade, título, descrição, etiquetas e identificação do solicitante.
6. Resolve SLA uma vez, define work_kind como `support` e preserva metadados históricos.
7. Cria chamado, outbox e auditoria na transação atual.

O servidor é autoritativo. Rejeitar formId divergente e campos controlados pelo catálogo que conflitem. A equipe pode continuar criando chamados genéricos com suas permissões; isso não transforma o chamado em solicitação autorizada do catálogo.

`support` mantém serviços sob demanda no motor atual de SLA. É diferente do futuro tipo ITIL de chamado e do Work Type usado em apontamentos.

### 7.2 Precedência e duração do SLA

**Comportamento atual:** para chamados fora do catálogo, criação resolve categoria → substituição da organização por prioridade → configuração do parceiro por prioridade → padrão interno. Preservar isso.

**Proposta para chamados do catálogo, por meta:**

- Meta selecionada no item: substituição da organização → meta do item → categoria → parceiro → padrão interno.
- Outra meta: cadeia atual categoria → organização → parceiro → padrão interno.
- Item sem meta: comportamento existente para ambas.
- Edições humanas posteriores seguem as permissões atuais.

O valor do serviço funciona como padrão do parceiro, com substituição explícita da organização prevalecendo nessa meta. Explicar a exceção à cadeia normal na interface. Campo vazio mostra valor herdado e origem.

Reutilizar `resolveSlaTargets` e o resolvedor comum, ampliando entradas sem mudar o worker. Gravar `response_sla_minutes` e `resolution_sla_minutes` na criação.

Proteger a meta selecionada contra recálculo automático por categoria/prioridade, inclusive quando veio da substituição da organização. A outra meta mantém o comportamento atual.

Registrar origem e proteção por meta em extensão revisada do mecanismo de procedência. Não deduzir proteção somente pela cópia histórica nem marcar padrão automático como edição humana. Edição humana autorizada substitui valor/origem e mantém proteção atual das edições humanas.

Arquivo/remoção do item não limpa a proteção. Trocar serviço de chamado existente fica fora da entrega. Sem meta configurada no item, nenhuma meta ganha proteção de catálogo.

Editar catálogo, contrato ou formulário não recalcula metas antigas. Permanecem as regras atuais de horário, tempo decorrido, pausa e violação.

**Decisão R3:** confirmar organização acima do item e proteção contra recálculo. A discussão exige registrar SLA na criação, sem definir precedência ou edições posteriores.

**Exemplo:** Ajustar VLAN/Porta tem resolução em 240 minutos. Sem substituição por organização, resolução é 240 e resposta herda a cadeia existente. Com substituição explícita de resolução para 180, usa 180. Alterar posteriormente o item para 300 não modifica esses chamados.

### 7.3 Rastreabilidade e tipo de trabalho

Preservar `custom_fields.intakeForm`. Acrescentar `custom_fields.serviceCatalog`, escrito pelo servidor, com IDs de item/catálogo, versão/nome, pilar/linha de serviço, classe ITIL, entrega, formulário/versão, categoria, tipo de trabalho/nome, contratos justificadores e valores/origens do SLA.

Não expor preços ou termos privados de contratos ao portal.

Essa cópia é evidência imutável da criação. Edição autorizada de SLA modifica o chamado atual e gera auditoria; não reescreve os valores originais. Mesclar as duas estruturas, preservando a descrição e consumidores existentes.

**Padrão proposto para apontamento:** escolha explícita autorizada, inclusive null → Work Type histórico do catálogo → padrão atual da categoria.

Revalidar uso do Work Type. Se arquivado, usar alternativa válida existente e mostrar o motivo. Não modificar categoria compartilhada, criar tarifa, faturar horas ou tratar modalidade de entrega como tipo de trabalho.

**Decisão R4:** confirmar se Work Type deve preencher apontamentos nesta entrega ou permanecer apenas como metadado até uma mudança separada. A criação atual não possui campo próprio de Work Type de mão de obra. Preservar diferença entre workTypeId omitido e null explícito; revisar `apps/api/src/services/timeEntryService.ts` antes de alterar regras de padrões inativos.

## 8. Rotas e interface

Permissões finais e registro de rotas pertencem ao plano de implementação. Reutilizar permissões de configuração de chamados/contratos.

| Tela | Comportamento proposto |
| --- | --- |
| Configurações → Ticketing → Catálogo de Serviços | Um local de configuração do parceiro; edição/publicação dos itens. Campos continuam em Intake Forms. |
| Detalhe do contrato → Serviços disponíveis | Escolher itens para a organização; sem copiar configurações ou linhas comerciais. |
| Portal → Novo chamado → Serviços | Somente itens liberados, agrupados por pilar/linha, com busca por atividade; seleção abre formulário existente. |
| Chamado genérico/formulário atual | Preservar comportamento existente. |
| Detalhe do chamado | Identidade/entrega do serviço e SLA em leitura; omitir evidências privadas de acesso no portal. |

**Rotas propostas:** `/service-catalog`, `/service-catalog/items` e `/contracts/:id/service-entitlements` para a equipe. Lista/detalhe do portal: `/portal/tickets/services` e `/portal/tickets/services/:id`, registradas antes de IDs dinâmicos de chamados. Envio continua em `POST /portal/tickets`.

Reutilizar formatos de requisição/resposta, paginação, erros, CSRF, sessão e limites de requisição. Lista e detalhe usam a mesma autorização. Respostas enxutas contêm apenas o necessário; cache privado por cliente não autoriza envio sem revalidação.

Distinguir ausência de serviços, carregamento, serviço indisponível e erro de infraestrutura. Indisponibilidade não cria chamado genérico silenciosamente. Preservar entradas após falha de validação.

Seguir `runAction`, convenções de salvar, estado transitório no hash, navegação, acessibilidade e `data-testid`.

### 8.1 Formulários existentes não passam a exigir contrato silenciosamente

O acesso contratual controla o caminho do serviço pelo catálogo e seu compromisso configurado. Formulários independentes e chamados genéricos mantêm suas regras; enviar apenas formId não concede SLA ou histórico do catálogo.

Um cliente sem acesso ao item ainda pode abrir chamado genérico descrevendo o mesmo trabalho. A proposta não proíbe contratualmente todas as solicitações em texto livre.

Se o formulário vinculado permanecer visível separadamente, poderá aparecer no seletor atual. Evitar duplicidade exigiria configuração de exposição ou publicação controlada pelo catálogo, revisada explicitamente; a simples existência do vínculo não deve esconder o formulário.

**Decisão R5:** confirmar se essa visibilidade independente é aceitável na primeira entrega. Exigir contrato em todos os formulários mudaria seu comportamento atual.

## 9. Integração ITIL futura

- #7900 fornecerá mapeamento para tipos de chamado. Alinhar nomes ao contrato implementado naquele momento.
- Antes disso, criar chamados genéricos e guardar classe ITIL descritiva.
- #7901 e #7902 fornecerão campos de mudança e CAB em seus próprios desenhos. Esta spec não os implementa nem aprova mudanças.
- Essas dependências não bloqueiam catálogo, acesso e portal. Integrar depois em plano separado.

## 10. Testes e aceitação

| Caso | Resultado exigido |
| --- | --- |
| Catálogo compartilhado | Duas organizações autorizadas reutilizam o mesmo item, sem cópias por cliente. |
| Referências entre parceiros | Banco e aplicação rejeitam formulário, categoria, Work Type, contrato ou organização de outro parceiro. |
| RLS com breeze_app real | Leituras indevidas e escritas forjadas negadas; propriedade e XOR garantidos. |
| Sem concessão/organização errada | Item ausente e envio direto negado sem divulgar configuração alheia. |
| Ciclo do contrato | Status/datas não elegíveis negam; testar limites no fuso da organização. |
| Vários contratos | Um item; remover concessão mantém acesso somente se outra continuar válida. |
| Restrições do formulário | Formulário inativo, interno ou que exclui a organização nega uso mesmo com concessão. |
| Manipulação da submissão | Campos forjados não alteram mapeamento autoritativo. |
| Resolução de SLA | Testar meta selecionada, substituição da organização, outra meta herdada, null e minutos inválidos/zero. |
| Recálculo de SLA | Meta protegida permanece; outra meta e chamados genéricos mantêm comportamento atual. |
| Histórico | Renomear, arquivar ou expirar concessão não reescreve evidência/metas. |
| Concorrência | Revogação/edição versus criação tem resultado transacional testado; reversão não deixa chamado/outbox. |
| Work Type | Escolha explícita prevalece; testar padrão acordado e alternativa para inativo. |
| Regressões do portal | Preservar sessão, CSRF, Service Management, formulários genéricos e solicitante. |
| Ciclo de vida | Cobrir exclusão, união, exportação e movimentação de organização/chamado. |

Testes unitários/API/shared cobrem resolução e validação. PostgreSQL real comprova RLS e referências; mocks não bastam. Componentes do portal e Playwright cobrem serviço → formulário → chamado, negativas e fluxo genérico. Reutilizar testes existentes de recálculo de SLA.

Nesta mudança documental, verificar Markdown, referências, rastreabilidade do escopo e alterações. Testes de execução/build não se aplicam, pois não há mudança de código executável.

## 11. Fases de entrega

1. Revisão do mantenedor, incluindo R1–R5.
2. Plano de implementação com decisões aceitas, etapas isoladas e verificações.
3. Configuração e concessões, com cobertura de RLS/ciclo de vida.
4. Mapeamento na criação comum, proteção de SLA e histórico.
5. Navegação no portal e validação ponta a ponta.
6. Integração posterior com #7900 e, se aprovada, mudança/CAB em separado.

É uma sequência proposta, sem agendamento nem novas issues registradas. A PR de spec deve usar `Refs #8325` e informar que entrega somente desenho, sem encerrar a feature.

## 12. Referências

- [Issue do Catálogo de Serviços #8325](https://github.com/LanternOps/breeze/issues/8325).
- [Discussão de origem e limites de escopo](https://github.com/LanternOps/breeze/discussions/7792#discussioncomment-18844392).
- `docs/superpowers/specs/ticketing/2026-07-10-ticket-intake-forms-design.md`: contrato existente de formulários.
- `docs/superpowers/specs/ticketing/2026-06-12-ticketing-configuration-design.md`: estrutura de configuração e precedência do SLA.
- `docs/superpowers/specs/billing/2026-09-10-service-deliverables-portal-design.md`: limites dos serviços recorrentes e distinção entre faturamento e vigência do serviço.
- `docs/superpowers/specs/portal/2026-10-01-portal-advanced-visibility-design.md`: metadados de rascunho, seções numeradas e contratos de visibilidade do portal.
- `docs/agents/tenancy-rls.md`, `docs/agents/settings.md`: contratos atuais de isolamento e configuração.
