# ADR 0002 — Modelo criptográfico com key-check

- **Status:** Aceito
- **Data:** Outubro de 2026

## Contexto

O PRD original afirmava que apenas o hash Argon2id da senha seria persistido, mas também exigia a
Master Key em memória para cifrar e decifrar cápsulas. Um hash é irreversível e não permite obter a
chave; portanto, o modelo era inconsistente.

Persistir um hash ou um key-check oferece a mesma resistência a brute-force offline: a defesa real
é a entropia da senha combinada com parâmetros fortes de Argon2id.

## Decisão

- Derivar a **Master Key** de 32 bytes com Argon2id (`m=64 MiB`, `t=3`, `p=1`, salt de 16 bytes).
- Persistir um **key-check**: `AES-256-GCM(MK, sentinela fixa)` com IV aleatório e AAD versionada.
- No login, derivar a MK e decifrar o key-check; falha de autenticação = senha incorreta.
- A senha e a MK nunca são persistidas.
- Cada cápsula usa uma **Content Key** aleatória de 32 bytes, cifrada pela MK.
- Conteúdo e Content Key usam AES-256-GCM com AAD `capsule:<id>:<versão>`.
- Segredos em memória são zeroizados com `zeroize`.

## Consequências

- Um único KDF no login; validação de senha e integridade da configuração na mesma operação.
- O arquivo do banco continua vulnerável a brute-force offline; a política de senha é essencial.
- Parâmetros do KDF e versão do formato ficam em `app_config` para permitir migração futura.
- O backoff de login protege apenas o app aberto, não o arquivo copiado.
