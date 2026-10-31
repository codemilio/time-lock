# Tarefas de Implementação — Cápsula do Tempo

> **Fonte de verdade técnica:** [`spec.md`](spec.md)
> **Comportamento de produto:** [`PRD.md`](PRD.md)
> **Status:** MVP implementado e QA concluído. Instalador NSIS gerado e validado em instalação
> temporária com dados de aplicativo vazios.
> **Estratégia:** backend-first, com fatias verticais a partir da integração Tauri.

## Como usar este arquivo

- Execute as fases na ordem apresentada; respeite as dependências.
- Marque uma tarefa como concluída somente quando código, testes e gates da fase passarem.
- Escreva os testes junto com a implementação, não apenas no final.
- Toda decisão que altere comportamento deve ser refletida no `spec.md` e no `PRD.md`.
- Nunca registre senha, Master Key, Content Key, plaintext ou key-check em logs.

## Estado atual

- Backend Rust completo: criptografia, autenticação, SQLite, cápsulas, revelação e runtime.
- Frontend completo: setup, login, listas, criação, leitura, arquivamento, exclusão e banner.
- Gates automatizados verdes: `cargo fmt`, `cargo clippy`, 90 testes Rust, `pnpm lint`,
  `pnpm typecheck`, 56 testes frontend e `pnpm build`.
- Configuração Tauri auditada: CSP de release, capabilities mínimas, NSIS `currentUser` e
  devtools desabilitado em release.
- QA manual concluído: IPC ponta a ponta via WebView2/CDP, notificações (poll de 60 s, boot e
  negação no SO), backup/restauração do SQLite e clock rollback.
- Instalador NSIS `currentUser` validado em diretório temporário com dados de aplicativo vazios;
  abertura e desinstalação sem privilégios administrativos.
- Recomendação não bloqueante: repetir a instalação em outro usuário/máquina Windows e assinar o
  binário para evitar o aviso do SmartScreen.

## Resumo das tarefas

| Ordem | Tarefa                                          | Depende de | Status    |
| ----- | ----------------------------------------------- | ---------- | --------- |
| 0     | Alinhar PRD ao SPEC                             | —          | Concluída |
| 1     | Fundação Rust: erros, estado e módulos          | 0          | Concluída |
| 2     | SQLite: abertura, pragmas, migração v1 e config | 1          | Concluída |
| 3     | Núcleo criptográfico                            | 1          | Concluída |
| 4     | Autenticação: setup, unlock, lock e backoff     | 2, 3       | Concluída |
| 5     | Cápsulas: criação e listagem                    | 3, 4       | Concluída |
| 6     | Revelação, leitura, arquivamento e exclusão     | 5          | Concluída |
| 7     | Integração Tauri e runtime                      | 4, 5, 6    | Concluída |
| 8     | Frontend base + telas de autenticação           | 7          | Concluída |
| 9     | UI de cápsulas seladas e criação                | 8          | Concluída |
| 10    | UI de reveladas, arquivadas e detalhe           | 9          | Concluída |
| 11    | Hardening, QA manual e release                  | 10         | Concluída |

---

## Fase 0 — Alinhar PRD ao SPEC

**Objetivo:** eliminar contradições entre produto e especificação técnica antes de codar.

**Depende de:** nada.

**Passos:**

- [x] Corrigir RF-02 no PRD: trocar “hash persistido” por key-check AES-256-GCM.
- [x] Atualizar a seção de modelo de dados do PRD para remover `master_password_hash`.
- [x] Atualizar os fluxos de setup, login e revelação para o modelo de Master Key + key-check.
- [x] Fixar o limite do corpo em 1.048.576 bytes UTF-8 (RF-05).
- [x] Atualizar o texto da notificação para o plural correto (RF-20).
- [x] Revisar referências ao `spec.md` e garantir que ele continue sendo a fonte técnica.

**Pronto quando:** não houver contradição entre PRD e SPEC sobre senha, key-check, limites e notificação.

---

## Fase 1 — Fundação Rust

**Objetivo:** criar a base de erros, estado e organização dos módulos.

**Depende de:** Fase 0.

**Arquivos principais:**

- `src-tauri/src/error.rs`
- `src-tauri/src/state.rs`
- `src-tauri/src/commands/mod.rs`
- Módulos vazios de `crypto/`, `db/` e `services/`

**Passos:**

- [x] Implementar `AppError` e `ErrorCode` com todos os códigos da Seção 7.2.
- [x] Serializar erros em camelCase e com mensagens seguras em PT-BR.
- [x] Implementar `AppState`, `Session` e `RateLimiter` conforme a Seção 4.3.
- [x] Garantir que `master_key` seja `None` enquanto bloqueado.
- [ ] Preparar a árvore de módulos prevista na Seção 4.6.
- [ ] Remover `health_check` quando os comandos reais forem registrados.

**Testes:**

- [x] Serialização do envelope de erro.
- [x] Estado inicial da sessão e do rate limiter.

**Pronto quando:** o backend compilar com a estrutura-alvo e os erros forem serializáveis.

---

## Fase 2 — Persistência SQLite

**Objetivo:** abrir o banco no local correto, aplicar pragmas e criar a migração v1.

**Depende de:** Fase 1.

**Arquivos principais:**

- `src-tauri/src/db/mod.rs`
- `src-tauri/src/db/migrations.rs`
- `src-tauri/src/db/config.rs`

**Passos:**

- [x] Abrir `app_data_dir()/time-lock.db`.
- [x] Aplicar os pragmas da Seção 6.1 em cada conexão.
- [x] Implementar a migração v1 transacional e idempotente.
- [x] Definir `user_version` de `0` para `1`.
- [x] Implementar leitura e escrita tipada de `app_config`.
- [x] Garantir persistência atômica das chaves de setup.
- [x] Criar harness de teste com banco temporário em arquivo.
- [x] Adicionar `tempfile` como dev-dependency, se necessário.

**Testes:**

- [x] `TEST-DB-01` — migração define `user_version = 1`.
- [x] `TEST-DB-02` — migração é idempotente.
- [x] `TEST-DB-03` — pragmas aplicados.

**Pronto quando:** abrir o app repetidamente não recriar nem corromper o schema.

---

## Fase 3 — Núcleo criptográfico

**Objetivo:** implementar a hierarquia de chaves e as primitivas criptográficas.

**Depende de:** Fase 1.

**Arquivos principais:**

- `src-tauri/src/crypto/kdf.rs`
- `src-tauri/src/crypto/cipher.rs`
- `src-tauri/src/crypto/keycheck.rs`

**Passos:**

- [x] Implementar Argon2id com parâmetros versionados (`m`, `t`, `p`).
- [x] Gerar salt de 16 bytes com CSPRNG.
- [x] Derivar Master Key de 32 bytes.
- [x] Implementar AES-256-GCM com nonce de 12 bytes e AAD.
- [x] Implementar criação e validação do key-check.
- [x] Aplicar `zeroize` em MK, CK, plaintext e buffers intermediários.
- [x] Manter as funções puras; `spawn_blocking` fica nos serviços.
- [x] Garantir que nenhuma função criptográfica registre segredos.

**Testes:**

- [x] `TEST-CRYPTO-01` a `TEST-CRYPTO-09`.

**Pronto quando:** round-trip, adulteração, AAD errado e key-check inválido se comportarem conforme a Seção 5.

---

## Fase 4 — Autenticação, sessão e backoff

**Objetivo:** implementar setup, login, bloqueio e política de atraso.

**Depende de:** Fases 2 e 3.

**Arquivos principais:**

- `src-tauri/src/services/rate_limit.rs`
- `src-tauri/src/services/auth.rs`
- `src-tauri/src/commands/auth.rs`

**Passos:**

- [x] Implementar a política de backoff da Seção 5.7.
- [x] Implementar `get_app_state`, `setup_master_password`, `unlock` e `lock`.
- [x] Persistir o setup em uma única transação.
- [x] Ler parâmetros do KDF do banco no login.
- [x] Soltar o lock do banco antes de rodar Argon2id em `spawn_blocking`.
- [x] Reabrir o lock e validar o key-check após a derivação.
- [x] Zerar o contador em login bem-sucedido.
- [x] Emitir `auth://locked` ao bloquear.
- [x] Garantir mensagens genéricas para senha errada e key-check corrompido.

**Testes:**

- [x] `TEST-AUTH-01` a `TEST-AUTH-07`.
- [x] Critérios `AUTH-AC-01` a `AUTH-AC-06`.

**Pronto quando:** setup e login funcionarem com SQLite real e a sessão nunca sobreviver ao `lock`.

---

## Fase 5 — Cápsulas: criação e listagem

**Objetivo:** permitir criar cápsulas cifradas e listar seus metadados.

**Depende de:** Fases 3 e 4.

**Arquivos principais:**

- `src-tauri/src/db/capsules.rs`
- `src-tauri/src/services/capsule.rs`
- `src-tauri/src/commands/capsules.rs`

**Passos:**

- [x] Implementar insert, listagem, busca por ID e mapeamento de linhas.
- [x] Validar título, corpo e data conforme a Seção 7.5.
- [x] Gerar UUID v4 e timestamps UTC no backend.
- [x] Cifrar conteúdo e Content Key conforme a Seção 5.5.
- [x] Usar AAD `capsule:<id>:<content_format_version>`.
- [x] Implementar a ordenação da Seção 7.5.
- [x] Retornar DTOs sem BLOBs, chaves ou IVs.
- [x] Garantir `NOT_AUTHENTICATED` nos comandos protegidos.

**Testes:**

- [x] `TEST-CAP-01` a `TEST-CAP-07` e `TEST-CAP-09`.
- [x] Critérios `CAP-AC-01` a `CAP-AC-06`.

**Pronto quando:** uma cápsula criada puder ser listada sem expor conteúdo ou segredos.

---

## Fase 6 — Revelação, leitura, arquivamento e exclusão

**Objetivo:** completar o ciclo de vida das cápsulas.

**Depende de:** Fase 5.

**Arquivos principais:**

- `src-tauri/src/services/reveal.rs`
- `src-tauri/src/services/capsule.rs`
- `src-tauri/src/commands/capsules.rs`

**Passos:**

- [x] Implementar `reveal_due` em transação.
- [x] Transicionar somente cápsulas `sealed` vencidas.
- [x] Preencher `revealed_at` e retornar os IDs transicionados.
- [x] Garantir idempotência e concorrência segura.
- [x] Implementar `read_capsule` com revalidação de data e status.
- [x] Decifrar CK e conteúdo usando IVs persistidos e AAD.
- [x] Zeroizar CK e buffers após montar a resposta.
- [x] Implementar `archive_capsule` com idempotência.
- [x] Implementar `delete_capsule`, commit e `VACUUM` fora da transação.
- [x] Garantir que `reveal_due` não descriptografe nada.

**Testes:**

- [x] `TEST-REV-01` a `TEST-REV-06`.
- [x] `TEST-ARC-01` a `TEST-ARC-05`.
- [x] `TEST-CAP-08`.
- [x] `SEC-AC-04` e `SEC-AC-05`.

**Pronto quando:** a máquina de estados da Seção 7.6 for respeitada e BLOBs trocados falharem por AAD.

---

## Fase 7 — Integração Tauri e runtime

**Objetivo:** ligar backend, eventos, tarefa periódica e configuração Tauri.

**Depende de:** Fases 4, 5 e 6.

**Passos:**

- [x] Registrar todos os comandos da Seção 7.4.
- [x] Gerenciar `AppState` no builder.
- [x] Garantir `single-instance` registrado antes dos demais plugins.
- [x] Executar migrações antes de qualquer comando.
- [x] Iniciar verificação imediata de cápsulas vencidas.
- [x] Iniciar poll de 60 segundos.
- [x] Emitir `capsules://revealed` somente após commit.
- [x] Tentar notificação local com fallback silencioso.
- [x] Ajustar CSP de release, capabilities e devtools.
- [x] Validar chamadas IPC reais com `pnpm tauri dev` — setup, login, criação, revelação por
      foco, poll de 60 s, leitura, arquivamento, exclusão e bloqueio, com inspeção via WebView2/CDP.

**Testes:**

- [x] `TEST-REV-01` a `TEST-REV-03` no fluxo integrado.
- [x] `QA-NOTIF-01`, `QA-NOTIF-02` e `QA-NOTIF-03` — banner e toast validados no Windows; com
      notificações desabilitadas no SO, o banner in-app continuou funcionando.

**Pronto quando:** os comandos funcionarem via IPC e o app continuar verificando revelações mesmo bloqueado.

---

## Fase 8 — Frontend base e autenticação

**Objetivo:** criar a camada de dados, rotas e telas de setup/login.

**Depende de:** Fase 7.

**Arquivos principais:**

- `src/lib/types.ts`
- `src/lib/errors.ts`
- `src/lib/api.ts`
- `src/lib/dates.ts`
- `src/lib/query.ts`
- `src/hooks/useAppState.ts`
- `src/hooks/useTauriEvents.ts`
- `src/routes/Setup.tsx`
- `src/routes/Login.tsx`
- `src/components/Layout.tsx`
- `src/components/PasswordStrength.tsx`

**Passos:**

- [x] Espelhar os DTOs do backend.
- [x] Mapear todos os `ErrorCode` para PT-BR.
- [x] Criar wrappers tipados de `invoke`.
- [x] Implementar conversão local ↔ UTC e formatação `pt-BR`.
- [x] Implementar boot guard e guards de setup/login.
- [x] Implementar setup com confirmação de senha e checkbox obrigatório.
- [x] Implementar zxcvbn com dicionário PT-BR e score mínimo 3.
- [x] Exibir aviso de irreversibilidade da senha.
- [x] Implementar backoff com contagem regressiva e limpeza do campo após erro.
- [x] Solicitar permissão de notificação após o setup.
- [x] Limpar o cache ao receber `auth://locked`.

**Testes:**

- [x] `TEST-UI-03`, `TEST-UI-05`, `TEST-UI-06`, `TEST-UI-07` e `TEST-UI-08`.
- [x] `AUTH-AC-03` e `AUTH-AC-04`.

**Pronto quando:** setup, login e bloqueio funcionarem de ponta a ponta pela UI.

---

## Fase 9 — UI de cápsulas seladas e criação

**Objetivo:** permitir criar, listar e excluir cápsulas seladas.

**Depende de:** Fase 8.

**Arquivos principais:**

- `src/routes/SealedHome.tsx`
- `src/routes/NewCapsule.tsx`
- `src/components/CapsuleCard.tsx`
- `src/components/Countdown.tsx`
- `src/components/ConfirmDialog.tsx`

**Passos:**

- [x] Implementar Home com navegação principal.
- [x] Implementar formulário com react-hook-form + zod.
- [x] Usar `datetime-local` e converter para UTC no envio.
- [x] Exibir preview em UTC e local.
- [x] Validar data futura e limites de título/corpo.
- [x] Exibir contadores de 80 caracteres e 1 MB.
- [x] Implementar estados de carregando, vazio, erro e sucesso.
- [x] Exibir toast `Cápsula selada com sucesso.`
- [x] Implementar confirmação de exclusão com foco preso, `Esc` e restauração de foco.

**Testes:**

- [x] `TEST-UI-01`, `TEST-UI-02`, `TEST-UI-04` e `TEST-UI-10`.
- [x] `UI-AC-03` e `UI-AC-04`.

**Pronto quando:** criar, listar e excluir uma cápsula selada funcionar pela UI.

---

## Fase 10 — UI de reveladas, arquivadas e detalhe

**Objetivo:** completar a leitura e o gerenciamento das cápsulas reveladas e arquivadas.

**Depende de:** Fase 9.

**Arquivos principais:**

- `src/routes/RevealedList.tsx`
- `src/routes/ArchivedList.tsx`
- `src/routes/CapsuleDetail.tsx`
- `src/components/NotificationBanner.tsx`

**Passos:**

- [x] Implementar listas de reveladas e arquivadas.
- [x] Implementar detalhe com leitura sob demanda.
- [x] Remover conteúdo do cache ao desmontar.
- [x] Exibir conteúdo como texto puro, sem interpretar HTML/Markdown.
- [x] Implementar arquivamento e exclusão no detalhe.
- [x] Implementar banner de notificação com `role="status"`.
- [x] Invalidar `["app-state"]` e `["capsules"]` ao receber `capsules://revealed`.
- [x] Limpar todo o cache ao receber `auth://locked`.

**Testes:**

- [x] `TEST-UI-09` e `TEST-UI-11`.
- [x] `UI-AC-05` e `UI-AC-06`.
- [x] `REV-AC-01` a `REV-AC-06`.
- [x] `ARC-AC-01` a `ARC-AC-05`.

**Pronto quando:** o ciclo selar → revelar → ler → arquivar → excluir funcionar pela UI.

---

## Fase 11 — Hardening, QA manual e release

**Objetivo:** fechar acessibilidade, configuração, documentação e build.

**Depende de:** Fase 10.

**Passos:**

- [x] Revisar contraste AA e navegação completa por teclado.
- [x] Garantir `aria-live` em erros assíncronos e foco correto em diálogos.
- [x] Revisar todos os textos obrigatórios em PT-BR.
- [x] Revisar CSP, devtools em release e NSIS `currentUser`.
- [x] Garantir ausência de permissões `shell`, `fs` e `http`.
- [x] Atualizar README com setup, comandos, backup, reset e limitações.
- [x] Garantir PRD alinhado ao SPEC.
- [x] Executar QA manual:
  - [x] `QA-NOTIF-01` — cápsula criada para daqui a 2 min; poll de 60 s revelou, exibiu o banner e
        registrou o toast no Windows.
  - [x] `QA-NOTIF-02` — cápsula vencida com o app fechado; no boot o backend revelou, emitiu o
        evento e o banner apareceu após o login; toast registrado.
  - [x] `QA-NOTIF-03` — notificações desabilitadas para o handler no Windows; o banner in-app com
        a contagem continuou funcionando e não houve toast.
  - [x] `QA-BUILD-01` — instalação `currentUser` silenciosa em diretório temporário, abertura e
        desinstalação validadas.
  - [x] `QA-BACKUP-01` — app fechado, `.db` copiado, original removido e restaurado; cápsula
        revelada no boot e lida com a mesma senha.
  - [x] `QA-CLOCK-01` — `reveal_date` avançada no SQLite; `read_capsule` retornou
        `CAPSULE_NOT_DUE`; risco de cápsula já revelada aceito e documentado.
- [x] Rodar todos os gates da Seção 11.5.
- [x] Gerar e instalar o NSIS sem privilégios administrativos.

**Pronto quando:** todos os gates passarem e o instalador funcionar em uma instalação limpa.

---

## Gates de qualidade

Executar antes de concluir cada fase com impacto em código:

```bash
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
pnpm lint
pnpm typecheck
pnpm test
```

No fechamento do MVP, executar também:

```bash
pnpm tauri build
```

## Riscos e decisões de atenção

- **PRD desatualizado:** resolver a contradição sobre hash de senha antes de implementar auth.
- **Argon2id e Mutex:** nunca manter o lock do banco durante `await` ou derivação longa.
- **Notificação no Windows:** pode falhar em dev; o banner in-app é obrigatório.
- **Relógio retrocedido:** `read_capsule` deve retornar `CAPSULE_NOT_DUE` quando a data voltar a ser futura.
- **Cápsula selada vencida:** `read_capsule` retorna `CAPSULE_NOT_READABLE`; a transição é feita por `reveal_due`.
- **`VACUUM`:** executar após o commit do `DELETE`, sem statements ativos.
- **Plaintext no frontend:** remover do cache ao desmontar, bloquear ou receber `auth://locked`.
- **Instância única:** manter o plugin registrado antes dos demais.
- **CSP:** validar o build de release; o `devCsp` não deve vazar para produção.

## Próxima tarefa

Começar pela **Fase 0** e só avançar para a Fase 1 depois que PRD e SPEC estiverem alinhados.
