# Cápsula do Tempo

Aplicativo desktop offline para escrever mensagens cifradas para o seu eu do futuro. Cada cápsula
fica ilegível até a data de revelação definida, inclusive em uma cópia do banco de dados.

> **Status:** MVP implementado e QA concluído. IPC real, notificações, backup/restauração e clock
> rollback foram validados no app em desenvolvimento; o instalador NSIS `currentUser` foi gerado e
> validado em instalação temporária com dados de aplicativo vazios. Recomenda-se repetir a
> instalação em outro usuário/máquina Windows e assinar o binário para evitar o SmartScreen. A
> implementação segue o [`docs/spec.md`](docs/spec.md) e o [`docs/PRD.md`](docs/PRD.md).

## Stack

- **Tauri 2** + Rust stable (MSVC)
- **React 19** + TypeScript + Vite
- **Tailwind CSS 4**
- **SQLite** via `rusqlite` (bundled)
- **AES-256-GCM** + **Argon2id** (implementação no backend Rust)
- Testes com `cargo test`, Vitest e Testing Library

## Pré-requisitos (Windows)

1. [Rust](https://www.rust-lang.org/tools/install) stable, target `x86_64-pc-windows-msvc`
   (`rustup default stable-msvc`).
2. [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) com a
   carga de trabalho **Desenvolvimento para desktop com C++**.
3. WebView2 (já incluso no Windows 10/11 atualizado).
4. Node.js 22+ e pnpm 9+.

## Desenvolvimento

```bash
pnpm install
pnpm tauri dev
```

## Comandos

| Comando                                                            | Descrição                                    |
| ------------------------------------------------------------------ | -------------------------------------------- |
| `pnpm tauri dev`                                                   | Abre o app em modo desenvolvimento           |
| `pnpm tauri build`                                                 | Gera o instalador NSIS em `src-tauri/target` |
| `pnpm dev`                                                         | Apenas o frontend no Vite                    |
| `pnpm build`                                                       | Typecheck + build do frontend                |
| `pnpm lint`                                                        | ESLint                                       |
| `pnpm typecheck`                                                   | TypeScript strict                            |
| `pnpm test`                                                        | Testes frontend (Vitest)                     |
| `pnpm format`                                                      | Prettier                                     |
| `cargo test --manifest-path src-tauri/Cargo.toml`                  | Testes Rust                                  |
| `cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings` | Clippy                                       |

Antes de concluir uma alteração, rode os gates da Seção 11.5 do SPEC:

```bash
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
pnpm lint
pnpm typecheck
pnpm test
```

No fechamento do MVP, rode também `pnpm tauri build`.

## Build de release

`pnpm tauri build` gera:

- executável: `src-tauri/target/release/time-lock.exe`;
- instalador NSIS `currentUser`: `src-tauri/target/release/bundle/nsis/Cápsula do Tempo_0.1.0_x64-setup.exe`.

A instalação silenciosa em um diretório temporário (`setup.exe /S /D=<diretório>`) e a
desinstalação (`uninstall.exe /S`) foram validadas sem privilégios administrativos. O Windows pode
exibir um aviso do SmartScreen porque o binário não é assinado.

## Fluxo de uso

1. No primeiro uso, crie a senha mestra. Ela não pode ser recuperada.
2. Crie uma cápsula com título opcional, mensagem e data/hora de revelação.
3. A cápsula aparece em **Seladas** com a contagem regressiva.
4. Quando a data chega, o app revela a cápsula automaticamente e tenta notificar.
5. Leia o conteúdo em **Reveladas**, arquive-o ou exclua-o permanentemente.

## Dados, backup e reset

- **Banco:** `%APPDATA%\com.capsuladotempo.app\time-lock.db`.
- **Backup:** feche o app e copie o arquivo `time-lock.db`.
- **Restore:** feche o app e substitua o arquivo pelo backup.
- **Reset:** feche o app e apague `time-lock.db`. A próxima abertura volta ao setup; a perda é
  irreversível sem um backup.
- O banco é autocontido (`journal_mode=DELETE`, `synchronous=FULL`), então não há arquivos
  `-wal`/`-shm` persistentes para copiar.

## Segurança e limitações

- A senha mestra **não é armazenada**. Ela é derivada com Argon2id e validada por um key-check
  AES-256-GCM; se for esquecida, as cápsulas são inacessíveis.
- O conteúdo é cifrado e decifrado no backend Rust. O frontend recebe apenas o texto de uma
  cápsula revelada/arquivada, nunca chaves ou IVs.
- O conteúdo lido é mantido somente no cache em memória e removido ao fechar o detalhe, ao
  bloquear ou ao receber `auth://locked`.
- A proteção temporal é garantida pela aplicação: adiantar o relógio do sistema revela cápsulas.
  Esse risco é aceito e documentado no SPEC.
- Notificações com o app completamente fechado estão fora do MVP. Se a permissão for negada ou o
  envio falhar, o app exibe um banner interno com a contagem de cápsulas reveladas.
- O backoff de login fica em memória e é zerado ao reiniciar o app; ele não impede brute-force
  offline do arquivo do banco.
- Não há exportação/importação de cápsulas: backup é a cópia do arquivo `.db`.
- Não há assinatura de código; o Windows pode exibir um aviso ao abrir o instalador.

## Estrutura

```text
src/                     Frontend React (rotas, componentes, hooks, lib)
src-tauri/               Backend Rust (comandos, crypto, db, services)
src-tauri/src/commands/  Comandos IPC
docs/                    PRD, SPEC, tarefas e ADRs
```

## Documentação

- [PRD](docs/PRD.md)
- [SPEC](docs/spec.md)
- [Tarefas de implementação](docs/TASKS.md)
- [ADR 0001 - Stack](docs/adr/0001-stack-tauri-react-rust.md)
- [ADR 0002 - Modelo criptográfico](docs/adr/0002-modelo-criptografico-keycheck.md)
- [ADR 0003 - SQLite](docs/adr/0003-sqlite-migracoes-e-backup.md)
