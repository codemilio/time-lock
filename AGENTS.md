# AGENTS.md

## Comandos

```bash
pnpm install
pnpm tauri dev
pnpm lint
pnpm typecheck
pnpm test
pnpm build
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
```

## Convenções

- Rust não está no PATH por padrão nesta máquina; use `$env:USERPROFILE\.cargo\bin`.
- Toda criptografia e acesso ao SQLite ficam no backend Rust. O frontend nunca recebe chaves.
- Siga o `docs/spec.md` como fonte de verdade técnica e o `docs/PRD.md` para comportamento.
- Nunca registre senha, Master Key, Content Key, plaintext ou key-check em logs.
- Use queries preparadas; nunca interpole SQL.
- Segredos em memória usam `zeroize`.
- Antes de concluir uma tarefa, rode os gates de qualidade da Seção 11.5 do `docs/spec.md`.

## Regras de Git para o Agente

- **Nunca acumule tasks:** Ao concluir cada sub-item do `tasks.md`, faça imediatamente o `git add` dos arquivos tocados e realize um commit atômico.
- Nomes de commits devem seguir Conventional Commits (ex: `feat: ...`, `fix: ...`).
- Marque a task como concluída no `tasks.md` no mesmo commit ou logo em seguida.
