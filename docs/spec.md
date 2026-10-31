# SPEC — Cápsula do Tempo

**Versão:** 1.0  
**Data:** Outubro de 2026  
**Status:** Aprovado para implementação  
**Documento de produto:** [`docs/PRD.md`](docs/PRD.md) v1.0  
**Plataforma-alvo:** Windows 10/11 x64  
**Escopo:** MVP

---

## 1. Autoridade e convenções

### 1.1 Relação com o PRD

- O **PRD** é a fonte de verdade para **comportamento de produto**, escopo e critérios de aceite de negócio.
- Este **SPEC** é a fonte de verdade para **implementação**: arquitetura, contratos, schema, erros, segurança técnica e testes.
- Em caso de conflito:
  - comportamento funcional → prevalece o PRD;
  - detalhe técnico → prevalece este SPEC;
  - conflito insolúvel → este SPEC deve ser atualizado e versionado.

### 1.2 Palavras-chave

- **MUST / DEVE**: obrigatório. A implementação não atende ao SPEC se não cumprir.
- **SHOULD / DEVERIA**: recomendado; desvio exige justificativa registrada.
- **MAY / PODE**: opcional.

### 1.3 Identificadores

Requisitos deste documento usam os prefixos:

| Prefixo   | Área                               |
| --------- | ---------------------------------- |
| `SEC-*`   | Segurança e criptografia           |
| `AUTH-*`  | Setup, login, sessão e bloqueio    |
| `DATA-*`  | Banco, migrações e integridade     |
| `API-*`   | Comandos Tauri e contratos         |
| `CAP-*`   | Cápsulas seladas                   |
| `REV-*`   | Revelação e leitura                |
| `ARC-*`   | Arquivamento                       |
| `UI-*`    | Frontend, telas e acessibilidade   |
| `NOTIF-*` | Notificações                       |
| `NFR-*`   | Requisitos não funcionais técnicos |
| `TEST-*`  | Estratégia e cenários de teste     |

### 1.4 Glossário

| Termo         | Definição                                                                       |
| ------------- | ------------------------------------------------------------------------------- |
| **MK**        | Master Key: chave de 256 bits derivada da senha mestra; vive apenas em memória. |
| **CK**        | Content Key: chave de 256 bits aleatória, única por cápsula.                    |
| **Key-check** | Texto cifrado com a MK usado para verificar a senha sem armazenar hash.         |
| **Selada**    | Cápsula com `status = sealed`; conteúdo inacessível até `reveal_date`.          |
| **Revelada**  | Cápsula com `status = revealed`; conteúdo legível.                              |
| **Arquivada** | Cápsula com `status = archived`; conteúdo legível e fora da lista principal.    |
| **AAD**       | Additional Authenticated Data do AES-GCM; autentica metadados sem cifrá-los.    |
| **Backoff**   | Atraso progressivo aplicado após tentativas de login incorretas.                |

---

## 2. Escopo

### 2.1 Dentro do MVP

| Área         | Incluído                                                           |
| ------------ | ------------------------------------------------------------------ |
| Autenticação | Setup da senha mestra, login, bloqueio manual de sessão            |
| Cápsulas     | Criar, listar seladas, deletar                                     |
| Revelação    | Transição automática por data, leitura sob demanda                 |
| Arquivamento | Arquivar reveladas, listar, reler, deletar                         |
| Notificações | Toast local ao revelar, com tolerância a permissão negada          |
| Persistência | SQLite local, backup manual por cópia do arquivo                   |
| Segurança    | AES-256-GCM, Argon2id, key-check, zeroização de segredos           |
| Qualidade    | Testes unitários Rust/Vitest, testes de integração Rust, QA manual |

### 2.2 Fora do MVP

- Notificação com o aplicativo completamente fechado.
- Auto-lock por inatividade (apenas botão "Bloquear").
- Sincronização em nuvem, telemetria, login remoto.
- Mídia nas cápsulas (imagens, áudio, anexos).
- Múltiplos usuários/perfis.
- Recuperação ou alteração da senha mestra.
- Exportação/importação de cápsulas.
- Temas visuais, modo escuro, i18n (UI apenas PT-BR).
- Auto-update, tray icon, atalhos globais.
- Assinatura de código e E2E automatizado.
- Time-lock criptográfico puro (sem enforcement da aplicação).

### 2.3 Premissas

- Uso single-user, offline-first, em uma única janela.
- Aplicativo com instância única (evita corrupção do SQLite).
- Usuário é o proprietário do dispositivo e da senha.
- Relógio do sistema é a referência temporal; manipulação é risco aceito.

---

## 3. Stack e dependências

### 3.1 Stack

| Camada          | Tecnologia                             | Observação                                   |
| --------------- | -------------------------------------- | -------------------------------------------- |
| Shell desktop   | Tauri 2.x (stable)                     | Rust stable, target `x86_64-pc-windows-msvc` |
| Frontend        | React + TypeScript (strict)            | Versões estáveis fixadas no lockfile         |
| Build frontend  | Vite                                   | Dev server porta `1420`                      |
| Gerenciador     | pnpm 9+                                | `pnpm-lock.yaml` versionado                  |
| Estilo          | Tailwind CSS                           | Tokens em CSS variables                      |
| Banco           | SQLite via `rusqlite` (`bundled`)      | Sem servidor; arquivo único                  |
| Notificações    | `tauri-plugin-notification`            | Permissão solicitada na UI                   |
| Instância única | `tauri-plugin-single-instance`         | Registrado antes dos demais plugins          |
| Testes          | `cargo test`, Vitest + Testing Library | E2E automatizado fora do MVP                 |

### 3.2 Dependências Rust

Versões exatas são resolvidas no scaffold e travadas em `src-tauri/Cargo.lock`.

| Crate                           | Uso                                  |
| ------------------------------- | ------------------------------------ |
| `tauri`                         | Shell, comandos, estado, eventos     |
| `tauri-plugin-notification`     | Notificação local                    |
| `tauri-plugin-single-instance`  | Instância única                      |
| `serde`, `serde_json`           | Serialização de DTOs e erros         |
| `rusqlite` (feature `bundled`)  | SQLite embutido                      |
| `argon2`                        | Derivação Argon2id                   |
| `aes-gcm`                       | AES-256-GCM                          |
| `rand`                          | Salt, IVs e Content Keys             |
| `zeroize`                       | Limpeza de segredos em memória       |
| `uuid` (features `v4`, `serde`) | IDs de cápsulas                      |
| `chrono` (feature `serde`)      | Datas UTC e RFC3339                  |
| `thiserror`                     | Erros internos                       |
| `base64`                        | Persistência de salt, IV e key-check |

### 3.3 Dependências frontend

| Pacote                                            | Uso                          |
| ------------------------------------------------- | ---------------------------- |
| `@tauri-apps/api`                                 | `invoke`, eventos            |
| `@tauri-apps/plugin-notification`                 | Permissão e envio auxiliar   |
| `react-router-dom`                                | Rotas                        |
| `@tanstack/react-query`                           | Cache e invalidação de dados |
| `react-hook-form` + `zod` + `@hookform/resolvers` | Formulários e validação      |
| `zxcvbn` ou `@zxcvbn-ts/core` + dicionário PT-BR  | Medidor de força de senha    |
| `tailwindcss`                                     | Estilização                  |
| `vitest`, `@testing-library/react`, `jsdom`       | Testes de frontend           |
| `eslint`, `prettier`, `typescript`                | Qualidade                    |

### 3.4 Restrições de dependência

- **MUST NOT** usar `tauri-plugin-sql`; todo acesso ao banco e criptografia ocorre em Rust.
- **MUST NOT** adicionar plugins de `shell`, `fs` ou `http` no MVP.
- **MUST** manter `Cargo.lock` e `pnpm-lock.yaml` versionados.
- **SHOULD** evitar dependências novas sem necessidade comprovada.

---

## 4. Arquitetura

### 4.1 Visão de camadas

```
┌──────────────────────────────────────────────────────────┐
│ Frontend React                                            │
│  rotas · formulários · React Query · apresentação         │
└───────────────────────────┬──────────────────────────────┘
                            │ invoke (IPC) / eventos
┌───────────────────────────▼──────────────────────────────┐
│ Comandos Tauri (thin layer)                               │
│  validação de borda · autorização · mapeamento de erros   │
└───────────────────────────┬──────────────────────────────┘
┌───────────────────────────▼──────────────────────────────┐
│ Serviços Rust                                             │
│  auth · capsules · reveal · session · rate limiter        │
└───────────────┬───────────────────────────┬──────────────┘
┌───────────────▼──────────────┐ ┌──────────▼──────────────┐
│ Crypto                        │ │ Repositório SQLite       │
│  Argon2id · AES-GCM · zeroize │ │  migrações · queries     │
└───────────────────────────────┘ └──────────┬──────────────┘
                                              │
                                     time-lock.db (disco)
```

### 4.2 Fronteira de confiança

- **SEC-01**: o frontend MUST NOT ser considerado confiável para nenhuma regra de segurança. Toda validação crítica (senha, data de revelação, estado, autorização) MUST ocorrer no backend Rust.
- **SEC-02**: chaves, Content Keys e plaintext de cápsulas MUST NOT trafegar para o frontend, exceto o conteúdo decifrado de uma cápsula revelada/arquivada no comando `read_capsule`.
- **SEC-03**: o frontend MUST NOT persistir segredos em `localStorage`, `sessionStorage`, cookies, URL, logs ou telemetria.
- **SEC-04**: o conteúdo decifrado MUST existir apenas na memória da sessão e ser descartado ao fechar o detalhe, bloquear ou sair do app.

### 4.3 Estado da aplicação (Rust)

```rust
struct AppState {
    db: Mutex<Connection>,
    session: Mutex<Session>,
    limiter: Mutex<RateLimiter>,
    app: AppHandle,
}

struct Session {
    master_key: Option<Zeroizing<[u8; 32]>>,
}

struct RateLimiter {
    failed_attempts: u32,
    blocked_until: Option<Instant>,
}
```

Regras:

- **SEC-05**: `master_key` MUST ser `None` enquanto bloqueado e `Some` somente após setup/login bem-sucedido.
- **SEC-06**: a MK MUST ser zeroizada ao bloquear, ao sair do app e ao substituir a sessão.
- **SEC-07**: o backend MUST NOT manter plaintext de cápsulas em cache.
- **NFR-01**: operações com Argon2id MUST rodar em `spawn_blocking` para não bloquear o runtime do Tauri.
- **NFR-02**: nenhum `await` MUST ocorrer enquanto um `std::sync::Mutex` estiver travado.

### 4.4 Persistência

- **DATA-01**: o banco MUST residir em `app_data_dir()/time-lock.db`.
  - Windows: `%APPDATA%\com.capsuladotempo.app\time-lock.db`.
- **DATA-02**: a aplicação MUST garantir instância única via `tauri-plugin-single-instance`.
- **DATA-03**: migrações MUST rodar antes da criação da janela e antes de qualquer comando.
- **DATA-04**: o arquivo SQLite MUST ser autocontido para backup manual:
  - `journal_mode = DELETE` (sem arquivos `-wal`/`-shm` persistentes);
  - `synchronous = FULL`.
- **DATA-05**: backups são manuais e documentados: fechar o app, copiar o `.db`.
- **DATA-06**: o banco copiado para outro dispositivo MUST funcionar com a mesma senha (salt e key-check são persistidos).

### 4.5 Tarefa de revelação

- **REV-01**: ao iniciar, o backend MUST executar uma verificação imediata de cápsulas vencidas.
- **REV-02**: enquanto o app estiver aberto (inclusive minimizado), o backend MUST verificar a cada 60 segundos.
- **REV-03**: a rotina de verificação MUST NOT exigir sessão destravada, pois não descriptografa conteúdo.
- **REV-04**: a rotina MUST ser idempotente: somente cápsulas `sealed` vencidas são transicionadas.
- **REV-05**: após uma transição com sucesso, o backend MUST emitir o evento `capsules://revealed` e tentar enviar notificação local.

### 4.6 Estrutura de arquivos alvo

```
time-lock/
├── docs/
│   ├── PRD.md
│   ├── spec.md
│   └── adr/
│       ├── 0001-stack-tauri-react-rust.md
│       ├── 0002-modelo-criptografico-keycheck.md
│       └── 0003-sqlite-migracoes-e-backup.md
├── package.json
├── pnpm-lock.yaml
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── routes/
│   │   ├── Setup.tsx
│   │   ├── Login.tsx
│   │   ├── SealedHome.tsx
│   │   ├── NewCapsule.tsx
│   │   ├── RevealedList.tsx
│   │   ├── ArchivedList.tsx
│   │   └── CapsuleDetail.tsx
│   ├── components/
│   │   ├── Layout.tsx
│   │   ├── CapsuleCard.tsx
│   │   ├── ConfirmDialog.tsx
│   │   ├── Countdown.tsx
│   │   ├── PasswordStrength.tsx
│   │   └── NotificationBanner.tsx
│   ├── lib/
│   │   ├── api.ts
│   │   ├── types.ts
│   │   ├── errors.ts
│   │   ├── dates.ts
│   │   └── query.ts
│   ├── hooks/
│   │   ├── useAppState.ts
│   │   ├── useCapsules.ts
│   │   └── useTauriEvents.ts
│   └── styles/
│       └── globals.css
└── src-tauri/
    ├── Cargo.toml
    ├── Cargo.lock
    ├── tauri.conf.json
    ├── capabilities/default.json
    ├── icons/...
    └── src/
        ├── main.rs
        ├── lib.rs
        ├── state.rs
        ├── error.rs
        ├── commands/
        │   ├── mod.rs
        │   ├── auth.rs
        │   └── capsules.rs
        ├── crypto/
        │   ├── mod.rs
        │   ├── kdf.rs
        │   ├── cipher.rs
        │   └── keycheck.rs
        ├── db/
        │   ├── mod.rs
        │   ├── migrations.rs
        │   ├── config.rs
        │   └── capsules.rs
        └── services/
            ├── mod.rs
            ├── auth.rs
            ├── capsule.rs
            ├── reveal.rs
            └── rate_limit.rs
```

---

## 5. Modelo de segurança

### 5.1 Threat model

| Ativo                 | Adversário                                 | Proteção                                               |
| --------------------- | ------------------------------------------ | ------------------------------------------------------ |
| Conteúdo das cápsulas | Quem obtém o arquivo `.db`                 | AES-256-GCM com CK aleatória; CK cifrada com MK        |
| Senha mestra          | Quem obtém o arquivo `.db`                 | Nunca persistida; Argon2id com salt; key-check         |
| Conteúdo em memória   | Processo local malicioso / dump de memória | Fora do escopo do MVP; mitigação parcial com `zeroize` |
| Datas e títulos       | Quem obtém o `.db`                         | Aceito como metadados não sensíveis                    |
| Relógio do sistema    | Usuário que adianta o relógio              | Aceito no MVP (enforcement pela aplicação)             |
| Força bruta offline   | Quem copia o `.db`                         | Argon2id + política de senha; risco residual aceito    |

**Fora do escopo de segurança:** sistema operacional comprometido, malware com acesso ao processo, captura de tela, keyloggers, acesso físico desbloqueado, engenharia social.

### 5.2 Hierarquia de chaves

```
Senha mestra (nunca persistida)
        │
        ▼ Argon2id(senha, salt, parâmetros versionados)
Master Key — 32 bytes — somente memória
        │
        ├──► key-check (AES-256-GCM) ──► persistido (valida senha)
        │
        └──► decifra encrypted_content_key ──► Content Key (32 bytes, memória)
                                                     │
                                                     ▼ AES-256-GCM
                                             encrypted_content (BLOB)

Persistido no SQLite:
  encrypted_content, iv_content, encrypted_content_key, iv_key,
  title (claro), reveal_date (claro), status (claro), timestamps (claro),
  argon2_salt, parâmetros, key_check, key_check_iv
```

### 5.3 Parâmetros criptográficos

| Parâmetro             | Valor                       | Observação                            |
| --------------------- | --------------------------- | ------------------------------------- |
| KDF                   | Argon2id v=19               | `argon2` crate                        |
| Memória               | `m = 65536` KiB (64 MiB)    | Persistido em `app_config`            |
| Iterações             | `t = 3`                     | Persistido                            |
| Paralelismo           | `p = 1`                     | Persistido                            |
| Salt                  | 16 bytes aleatórios         | Gerado no setup; único por instalação |
| Saída do KDF          | 32 bytes                    | MK                                    |
| Cifra de conteúdo     | AES-256-GCM                 | IV 12 bytes por cápsula/operação      |
| Cifra da CK           | AES-256-GCM                 | IV 12 bytes por cápsula               |
| Cifra do key-check    | AES-256-GCM                 | IV 12 bytes no setup                  |
| Formato               | `crypto_format_version = 1` | Permite migração futura               |
| Codificação de config | Base64 padrão com padding   | Apenas em `app_config`                |

- **SEC-08**: parâmetros do KDF MUST ser lidos de `app_config` no login, nunca hardcoded apenas no código.
- **SEC-09**: se `crypto_format_version` for desconhecida, o app MUST falhar de forma segura com `CRYPTO_ERROR`.
- **SEC-10**: o salt MUST ter no mínimo 16 bytes e ser gerado com CSPRNG (`rand::rngs::OsRng` ou equivalente).

### 5.4 Key-check

- **SEC-11**: o setup MUST criar o key-check da seguinte forma:
  - `sentinel = b"time-lock:keycheck:v1"`;
  - `aad = b"time-lock:keycheck:v1"`;
  - `iv_keycheck = 12 bytes aleatórios`;
  - `key_check = AES-256-GCM(MK, nonce=iv_keycheck, plaintext=sentinel, aad=aad)`;
  - persistir `key_check` e `key_check_iv` em Base64.
- **SEC-12**: o login MUST derivar a MK com os parâmetros persistidos e tentar decifrar o key-check com o IV e AAD persistidos/versionados.
  - Sucesso + sentinela idêntica → senha correta.
  - Falha de autenticação GCM → `INVALID_PASSWORD` (não distinguir senha errada de key-check corrompido).
- **SEC-13**: um key-check ausente com `setup_completed=true` MUST resultar em `CRYPTO_ERROR` e bloquear o login.
- **SEC-14**: a senha mestra (ou seu hash) MUST NOT ser persistida em nenhum formato.

### 5.5 Criptografia de cápsulas

No `create_capsule`:

1. `ck = 32 bytes aleatórios`.
2. `iv_content = 12 bytes aleatórios`.
3. `iv_key = 12 bytes aleatórios`.
4. `aad = format!("capsule:{}:{}", id, content_format_version)` com `content_format_version = 1`.
5. `encrypted_content = AES-256-GCM(ck, iv_content, body_bytes, aad)`.
6. `encrypted_content_key = AES-256-GCM(mk, iv_key, ck, aad)`.
7. Persistir `encrypted_content`, `iv_content`, `encrypted_content_key`, `iv_key`, `content_format_version = 1`.
8. Zeroizar `ck`, `body_bytes` e buffers intermediários.

- **SEC-15**: a CK MUST ser gerada por cápsula; reutilização de CK entre cápsulas é proibida.
- **SEC-16**: IVs MUST ser únicos por operação; nunca derivados de data, ID ou contador previsível.
- **SEC-17**: o AAD MUST amarrar o ciphertext ao `id` da cápsula e à versão do formato, impedindo troca de BLOBs entre linhas.
- **SEC-18**: a leitura MUST usar o AAD calculado a partir do `id` persistido e de `content_format_version`.
- **SEC-19**: falha de autenticação GCM na leitura MUST retornar `CRYPTO_ERROR`, sem detalhes internos.

### 5.6 Política de senha

- **AUTH-01**: comprimento mínimo de **12 caracteres Unicode**; máximo de **1024 bytes UTF-8**.
- **AUTH-02**: na UI, a senha MUST ser avaliada por zxcvbn com dicionário PT-BR e score mínimo **3** (escala 0–4).
- **AUTH-03**: o backend MUST validar comprimento mínimo/máximo; a avaliação zxcvbn é uma proteção de UX e não uma fronteira de segurança.
- **AUTH-04**: senhas com score < 3 MUST ser rejeitadas na tela de setup com sugestão de melhoria.
- **AUTH-05**: espaços são caracteres válidos; a senha MUST NOT sofrer trim silencioso.
- **AUTH-06**: colar e usar gerenciador de senhas MUST ser permitido.
- **AUTH-07**: a UI MUST exibir aviso explícito de que não há recuperação de senha.

### 5.7 Backoff de login

- **AUTH-08**: o contador de falhas MUST residir em memória e ser resetado em login bem-sucedido.
- **AUTH-09**: política de atraso:

| Falhas consecutivas | Atraso antes da próxima tentativa |
| ------------------- | --------------------------------- |
| 1–2                 | 0 s                               |
| 3                   | 1 s                               |
| 4                   | 2 s                               |
| 5                   | 4 s                               |
| 6                   | 8 s                               |
| 7                   | 16 s                              |
| 8+                  | 30 s (teto)                       |

- **AUTH-10**: durante o atraso, `unlock` MUST retornar `RATE_LIMITED` com `retry_after_ms`.
- **AUTH-11**: reiniciar o app zera o backoff; isso é uma limitação documentada, pois brute-force offline do arquivo não é impedido pelo backoff.
- **AUTH-12**: o atraso MUST ser aplicado no backend, não apenas desabilitando o botão na UI.

### 5.8 Zeroização e logs

- **SEC-20**: `zeroize` MUST ser aplicado a MK, CK, corpo plaintext e buffers de chave derivada.
- **SEC-21**: logs MUST NOT conter senha, MK, CK, plaintext, key-check ou BLOBs.
- **SEC-22**: erros retornados ao frontend MUST NOT conter SQL, caminhos internos ou mensagens de bibliotecas criptográficas.
- **SEC-23**: o app MUST NOT enviar dados pela rede.

---

## 6. Modelo de dados

### 6.1 Pragmas de conexão

Aplicados em cada abertura de conexão:

```sql
PRAGMA journal_mode = DELETE;
PRAGMA synchronous = FULL;
PRAGMA foreign_keys = ON;
PRAGMA secure_delete = ON;
PRAGMA busy_timeout = 5000;
```

### 6.2 Migração v1

```sql
CREATE TABLE IF NOT EXISTS capsules (
  id                      TEXT PRIMARY KEY NOT NULL,
  title                   TEXT NULL,
  encrypted_content       BLOB NOT NULL,
  iv_content              BLOB NOT NULL CHECK (length(iv_content) = 12),
  encrypted_content_key   BLOB NOT NULL,
  iv_key                  BLOB NOT NULL CHECK (length(iv_key) = 12),
  content_format_version  INTEGER NOT NULL DEFAULT 1,
  reveal_date             TEXT NOT NULL,
  status                  TEXT NOT NULL CHECK (status IN ('sealed', 'revealed', 'archived')),
  revealed_at             TEXT NULL,
  archived_at             TEXT NULL,
  created_at              TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_capsules_status_reveal_date
  ON capsules (status, reveal_date);

CREATE TABLE IF NOT EXISTS app_config (
  key    TEXT PRIMARY KEY NOT NULL,
  value  TEXT NOT NULL
);
```

- **DATA-07**: `user_version` MUST iniciar em `0` e ir para `1` após a migração v1.
- **DATA-08**: a migração MUST ser idempotente e transacional.
- **DATA-09**: colunas não podem ser adicionadas/removidas sem nova migração versionada.

### 6.3 Chaves de `app_config`

| Chave                   | Exemplo                    | Obrigatória após setup |
| ----------------------- | -------------------------- | ---------------------- |
| `setup_completed`       | `"true"`                   | Sim                    |
| `kdf_version`           | `"argon2id-v19"`           | Sim                    |
| `argon2_salt_b64`       | Base64 de 16 bytes         | Sim                    |
| `argon2_m_kib`          | `"65536"`                  | Sim                    |
| `argon2_t`              | `"3"`                      | Sim                    |
| `argon2_p`              | `"1"`                      | Sim                    |
| `crypto_format_version` | `"1"`                      | Sim                    |
| `key_check_b64`         | Base64 do ciphertext + tag | Sim                    |
| `key_check_iv_b64`      | Base64 de 12 bytes         | Sim                    |

- **DATA-10**: `app_config` MUST NOT conter `master_password_hash` nem qualquer hash da senha.
- **DATA-11**: valores ausentes com `setup_completed = "true"` MUST impedir login com `CRYPTO_ERROR`.

### 6.4 Regras de dados

- **DATA-12**: `id` MUST ser UUID v4 em minúsculas.
- **DATA-13**: `title`:
  - NULL quando ausente ou composto apenas por espaços;
  - caso contrário, trim e máximo de **80 caracteres Unicode**;
  - armazenado em claro por decisão de produto.
- **DATA-14**: `reveal_date`, `created_at`, `revealed_at`, `archived_at` MUST ser RFC3339 em UTC com milissegundos (ex.: `2026-10-23T15:04:05.123Z`).
- **DATA-15**: a UI MUST converter UTC ↔ fuso local para exibição e entrada.
- **DATA-16**: comparações de revelação MUST usar UTC.
- **DATA-17**: `status` MUST ser um dos três valores do `CHECK`; nenhum outro valor é válido.
- **DATA-18**: `revealed_at` MUST ser preenchido na transição para `revealed`; `archived_at` na transição para `archived`.
- **DATA-19**: o título NÃO pode ser alterado após a criação.
- **DATA-20**: o conteúdo NÃO pode ser alterado após a criação.

### 6.5 Exclusão segura

- **DATA-21**: deletar uma cápsula MUST remover a linha imediatamente.
- **DATA-22**: após o `DELETE`, o backend MUST executar `VACUUM` fora da transação para reescrever o arquivo e atender CA-05.
- **DATA-23**: o app MUST NOT reutilizar IDs de cápsulas deletadas.

### 6.6 Backup e portabilidade

- **DATA-24**: com o app fechado, copiar `time-lock.db` MUST ser suficiente para backup.
- **DATA-25**: restore = substituir o `.db` com o app fechado.
- **DATA-26**: o app MUST NOT abrir dois processos concorrentes sobre o mesmo arquivo.

---

## 7. Contratos da API Tauri

### 7.1 Envelope de erro

Todos os comandos retornam `Result<T, AppError>`. O frontend recebe:

```ts
interface AppErrorDto {
  code: ErrorCode;
  message: string; // mensagem segura, em PT-BR, sem detalhes internos
  details?: Record<string, unknown>;
}
```

### 7.2 Catálogo de erros

| Código                 | Quando ocorre                                                      | `details`         |
| ---------------------- | ------------------------------------------------------------------ | ----------------- |
| `SETUP_REQUIRED`       | Operação exige setup ainda não concluído                           | —                 |
| `ALREADY_SETUP`        | `setup_master_password` com setup já concluído                     | —                 |
| `INVALID_PASSWORD`     | Senha incorreta ou key-check inválido                              | —                 |
| `RATE_LIMITED`         | Login durante backoff                                              | `retry_after_ms`  |
| `NOT_AUTHENTICATED`    | Comando protegido sem sessão destravada                            | —                 |
| `CAPSULE_NOT_FOUND`    | ID inexistente                                                     | —                 |
| `CAPSULE_NOT_DUE`      | Leitura antes de `reveal_date`                                     | —                 |
| `CAPSULE_NOT_READABLE` | Operação inválida para o estado (ex.: ler selada, arquivar selada) | —                 |
| `INVALID_INPUT`        | Validação de entrada                                               | `field`, `reason` |
| `DB_ERROR`             | Falha de SQLite                                                    | —                 |
| `CRYPTO_ERROR`         | Falha criptográfica/config corrompida                              | —                 |
| `INTERNAL`             | Erro inesperado                                                    | —                 |

- **API-01**: mensagens de erro MUST ser seguras e estáveis; detalhes internos apenas em logs de debug sem segredos.
- **API-02**: erros MUST ser serializáveis com `rename_all = "camelCase"`.

### 7.3 DTOs

```ts
type CapsuleStatus = "sealed" | "revealed" | "archived";

interface CapsuleSummary {
  id: string;
  title: string | null;
  revealDate: string; // RFC3339 UTC
  status: CapsuleStatus;
  createdAt: string; // RFC3339 UTC
  revealedAt: string | null;
  archivedAt: string | null;
}

interface CapsuleContent extends CapsuleSummary {
  content: string; // plaintext apenas em memória
}

interface CreateCapsuleInput {
  title?: string | null;
  content: string;
  revealDate: string; // RFC3339 UTC; frontend converte local -> UTC
}

interface CapsuleFilter {
  status?: CapsuleStatus; // ausente = todos
}

interface AppStateDto {
  setupCompleted: boolean;
  unlocked: boolean;
  pendingReveals: number;
  appVersion: string;
  cryptoFormatVersion: number;
}

interface AuthResult {
  unlocked: boolean;
  pendingReveals: number;
}

interface RevealResult {
  revealed: number;
  ids: string[];
}
```

- **API-03**: os DTOs MUST usar `serde(rename_all = "camelCase")`.
- **API-04**: `CapsuleSummary` MUST NOT conter BLOBs, chaves, IVs ou conteúdo.

### 7.4 Comandos

| Comando                 | Entrada                     | Retorno            | Auth              | Efeitos                                             |
| ----------------------- | --------------------------- | ------------------ | ----------------- | --------------------------------------------------- |
| `get_app_state`         | —                           | `AppStateDto`      | Não               | Lê config; conta vencidas sem transicionar          |
| `setup_master_password` | `password: String`          | `AuthResult`       | Não               | Cria salt, key-check, config; abre sessão           |
| `unlock`                | `password: String`          | `AuthResult`       | Não               | Valida key-check; aplica backoff; abre sessão       |
| `lock`                  | —                           | `void`             | Não (idempotente) | Zeroiza MK; emite `auth://locked`                   |
| `frontend_ready`        | —                           | `void`             | Não               | Sinaliza listeners ativos; libera o primeiro tick   |
| `create_capsule`        | `input: CreateCapsuleInput` | `CapsuleSummary`   | Sim               | Valida, cifra e insere                              |
| `list_capsules`         | `filter: CapsuleFilter`     | `CapsuleSummary[]` | Sim               | Lista por status/ordem                              |
| `reveal_due`            | —                           | `RevealResult`     | Não               | Transiciona vencidas; emite evento; notifica        |
| `read_capsule`          | `id: String`                | `CapsuleContent`   | Sim               | Revalida data; decifra sob demanda                  |
| `archive_capsule`       | `id: String`                | `CapsuleSummary`   | Sim               | `revealed → archived` (idempotente se já arquivada) |
| `delete_capsule`        | `id: String`                | `void`             | Sim               | Remove BLOBs; `VACUUM`                              |

### 7.5 Semântica de cada comando

#### `get_app_state`

- **API-05**: MUST funcionar antes do setup e antes do login.
- **API-06**: `setupCompleted` = `app_config.setup_completed == "true"`.
- **API-07**: `unlocked` = sessão com MK presente.
- **API-08**: `pendingReveals` = contagem de cápsulas `sealed` com `reveal_date <= now()`; não altera estados.

#### `setup_master_password`

- **AUTH-13**: MUST falhar com `ALREADY_SETUP` se `setup_completed = "true"`.
- **AUTH-14**: MUST validar comprimento (12–1024) e retornar `INVALID_INPUT` com `field = "password"`.
- **AUTH-15**: MUST gerar salt novo e key-check conforme a Seção 5.4.
- **AUTH-16**: MUST persistir todas as chaves de config em uma transação; em falha, não deixar setup parcial.
- **AUTH-17**: MUST abrir a sessão com a MK e retornar `AuthResult`.
- **AUTH-18**: MUST NOT registrar a senha ou a MK.

#### `unlock`

- **AUTH-19**: MUST falhar com `SETUP_REQUIRED` se o setup não foi concluído.
- **AUTH-20**: MUST aplicar backoff antes de derivar a chave, retornando `RATE_LIMITED` quando bloqueado.
- **AUTH-21**: MUST derivar a MK com os parâmetros persistidos e validar o key-check.
- **AUTH-22**: em falha, incrementar o contador e retornar `INVALID_PASSWORD`.
- **AUTH-23**: em sucesso, zerar contador, guardar a MK e retornar `AuthResult`.

#### `lock`

- **AUTH-24**: MUST ser idempotente.
- **AUTH-25**: MUST remover e zeroizar a MK.
- **AUTH-26**: MUST emitir `auth://locked` mesmo se já estava bloqueado.

#### `create_capsule`

- **CAP-01**: MUST exigir sessão destravada (`NOT_AUTHENTICATED` caso contrário).
- **CAP-02**: `content` MUST ter entre 1 byte e 1.048.576 bytes UTF-8; vazio/só espaços é inválido.
- **CAP-03**: `title` MUST ser `null` ou ter 1–80 caracteres após trim; acima disso → `INVALID_INPUT`.
- **CAP-04**: `revealDate` MUST ser RFC3339 válido e estritamente futuro em UTC; caso contrário → `INVALID_INPUT`.
- **CAP-05**: MUST gerar `id` UUID v4 e `created_at` UTC no backend; valores do frontend para esses campos são ignorados.
- **CAP-06**: MUST cifrar conforme a Seção 5.5 e persistir em transação.
- **CAP-07**: MUST retornar `CapsuleSummary` sem BLOBs.
- **CAP-08**: SHOULD concluir em menos de 500 ms para conteúdo de até 100 KB (excluindo I/O de disco excepcional).

#### `list_capsules`

- **CAP-09**: MUST exigir sessão destravada.
- **CAP-10**: sem filtro, MUST retornar todas as cápsulas.
- **CAP-11**: ordenação:
  - `sealed`: `reveal_date ASC`;
  - `revealed`: `revealed_at DESC`;
  - `archived`: `archived_at DESC`;
  - todos: `status ASC`, depois regra do grupo.
- **CAP-12**: MUST NOT incluir conteúdo ou BLOBs.

#### `reveal_due`

- **REV-06**: MUST executar em transação: selecionar `sealed` com `reveal_date <= now()`, atualizar para `revealed` e preencher `revealed_at`.
- **REV-07**: MUST retornar os IDs transicionados nesta chamada.
- **REV-08**: MUST ser idempotente; chamadas concorrentes não podem revelar a mesma cápsula duas vezes.
- **REV-09**: se `revealed > 0`:
  - emitir `capsules://revealed` com `{ count, ids }`;
  - tentar notificação local com o formato da Seção 7.8.
- **REV-10**: MUST NOT descriptografar nenhum conteúdo.

#### `read_capsule`

- **REV-11**: MUST exigir sessão destravada.
- **REV-12**: MUST retornar `CAPSULE_NOT_FOUND` para ID inexistente.
- **REV-13**: se `status = sealed` e `reveal_date > now()` → `CAPSULE_NOT_DUE`.
- **REV-14**: se `status = sealed` e `reveal_date <= now()` → `CAPSULE_NOT_READABLE` (a transição é responsabilidade de `reveal_due`).
- **REV-15**: se `reveal_date > now()` mesmo com status `revealed`/`archived` (relógio retrocedeu) → `CAPSULE_NOT_DUE`.
- **REV-16**: MUST decifrar CK com a MK e depois o conteúdo com a CK, usando os IVs persistidos e o AAD da Seção 5.5.
- **REV-17**: MUST zeroizar CK e buffers intermediários após montar a resposta.
- **REV-18**: MUST retornar `CRYPTO_ERROR` em falha de autenticação.
- **REV-19**: MUST NOT persistir plaintext em qualquer lugar.

#### `archive_capsule`

- **ARC-01**: MUST exigir sessão destravada.
- **ARC-02**: somente `revealed → archived`; preencher `archived_at`.
- **ARC-03**: se já estiver `archived`, MUST ser no-op idempotente e retornar o resumo.
- **ARC-04**: se `sealed` → `CAPSULE_NOT_READABLE`.
- **ARC-05**: se `reveal_date > now()` → `CAPSULE_NOT_DUE`.
- **ARC-06**: MUST NOT permitir desarquivar no MVP.

#### `delete_capsule`

- **CAP-13**: MUST exigir sessão destravada.
- **CAP-14**: MUST permitir deletar em qualquer status.
- **CAP-15**: MUST retornar `CAPSULE_NOT_FOUND` se o ID não existir.
- **CAP-16**: MUST executar `DELETE`, commit e depois `VACUUM`.
- **CAP-17**: MUST NOT exigir confirmação no backend; a confirmação é obrigatória na UI.

### 7.6 Máquina de estados

```
                 reveal_due (reveal_date <= now)
   sealed ───────────────────────────────────► revealed
     │                                            │
     │ delete                                     │ archive_capsule
     ▼                                            ▼
  (removida)                                   archived
                                                  │
                                                  │ delete
                                                  ▼
                                              (removida)
```

| De         | Para              | Gatilho | Permitido                     |
| ---------- | ----------------- | ------- | ----------------------------- |
| `sealed`   | `revealed`        | tempo   | Sim, somente via `reveal_due` |
| `sealed`   | `archived`        | manual  | Não                           |
| `revealed` | `archived`        | manual  | Sim                           |
| `archived` | `revealed`        | manual  | Não                           |
| qualquer   | removida          | manual  | Sim                           |
| qualquer   | conteúdo alterado | manual  | Não                           |

### 7.7 Eventos

| Evento                | Payload                            | Emissor                                   |
| --------------------- | ---------------------------------- | ----------------------------------------- |
| `capsules://revealed` | `{ count: number, ids: string[] }` | `reveal_due` (comando e tarefa periódica) |
| `auth://locked`       | `{}`                               | `lock` e saída/bloqueio                   |

- **API-09**: eventos MUST ser emitidos somente após commit da transação.
- **API-10**: o frontend MUST tratar payloads desconhecidos sem quebrar.

### 7.8 Notificação

- **NOTIF-01**: título: `📬 Cápsula do Tempo`.
- **NOTIF-02**: corpo (refinamento gramatical de RF-20, a ser refletido no PRD):
  - 1 cápsula: `Você tem 1 cápsula pronta para abrir!`;
  - N cápsulas: `Você tem N cápsulas prontas para abrir!`.
- **NOTIF-03**: a notificação MUST ser disparada apenas quando `reveal_due` transicionar ao menos uma cápsula.
- **NOTIF-04**: se a permissão estiver negada ou indisponível, o backend MUST ignorar o erro de envio e o frontend MUST exibir banner in-app com a contagem de `pendingReveals`.
- **NOTIF-05**: a notificação MUST NOT conter título de cápsula nem conteúdo.

---

## 8. Fluxos

### 8.1 Primeiro uso (setup)

```
App inicia
  → migrações
  → get_app_state → setupCompleted = false
  → rota /setup
Usuário informa senha + confirmação
  → validação local (zod + zxcvbn >= 3)
  → setup_master_password
      → valida comprimento
      → gera salt + key-check
      → persiste config (transação)
      → sessão com MK
  → frontend solicita permissão de notificação
  → / (Seladas)
  → reveal_due (nenhuma cápsula)
```

- **UI-01**: a confirmação de senha MUST corresponder exatamente à senha.
- **UI-02**: o checkbox "Entendo que não há recuperação de senha" MUST ser obrigatório para habilitar o envio.

### 8.2 Login

```
App inicia
  → migrações
  → get_app_state → setupCompleted = true, unlocked = false
  → rota /login
Usuário informa senha
  → unlock
      → backoff?
          → RATE_LIMITED { retry_after_ms } → UI mostra contagem
      → deriva MK + valida key-check
          → falha → INVALID_PASSWORD + delay
          → sucesso → sessão com MK
  → reveal_due
  → evento/notificação se houver novas
  → / (Seladas)
```

- **AUTH-27**: a tela de login MUST limpar o campo após falha.
- **AUTH-28**: a tela de login MUST exibir o tempo restante de backoff.

### 8.3 Criar cápsula

```
/ → "Nova Cápsula" → /nova
Preenche título (opcional), mensagem, data/hora local
  → preview em UTC e local
  → salvar
      → validação frontend
      → create_capsule { title, content, revealDate }
          → valida novamente no backend
          → gera id, CK, IVs
          → cifra conteúdo e CK
          → INSERT
          → zeroiza
          → CapsuleSummary
  → toast "Cápsula selada com sucesso."
  → invalida lista selada
  → /
```

### 8.4 Revelação automática

```
Startup (após migrações)
  → frontend registra listeners e chama frontend_ready
  → reveal_due (primeiro tick aguarda frontend_ready; timeout 10 s)
      → transição sealed → revealed
      → emite capsules://revealed
      → notifica (se permitido)
  → a cada 60 s: reveal_due
  → frontend ao receber evento:
      → invalida ["app-state"] e ["capsules"]
      → exibe banner/badge
```

- **REV-20**: a tarefa periódica MUST continuar ativa enquanto o app estiver em execução, independentemente do login.
- **REV-21**: o frontend SHOULD chamar `reveal_due` ao ganhar foco, como redundância à tarefa do backend.
- **REV-22**: o frontend MUST chamar `frontend_ready` após registrar os listeners; o primeiro tick MUST aguardar esse sinal (com timeout de segurança) para não perder o evento de boot.

### 8.5 Ler cápsula

```
/reveladas ou /arquivadas → seleciona cápsula
  → /capsula/:id
      → read_capsule(id)
          → exige sessão
          → revalida data
          → decifra CK e conteúdo
          → zeroiza CK
          → retorna plaintext
  → exibe conteúdo (texto puro)
  → ao voltar/fechar:
      → remove conteúdo do cache e da tela
```

- **UI-03**: o detalhe MUST remover o conteúdo do cache ao desmontar (por exemplo, `removeQueries` ou query sem cache).
- **UI-04**: o conteúdo MUST ser exibido como texto puro; HTML/Markdown NÃO devem ser interpretados.

### 8.6 Arquivar

```
/reveladas → "Arquivar" (com confirmação opcional)
  → archive_capsule(id)
  → invalida ["capsules"]
  → cápsula aparece apenas em /arquivadas
```

### 8.7 Deletar

```
Qualquer lista/detalhe → "Excluir"
  → ConfirmDialog:
      "Excluir esta cápsula permanentemente? Esta ação não pode ser desfeita."
  → delete_capsule(id)
  → invalida ["capsules"] e remove detalhe do cache
```

### 8.8 Bloquear

```
Layout → "Bloquear"
  → lock()
      → zeroiza MK
      → emite auth://locked
  → frontend limpa cache do React Query
  → /login
```

---

## 9. Frontend

### 9.1 Rotas

| Rota           | Tela         | Autenticação                          |
| -------------- | ------------ | ------------------------------------- |
| `/setup`       | Setup        | Somente se setup incompleto           |
| `/login`       | Login        | Somente se setup completo e bloqueado |
| `/`            | Seladas      | Obrigatória                           |
| `/nova`        | Nova Cápsula | Obrigatória                           |
| `/reveladas`   | Reveladas    | Obrigatória                           |
| `/arquivadas`  | Arquivadas   | Obrigatória                           |
| `/capsula/:id` | Detalhe      | Obrigatória                           |

- **UI-05**: um guard de boot MUST chamar `get_app_state` antes de renderizar as rotas.
- **UI-06**: com `setupCompleted = false`, todas as rotas MUST redirecionar para `/setup`.
- **UI-07**: com setup completo e `unlocked = false`, rotas protegidas MUST redirecionar para `/login`.
- **UI-08**: com `unlocked = true`, `/setup` e `/login` MUST redirecionar para `/`.

### 9.2 Camada de dados

- **UI-09**: todo acesso ao backend MUST passar por `lib/api.ts`, com wrappers tipados e mapeamento de `AppErrorDto`.
- **UI-10**: chaves de query:
  - `["app-state"]`
  - `["capsules", status]`
  - `["capsules", "all"]`
- **UI-11**: o cache do React Query MUST ser limpo em `auth://locked` e após logout/bloqueio.
- **UI-12**: conteúdo de cápsula MUST NOT ser mantido em cache persistente.

### 9.3 Formulários e validação

- **UI-13**: criar cápsula usa `react-hook-form` + schema zod.
- **UI-14**: erros de validação MUST aparecer junto ao campo, com `aria-describedby`.
- **UI-15**: o campo de data MUST usar `datetime-local`; a conversão para UTC MUST ocorrer no envio.
- **UI-16**: a UI MUST impedir datas passadas com validação e feedback claro.
- **UI-17**: contadores de caracteres para título (80) e bytes para o corpo (1 MB) SHOULD ser exibidos.
- **UI-18**: em erro de backend, mapear o `code` para mensagem PT-BR; `INVALID_INPUT.details.field` MUST destacar o campo.

### 9.4 Estados de tela

Cada lista MUST tratar:

| Estado     | Comportamento                                        |
| ---------- | ---------------------------------------------------- |
| Carregando | Skeleton ou indicador acessível                      |
| Vazio      | Mensagem específica + ação primária quando aplicável |
| Erro       | Mensagem PT-BR + botão "Tentar novamente"            |
| Sucesso    | Lista de cards                                       |

Textos de estado vazio:

- Seladas: `Nenhuma cápsula selada. Escreva a primeira mensagem para o seu eu do futuro.`
- Reveladas: `Nenhuma cápsula revelada ainda. Sua próxima mensagem aguarda a data escolhida.`
- Arquivadas: `Nenhuma cápsula arquivada.`

### 9.5 Apresentação e acessibilidade

- **UI-19**: layout com navegação principal: Seladas, Reveladas, Arquivadas + botão "Nova Cápsula" + "Bloquear".
- **UI-20**: badge visual "Lacrada" nas seladas; countdown até a revelação.
- **UI-21**: diálogos MUST prender foco, fechar com `Esc` e restaurar o foco ao elemento de origem.
- **UI-22**: erros assíncronos MUST usar `aria-live="polite"`.
- **UI-23**: contraste mínimo AA; navegação completa por teclado.
- **UI-24**: datas exibidas com `Intl.DateTimeFormat("pt-BR")`.
- **UI-25**: título ausente exibido como `Sem título`.
- **UI-26**: notificações in-app MUST usar banner com `role="status"` e botão "Ver reveladas".

### 9.6 Textos obrigatórios

| Contexto                | Texto                                                                                                                 |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Aviso no setup          | `Sua senha mestra não pode ser recuperada. Se você esquecê-la, todas as cápsulas serão permanentemente inacessíveis.` |
| Checkbox do setup       | `Entendo que não há recuperação de senha.`                                                                            |
| Erro de login           | `Senha incorreta. Tente novamente.`                                                                                   |
| Backoff                 | `Muitas tentativas. Aguarde {segundos}s para tentar novamente.`                                                       |
| Save com sucesso        | `Cápsula selada com sucesso.`                                                                                         |
| Confirmação de exclusão | `Excluir esta cápsula permanentemente? Esta ação não pode ser desfeita.`                                              |
| Notificação (1)         | `Você tem 1 cápsula pronta para abrir!`                                                                               |
| Notificação (N)         | `Você tem N cápsulas prontas para abrir!`                                                                             |

---

## 10. Configuração Tauri

### 10.1 `tauri.conf.json` (valores normativos)

```json
{
  "productName": "Cápsula do Tempo",
  "identifier": "com.capsuladotempo.app",
  "version": "0.1.0",
  "build": {
    "beforeDevCommand": "pnpm dev",
    "devUrl": "http://localhost:1420",
    "beforeBuildCommand": "pnpm build",
    "frontendDist": "../dist"
  },
  "app": {
    "windows": [
      {
        "title": "Cápsula do Tempo",
        "width": 1000,
        "height": 700,
        "minWidth": 800,
        "minHeight": 600,
        "resizable": true
      }
    ],
    "security": {
      "csp": "default-src 'self'; img-src 'self' asset: data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src ipc: http://ipc.localhost"
    }
  },
  "bundle": {
    "active": true,
    "targets": ["nsis"],
    "windows": {
      "nsis": {
        "installMode": "currentUser"
      }
    },
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ]
  }
}
```

- **NFR-03**: a CSP MUST ser restritiva; scripts apenas do próprio bundle.
- **NFR-04**: devtools MUST ficar desabilitado em builds de release.
- **NFR-05**: o instalador MUST ser NSIS x64 em modo `currentUser` (sem exigir admin).

### 10.2 Capabilities

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Permissões mínimas do MVP",
  "windows": ["main"],
  "permissions": ["core:default", "notification:default"]
}
```

- **NFR-06**: nenhuma permissão de `shell`, `fs` ou `http` MUST ser concedida.
- **NFR-07**: `tauri-plugin-single-instance` MUST ser registrado antes dos demais plugins.

### 10.3 Plugins

```rust
tauri::Builder::default()
    .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.set_focus();
        }
    }))
    .plugin(tauri_plugin_notification::init())
    .manage(state)
    .invoke_handler(tauri::generate_handler![
        commands::auth::get_app_state,
        commands::auth::setup_master_password,
        commands::auth::unlock,
        commands::auth::lock,
        commands::capsules::create_capsule,
        commands::capsules::list_capsules,
        commands::capsules::reveal_due,
        commands::capsules::read_capsule,
        commands::capsules::archive_capsule,
        commands::capsules::delete_capsule,
    ])
    .run(tauri::generate_context!())
    .expect("erro ao iniciar a aplicação");
```

---

## 11. Testes

### 11.1 Pirâmide

| Camada            | Ferramenta                       | Cobertura                                |
| ----------------- | -------------------------------- | ---------------------------------------- |
| Unitário Rust     | `cargo test`                     | Crypto, validação, rate limiter, estados |
| Integração Rust   | `cargo test` + SQLite temporário | Comandos/serviços com DB real            |
| Unitário frontend | Vitest                           | Schemas, datas, erros, guards            |
| Componentes       | Testing Library                  | Formulários, modais, estados             |
| Manual            | Checklist                        | Notificação, instalador, CA-01..CA-06    |
| E2E automatizado  | —                                | Fora do MVP                              |

### 11.2 Matriz de testes Rust

| ID               | Tipo        | Cenário                                                 |
| ---------------- | ----------- | ------------------------------------------------------- |
| `TEST-CRYPTO-01` | unit        | Argon2id deriva a mesma MK com salt/parâmetros iguais   |
| `TEST-CRYPTO-02` | unit        | Argon2id deriva MK diferente com salt diferente         |
| `TEST-CRYPTO-03` | unit        | AES-GCM round-trip de conteúdo                          |
| `TEST-CRYPTO-04` | unit        | Ciphertext adulterado falha com erro de autenticação    |
| `TEST-CRYPTO-05` | unit        | AAD errado falha                                        |
| `TEST-CRYPTO-06` | unit        | IVs de cápsulas distintas são diferentes                |
| `TEST-CRYPTO-07` | unit        | Key-check válido aceita a MK                            |
| `TEST-CRYPTO-08` | unit        | Key-check com senha errada falha                        |
| `TEST-CRYPTO-09` | unit        | Key-check corrompido falha                              |
| `TEST-AUTH-01`   | integration | Setup persiste config e abre sessão                     |
| `TEST-AUTH-02`   | integration | Setup duas vezes → `ALREADY_SETUP`                      |
| `TEST-AUTH-03`   | integration | Login com senha correta                                 |
| `TEST-AUTH-04`   | integration | Login com senha errada → `INVALID_PASSWORD`             |
| `TEST-AUTH-05`   | integration | Backoff retorna `RATE_LIMITED` e `retry_after_ms`       |
| `TEST-AUTH-06`   | integration | Lock zeroiza a sessão e emite evento                    |
| `TEST-AUTH-07`   | integration | Config ausente → `CRYPTO_ERROR`                         |
| `TEST-DB-01`     | integration | Migração v1 define `user_version = 1`                   |
| `TEST-DB-02`     | integration | Migração é idempotente                                  |
| `TEST-DB-03`     | integration | Pragmas aplicados (`secure_delete`, `journal_mode`)     |
| `TEST-CAP-01`    | integration | Criar cápsula retorna resumo sem conteúdo               |
| `TEST-CAP-02`    | integration | Listar seladas ordena por `reveal_date`                 |
| `TEST-CAP-03`    | integration | Título vazio vira `null`                                |
| `TEST-CAP-04`    | integration | Corpo vazio → `INVALID_INPUT`                           |
| `TEST-CAP-05`    | integration | Corpo > 1 MB → `INVALID_INPUT`                          |
| `TEST-CAP-06`    | integration | Título > 80 chars → `INVALID_INPUT`                     |
| `TEST-CAP-07`    | integration | Data passada → `INVALID_INPUT`                          |
| `TEST-CAP-08`    | integration | Delete remove a linha e o arquivo não contém o marcador |
| `TEST-CAP-09`    | integration | Comando protegido sem sessão → `NOT_AUTHENTICATED`      |
| `TEST-REV-01`    | integration | `reveal_due` transiciona vencidas e retorna IDs         |
| `TEST-REV-02`    | integration | `reveal_due` é idempotente                              |
| `TEST-REV-03`    | integration | Cápsula futura → `CAPSULE_NOT_DUE`                      |
| `TEST-REV-04`    | integration | Cápsula vencida ainda selada → `CAPSULE_NOT_READABLE`   |
| `TEST-REV-05`    | integration | Leitura de revelada retorna plaintext correto           |
| `TEST-REV-06`    | integration | Troca de BLOBs entre cápsulas falha por AAD             |
| `TEST-ARC-01`    | integration | Arquivar revelada                                       |
| `TEST-ARC-02`    | integration | Arquivar selada → `CAPSULE_NOT_READABLE`                |
| `TEST-ARC-03`    | integration | Arquivar duas vezes é idempotente                       |
| `TEST-ARC-04`    | integration | Listar arquivadas                                       |
| `TEST-ARC-05`    | integration | Delete arquivada                                        |

### 11.3 Matriz de testes frontend

| ID           | Tipo      | Cenário                                         |
| ------------ | --------- | ----------------------------------------------- |
| `TEST-UI-01` | unit      | Schema zod aceita 1 MB e rejeita 1 MB + 1 byte  |
| `TEST-UI-02` | unit      | Título de 80 chars aceito, 81 rejeitado         |
| `TEST-UI-03` | unit      | Conversão `datetime-local` → ISO UTC            |
| `TEST-UI-04` | unit      | Data passada rejeitada no formulário            |
| `TEST-UI-05` | unit      | Mapeamento de todos os `ErrorCode` para PT-BR   |
| `TEST-UI-06` | component | Guard redireciona para `/setup`                 |
| `TEST-UI-07` | component | Guard redireciona para `/login`                 |
| `TEST-UI-08` | component | Setup exige confirmação e checkbox              |
| `TEST-UI-09` | component | Modal de exclusão prende foco e fecha com `Esc` |
| `TEST-UI-10` | component | Lista vazia exibe texto correto                 |
| `TEST-UI-11` | component | Banner de notificação exibe plural correto      |

### 11.4 QA manual (obrigatório)

| ID             | Passos                                                | Resultado esperado                           |
| -------------- | ----------------------------------------------------- | -------------------------------------------- |
| `QA-NOTIF-01`  | Criar cápsula para daqui a 2 min, manter app aberto   | Toast e badge no poll de 60 s                |
| `QA-NOTIF-02`  | Criar cápsula vencida com app fechado, abrir          | Reveal e toast na abertura                   |
| `QA-NOTIF-03`  | Negar permissão de notificação                        | Banner in-app com contagem                   |
| `QA-BUILD-01`  | Instalar NSIS em usuário sem admin                    | Instala e abre                               |
| `QA-BACKUP-01` | Fechar app, copiar `.db`, deletar original, restaurar | Todas as cápsulas legíveis com a mesma senha |
| `QA-CLOCK-01`  | Adiantar relógio do sistema                           | Cápsula é revelada; risco aceito documentado |

### 11.5 Gates de qualidade

Antes de considerar uma sessão concluída:

```bash
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
pnpm lint
pnpm typecheck
pnpm test
pnpm tauri build
```

- **TEST-01**: todos os gates MUST passar em CI local antes de release.
- **TEST-02**: o build MUST gerar instalador NSIS funcional.

---

## 12. Critérios de aceite (Given/When/Then)

### 12.1 Segurança (`SEC`)

**SEC-AC-01 — Dump do banco sem conteúdo**

> Dado que uma cápsula contém o marcador único `TESTE-SEGURANCA-42`,
> quando o app é fechado e o arquivo `time-lock.db` é inspecionado como bytes,
> então o marcador não aparece em nenhuma posição do arquivo.

**SEC-AC-02 — Senha nunca persistida**

> Dado que o setup foi concluído com a senha `minha-senha-segura-123`,
> quando `app_config` é inspecionado,
> então não existe hash nem valor em claro da senha, apenas salt, parâmetros e key-check.

**SEC-AC-03 — Senha errada não abre sessão**

> Dada uma instalação configurada,
> quando `unlock` é chamado com senha incorreta,
> então retorna `INVALID_PASSWORD` e `get_app_state().unlocked` continua `false`.

**SEC-AC-04 — Ciphertext adulterado**

> Dado o ciphertext de uma cápsula revelada,
> quando um byte é alterado no banco,
> então `read_capsule` retorna `CRYPTO_ERROR` e não retorna plaintext.

**SEC-AC-05 — Troca de BLOBs entre cápsulas**

> Dadas duas cápsulas reveladas,
> quando os BLOBs de conteúdo são trocados entre as linhas,
> então a leitura de ambas falha com `CRYPTO_ERROR` devido ao AAD.

**SEC-AC-06 — Sem segredos em logs**

> Dado qualquer fluxo de setup, login, criação e leitura,
> quando os logs são inspecionados,
> então não há senha, MK, CK, plaintext nem chaves.

### 12.2 Autenticação (`AUTH`)

**AUTH-AC-01 — Setup**

> Dado o primeiro uso,
> quando o usuário define uma senha válida e confirma,
> então o setup é persistido, a sessão é aberta e a Home é exibida.

**AUTH-AC-02 — Setup duplicado**

> Dado o setup já concluído,
> quando `setup_master_password` é chamado novamente,
> então retorna `ALREADY_SETUP`.

**AUTH-AC-03 — Senha fraca**

> Dado a senha `123456789012`,
> quando o setup é submetido,
> então a UI rejeita com score zxcvbn < 3 e sugere uma senha mais forte.

**AUTH-AC-04 — Backoff**

> Dado três tentativas de login incorretas consecutivas,
> quando a quarta tentativa ocorre imediatamente,
> então retorna `RATE_LIMITED` com `retry_after_ms` próximo de 1000.

**AUTH-AC-05 — Reset do backoff**

> Dado um login bem-sucedido após falhas,
> quando uma nova tentativa incorreta ocorre,
> então o backoff recomeça do zero.

**AUTH-AC-06 — Bloquear**

> Dada uma sessão destravada,
> quando o usuário clica em "Bloquear",
> então a MK é removida/zeroizada, o evento `auth://locked` é emitido e a UI volta ao login.

### 12.3 Cápsulas (`CAP`)

**CAP-AC-01 — Criar**

> Dado uma sessão destravada, título opcional, corpo válido e data futura,
> quando `create_capsule` é chamado,
> então a cápsula é persistida como `sealed` e o retorno não contém conteúdo nem BLOBs.

**CAP-AC-02 — Título vazio**

> Dado um título com apenas espaços,
> quando a cápsula é criada,
> então o título persistido é `NULL`.

**CAP-AC-03 — Corpo vazio**

> Dado um corpo vazio,
> quando `create_capsule` é chamado,
> então retorna `INVALID_INPUT` com `field = "content"`.

**CAP-AC-04 — Corpo acima do limite**

> Dado um corpo com 1.048.577 bytes,
> quando `create_capsule` é chamado,
> então retorna `INVALID_INPUT`.

**CAP-AC-05 — Data passada**

> Dada uma data de revelação no passado,
> quando `create_capsule` é chamado,
> então retorna `INVALID_INPUT` com `field = "revealDate"`.

**CAP-AC-06 — Selada não expõe conteúdo**

> Dada uma cápsula selada,
> quando `list_capsules` é chamado,
> então o DTO contém apenas metadados e nunca `content`, chaves ou IVs.

**CAP-AC-07 — Delete selada**

> Dada uma cápsula selada,
> quando o usuário confirma a exclusão,
> então a linha é removida, o `VACUUM` roda e a cápsula desaparece da lista.

**CAP-AC-08 — Acesso sem sessão**

> Dado o app bloqueado,
> quando `create_capsule`, `list_capsules` ou `read_capsule` são chamados,
> então retorna `NOT_AUTHENTICATED`.

### 12.4 Revelação (`REV`)

**REV-AC-01 — Startup**

> Dada uma cápsula selada com `reveal_date` no passado,
> quando o app inicia,
> então ela é transicionada para `revealed`, `revealed_at` é preenchido e a notificação é tentada.

**REV-AC-02 — Poll**

> Dada uma cápsula que vence enquanto o app está aberto,
> quando o poll de 60 s executa,
> então ela é revelada e o evento `capsules://revealed` é emitido.

**REV-AC-03 — Idempotência**

> Dada uma cápsula já revelada,
> quando `reveal_due` roda novamente,
> então nenhuma transição ocorre e nenhuma notificação duplicada é enviada.

**REV-AC-04 — Futuro bloqueado**

> Dada uma cápsula selada com data futura,
> quando `read_capsule` é chamado diretamente,
> então retorna `CAPSULE_NOT_DUE`.

**REV-AC-05 — Relógio retrocedido**

> Dada uma cápsula revelada cuja `reveal_date` voltou a ser futura,
> quando `read_capsule` é chamado,
> então retorna `CAPSULE_NOT_DUE`.

**REV-AC-06 — Leitura correta**

> Dada uma cápsula revelada,
> quando `read_capsule` é chamado com sessão destravada,
> então o conteúdo retornado é idêntico ao original, preservando quebras de linha.

### 12.5 Arquivamento (`ARC`)

**ARC-AC-01 — Arquivar**

> Dada uma cápsula revelada,
> quando o usuário arquiva,
> então o status vira `archived`, `archived_at` é preenchido e ela deixa a lista de reveladas.

**ARC-AC-02 — Somente reveladas**

> Dada uma cápsula selada,
> quando `archive_capsule` é chamado,
> então retorna `CAPSULE_NOT_READABLE`.

**ARC-AC-03 — Idempotência**

> Dada uma cápsula já arquivada,
> quando `archive_capsule` é chamado novamente,
> então retorna o resumo sem erro.

**ARC-AC-04 — Leitura de arquivada**

> Dada uma cápsula arquivada,
> quando `read_capsule` é chamado,
> então o conteúdo é retornado normalmente.

**ARC-AC-05 — Delete de arquivada**

> Dada uma cápsula arquivada,
> quando o usuário confirma a exclusão,
> então ela é removida permanentemente.

### 12.6 Interface (`UI`)

**UI-AC-01 — Guard de setup**

> Dado setup incompleto,
> quando qualquer rota é acessada,
> então o usuário é redirecionado para `/setup`.

**UI-AC-02 — Guard de login**

> Dado setup completo e sessão bloqueada,
> quando uma rota protegida é acessada,
> então o usuário é redirecionado para `/login`.

**UI-AC-03 — Lista vazia**

> Dada uma lista sem cápsulas,
> quando a tela carrega,
> então a mensagem de estado vazio correspondente é exibida.

**UI-AC-04 — Confirmação de exclusão**

> Dado o clique em "Excluir",
> quando o modal abre,
> então o foco fica preso nele, `Esc` fecha e nenhuma exclusão ocorre sem confirmação.

**UI-AC-05 — Texto puro**

> Dado um conteúdo contendo `<script>alert(1)</script>`,
> quando a cápsula é lida,
> então o texto é exibido literalmente e nenhum script executa.

**UI-AC-06 — Bloqueio limpa cache**

> Dado o clique em "Bloquear",
> quando o evento `auth://locked` é recebido,
> então o cache de cápsulas é limpo e o conteúdo não permanece na tela.

---

## 13. Matriz de rastreabilidade

### 13.1 PRD → SPEC

| Requisito PRD | Seções do SPEC                       | Testes                                        |
| ------------- | ------------------------------------ | --------------------------------------------- |
| RF-01         | 7.5 `setup_master_password`, 9.1, 10 | `TEST-AUTH-01`, `AUTH-AC-01`                  |
| RF-02         | 5.3, 5.4, 6.3                        | `TEST-CRYPTO-07`, `TEST-AUTH-01`, `SEC-AC-02` |
| RF-03         | 5.7, 7.5 `unlock`                    | `TEST-AUTH-05`, `AUTH-AC-04`                  |
| RF-04         | 9.6, 10                              | `UI-AC-01`                                    |
| RF-05         | 6.4, 7.5 `create_capsule`            | `TEST-CAP-03..07`, `CAP-AC-01..05`            |
| RF-06         | 5.5                                  | `TEST-CRYPTO-06`                              |
| RF-07         | 5.5                                  | `TEST-CRYPTO-03`                              |
| RF-08         | 5.5                                  | `TEST-CRYPTO-03`                              |
| RF-09         | 5.5, 6.2                             | `SEC-AC-01`                                   |
| RF-10         | 5.8                                  | `SEC-AC-06`                                   |
| RF-11         | 6.4                                  | `CAP-AC-01`                                   |
| RF-12         | 6.4, 9.5                             | `CAP-AC-06`                                   |
| RF-13         | 7.3, 7.5 `list_capsules`             | `CAP-AC-06`                                   |
| RF-14         | 7.5 `delete_capsule`, 8.7            | `CAP-AC-07`                                   |
| RF-15         | 4.5, 7.5 `reveal_due`                | `REV-AC-01`                                   |
| RF-16         | 7.5 `read_capsule`                   | `REV-AC-06`                                   |
| RF-17         | 7.5 `read_capsule`                   | `TEST-REV-03`, `REV-AC-04`                    |
| RF-18         | 5.8, 8.5, 9.2                        | `UI-AC-06`                                    |
| RF-19         | 7.5 `reveal_due`, 7.8                | `REV-AC-01`, `QA-NOTIF-01`                    |
| RF-20         | 7.8                                  | `QA-NOTIF-01`                                 |
| RF-21         | 2.2, 7.5 `reveal_due`                | `QA-NOTIF-02`                                 |
| RF-22         | 7.5 `archive_capsule`                | `ARC-AC-01`                                   |
| RF-23         | 7.5 `list_capsules`                  | `ARC-AC-04`                                   |
| RF-24         | 7.5 `delete_capsule`                 | `ARC-AC-05`                                   |

### 13.2 PRD → CA

| Critério | Cenário deste SPEC            |
| -------- | ----------------------------- |
| CA-01    | `SEC-AC-01`                   |
| CA-02    | `REV-AC-04`, `REV-AC-05`      |
| CA-03    | `REV-AC-01`, `QA-NOTIF-01/02` |
| CA-04    | `ARC-AC-01`                   |
| CA-05    | `TEST-CAP-08`, `CAP-AC-07`    |
| CA-06    | `SEC-AC-03`, `AUTH-AC-04`     |

---

## 14. Requisitos não funcionais técnicos

| ID       | Requisito                                                                                               |
| -------- | ------------------------------------------------------------------------------------------------------- |
| `NFR-08` | Criptografia/descriptografia de até 100 KB MUST concluir em < 500 ms em máquina de referência.          |
| `NFR-09` | `unlock` SHOULD concluir em < 1 s com os parâmetros padrão; medir no setup e registrar em log de debug. |
| `NFR-10` | A UI MUST permanecer responsiva durante Argon2id (execução em thread bloqueante).                       |
| `NFR-11` | O app MUST funcionar 100% offline.                                                                      |
| `NFR-12` | O app MUST NOT realizar conexões de rede.                                                               |
| `NFR-13` | O banco MUST ser um único arquivo após fechamento limpo.                                                |
| `NFR-14` | O app MUST iniciar em < 3 s em SSD com banco de até 100 cápsulas.                                       |
| `NFR-15` | O instalador MUST ser NSIS x64 e não exigir privilégios administrativos.                                |
| `NFR-16` | Toda string visível ao usuário MUST estar em PT-BR.                                                     |

---

## 15. Operação

### 15.1 Comandos

| Ação                  | Comando                                                            |
| --------------------- | ------------------------------------------------------------------ |
| Instalar dependências | `pnpm install`                                                     |
| Dev                   | `pnpm tauri dev`                                                   |
| Testes Rust           | `cargo test --manifest-path src-tauri/Cargo.toml`                  |
| Testes frontend       | `pnpm test`                                                        |
| Lint                  | `pnpm lint`                                                        |
| Typecheck             | `pnpm typecheck`                                                   |
| Build                 | `pnpm tauri build`                                                 |
| Formatar Rust         | `cargo fmt --manifest-path src-tauri/Cargo.toml`                   |
| Clippy                | `cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings` |

### 15.2 Dados

- **Banco:** `%APPDATA%\com.capsuladotempo.app\time-lock.db`.
- **Backup:** fechar o app e copiar o arquivo.
- **Restore:** fechar o app e substituir o arquivo.
- **Reset:** fechar o app e apagar o arquivo (perda irreversível).

### 15.3 Troubleshooting

| Sintoma                           | Causa provável                           | Ação                                                      |
| --------------------------------- | ---------------------------------------- | --------------------------------------------------------- |
| Notificação não aparece em dev    | Falta de AppUserModelId/permissão        | Testar no build instalado; verificar permissão no Windows |
| `CRYPTO_ERROR` no login           | Config corrompida ou versão desconhecida | Restaurar backup; dados não recuperáveis sem a config     |
| App não abre                      | Instância duplicada                      | Single-instance foca a janela existente                   |
| Banco bloqueado                   | Outro processo usando o arquivo          | Fechar todas as instâncias                                |
| Instalador bloqueado pelo Windows | Binário não assinado                     | Aceitar o aviso (assinatura fora do MVP)                  |

### 15.4 Versão

- **NFR-17**: versão inicial `0.1.0`.
- **NFR-18**: toda mudança incompatível de schema ou formato criptográfico MUST incrementar `user_version` e/ou `crypto_format_version`.

---

## 16. Limitações conhecidas

1. **Time-lock application-enforced**: a proteção temporal é garantida pelo backend, não por criptografia de tempo.
2. **Relógio manipulável**: adiantar o relógio revela cápsulas antecipadamente.
3. **Brute-force offline**: o arquivo do banco permite tentativa offline; Argon2id e senha forte são as defesas.
4. **Metadados em claro**: título, datas e status são legíveis no banco.
5. **Sem notificação com app fechado**: o MVP verifica na abertura e enquanto estiver aberto.
6. **Sem recuperação de senha**: esquecimento implica perda permanente.
7. **Sem auto-lock**: apenas bloqueio manual; fechar o app encerra a sessão.
8. **Sem assinatura de código**: aviso do Windows no instalador.
9. **Memória do frontend**: JavaScript não permite zeroização garantida; o conteúdo é removido do cache, mas o GC decide quando liberar.
10. **Backoff volátil**: reiniciar o app zera o contador (não afeta brute-force offline).
11. **Sem E2E automatizado**: cobertura de UI por Vitest/RTL + QA manual.
12. **Sem export/import**: backup é cópia do arquivo do banco.

---

## 17. Riscos técnicos

| Risco                                | Prob. | Impacto | Mitigação                                                       |
| ------------------------------------ | ----- | ------- | --------------------------------------------------------------- |
| Notificação falhar em dev no Windows | Média | Médio   | Spike na Sessão 5; validar no build instalado; banner in-app    |
| Argon2id lento em hardware fraco     | Média | Médio   | Medir no setup; parâmetros versionados permitem ajuste/migração |
| Corrupção do SQLite                  | Baixa | Alto    | `synchronous=FULL`, instância única, backup documentado         |
| `VACUUM` custoso                     | Baixa | Baixo   | Banco pequeno; executar somente após delete                     |
| Vazamento de plaintext em memória    | Baixa | Médio   | `zeroize`, ausência de cache, sem persistência                  |
| Regressão silenciosa de schema       | Média | Alto    | Migrações versionadas + testes de integração                    |
| AAD/versionamento incorreto          | Baixa | Alto    | Testes de tamper e troca de BLOBs                               |
| Bundle do zxcvbn grande              | Baixa | Baixo   | Aceitável em desktop; avaliar lazy load                         |
| CSP bloquear recurso legítimo        | Baixa | Médio   | Testar no build; ajustar apenas o mínimo necessário             |

---

## 18. Definição de pronto (MVP)

- [ ] Todos os comandos da Seção 7.4 implementados conforme contratos.
- [ ] Migração v1 aplicada e testada.
- [ ] Modelo de key-check implementado sem hash de senha persistido.
- [ ] Setup, login, backoff, bloqueio e guardas de rota funcionando.
- [ ] Criar, listar, deletar, revelar, ler e arquivar funcionando.
- [ ] Poll de 60 s + revelação no startup + notificação e fallback.
- [ ] Nenhum segredo em logs, erros, storage ou URL.
- [ ] Todos os cenários `*-AC-*` validados (automatizados ou QA manual).
- [ ] `cargo fmt`, `clippy -D warnings`, `cargo test`, `pnpm lint`, `typecheck`, `test` verdes.
- [ ] Instalador NSIS gerado e instalável sem admin.
- [ ] README com setup, comandos, backup, reset e limitações.
- [ ] PRD atualizado com o modelo de key-check e decisões operacionais.
- [ ] ADRs 0001–0003 criados.

---

## 19. Decisões registradas

| Tema                 | Decisão                                      |
| -------------------- | -------------------------------------------- |
| Verificação de senha | Key-check AES-256-GCM (sem hash persistido)  |
| Corpo máximo         | 1 MB (1.048.576 bytes UTF-8)                 |
| Título               | Opcional, ≤ 80 caracteres, texto claro       |
| Senha                | ≥ 12 caracteres + zxcvbn ≥ 3 na UI           |
| Bloqueio de sessão   | Botão manual; auto-lock fora do MVP          |
| Datas                | UTC RFC3339 no banco; local na UI            |
| Poll de revelação    | Startup + 60 s                               |
| Notificação          | Ao revelar, com fallback in-app              |
| Instalador           | NSIS x64, `currentUser`                      |
| Instância            | Única                                        |
| E2E                  | Manual no MVP                                |
| Banco                | SQLite, arquivo único, `journal_mode=DELETE` |
| Delete               | Físico + `secure_delete` + `VACUUM`          |
| ID                   | UUID v4                                      |
| AAD                  | `capsule:<id>:v1`                            |
| Idioma               | UI e documentação em PT-BR                   |
