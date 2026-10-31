# PRD — Cápsula do Tempo
**Versão:** 1.0  
**Data:** Outubro de 2026  
**Status:** Rascunho  

---

## 1. Visão Geral

**Cápsula do Tempo** é uma aplicação desktop/web para Windows que permite ao usuário escrever mensagens para si mesmo no futuro. Cada mensagem é criptografada e permanece completamente ilegível — inclusive no banco de dados — até a data de revelação definida no momento da criação. Ao chegar a data, o usuário recebe uma notificação local e pode ler a mensagem quantas vezes quiser.

---

## 2. Objetivos

| Objetivo | Métrica de Sucesso |
|---|---|
| Garantir privacidade total do conteúdo até a data definida | Conteúdo cifrado no BD; impossível de ler sem a chave correta e sem passar pela data |
| Experiência de revelação emocionalmente significativa | Notificação local disparada; seção "Reveladas" de fácil acesso |
| Servir como projeto de estudo sólido em Tauri + React + TS | Código bem estruturado, com separação clara de responsabilidades |

---

## 3. Público-Alvo

Usuário único (single-user), pessoal. Não há cadastro ou conta externa. O próprio usuário é o dono, escritor e leitor das cápsulas.

---

## 4. User Stories

### 4.1 Autenticação
- **US-01** — Como usuário, quero criar uma senha mestra no primeiro uso para proteger o acesso ao app.
- **US-02** — Como usuário, quero inserir minha senha mestra a cada abertura do app para garantir que ninguém mais acesse minhas cápsulas.

### 4.2 Criação de Cápsula
- **US-03** — Como usuário, quero escrever uma mensagem de texto livre e definir uma data futura de revelação.
- **US-04** — Como usuário, quero ter confirmação visual de que a cápsula foi salva e está "selada".
- **US-05** — Como usuário, quero que minha mensagem seja imutável após salva, para preservar a autenticidade do momento.

### 4.3 Listagem e Gerenciamento
- **US-06** — Como usuário, quero ver a lista de cápsulas seladas com título (se houver) e data de revelação, mas sem acesso ao conteúdo.
- **US-07** — Como usuário, quero poder deletar uma cápsula selada se desistir dela, com confirmação da ação.

### 4.4 Revelação
- **US-08** — Como usuário, quero receber uma notificação local quando chegar a data de uma cápsula enquanto o app estiver aberto, ou na próxima abertura.
- **US-09** — Como usuário, quero ler o conteúdo de uma cápsula revelada na seção "Reveladas".
- **US-10** — Como usuário, quero poder reler uma cápsula revelada quantas vezes quiser.

### 4.5 Arquivamento
- **US-11** — Como usuário, quero arquivar manualmente uma cápsula já revelada para mantê-la organizada.
- **US-12** — Como usuário, quero acessar a seção "Arquivadas" para reler cápsulas antigas.
- **US-13** — Como usuário, quero deletar manualmente uma cápsula arquivada quando não quiser mais guardá-la.

---

## 5. Requisitos Funcionais

### 5.1 Autenticação e Configuração Inicial

| ID | Requisito |
|---|---|
| RF-01 | No primeiro uso, o app exibe uma tela de setup para criação da senha mestra. |
| RF-02 | A senha mestra nunca é armazenada. A chave mestra (Master Key) é derivada via **Argon2id** e validada por um **key-check** AES-256-GCM; nenhum hash da senha é persistido. |
| RF-03 | Nas aberturas seguintes, o app exibe a tela de login. Tentativas incorretas incrementam um delay progressivo (ex.: 1s, 2s, 4s...). |
| RF-04 | Não há recuperação de senha. Se o usuário esquecer a senha mestra, os dados são irrecuperáveis (comportamento documentado na UI). |

### 5.2 Criação de Cápsula

| ID | Requisito |
|---|---|
| RF-05 | O formulário de criação exige: título opcional (máx. 80 chars), corpo da mensagem (obrigatório, entre 1 byte e 1.048.576 bytes UTF-8), data de revelação (obrigatório, deve ser data futura). |
| RF-06 | Ao salvar, o backend (Rust/Tauri) gera uma **Content Key** aleatória de 256 bits. |
| RF-07 | O conteúdo é cifrado com a Content Key usando **AES-256-GCM**. |
| RF-08 | A Content Key é cifrada com a **Master Key** (derivada da senha mestra via Argon2id). |
| RF-09 | Apenas o conteúdo cifrado e a Content Key cifrada são persistidos no BD. A Content Key em texto claro nunca toca o disco. |
| RF-10 | Após o save, o conteúdo original é descartado da memória. |
| RF-11 | O título (se fornecido) é armazenado em **texto claro** — é apenas um rótulo organizacional, não informação sensível. |

### 5.3 Listagem de Cápsulas Seladas

| ID | Requisito |
|---|---|
| RF-12 | A tela principal exibe cápsulas com status `sealed`: título (ou "Sem título"), data de revelação e um indicador visual de "lacrada". |
| RF-13 | O conteúdo criptografado não é exibido nem parcialmente nesta tela. |
| RF-14 | O usuário pode deletar uma cápsula selada após confirmação (modal com aviso de irreversibilidade). |

### 5.4 Revelação

| ID | Requisito |
|---|---|
| RF-15 | Ao abrir o app, o sistema verifica se alguma cápsula com `reveal_date <= now` ainda está com status `sealed` e as transiciona para `revealed`. |
| RF-16 | A descriptografia ocorre sob demanda: quando o usuário abre uma cápsula revelada, o backend decifra o conteúdo usando a Master Key (ativa na sessão) e a Content Key cifrada armazenada. |
| RF-17 | A descriptografia é bloqueada se `reveal_date > now`, mesmo que o usuário tente forçar via API interna. |
| RF-18 | O conteúdo decifrado é retornado apenas para a memória do frontend e nunca re-persistido em texto claro. |

### 5.5 Notificações

| ID | Requisito |
|---|---|
| RF-19 | Ao detectar novas cápsulas reveladas (RF-15), o app dispara uma notificação local do sistema operacional. |
| RF-20 | Formato da notificação: título "📬 Cápsula do Tempo" e corpo "Você tem 1 cápsula pronta para abrir!" ou "Você tem N cápsulas prontas para abrir!". |
| RF-21 | Se o app estiver fechado, a notificação é disparada na próxima abertura. *(Notificação em background nativo está fora do MVP — ver Seção 12.)* |

### 5.6 Arquivamento

| ID | Requisito |
|---|---|
| RF-22 | O usuário pode mover uma cápsula revelada para `archived` manualmente. |
| RF-23 | A seção "Arquivadas" lista todas as cápsulas com status `archived`, legíveis sob demanda. |
| RF-24 | Cápsulas arquivadas podem ser deletadas manualmente com confirmação. |

---

## 6. Requisitos Não-Funcionais

| ID | Requisito |
|---|---|
| RNF-01 | **Segurança:** O banco de dados não deve conter nenhuma informação legível sobre o conteúdo das cápsulas. Qualquer dump do BD deve ser inútil sem a senha mestra. |
| RNF-02 | **Desempenho:** Operações de criptografia e descriptografia devem completar em menos de 500ms para mensagens de até 100KB. |
| RNF-03 | **Offline-first:** A aplicação funciona inteiramente sem conexão à internet. |
| RNF-04 | **Persistência local:** Todos os dados ficam no dispositivo do usuário. Nenhuma telemetria ou sincronização em nuvem no MVP. |
| RNF-05 | **Portabilidade do banco:** O arquivo do banco pode ser copiado/movido manualmente entre dispositivos (backup manual documentado). |

---

## 7. Arquitetura Técnica

### 7.1 Stack

| Camada | Tecnologia | Justificativa |
|---|---|---|
| Frontend | React + TypeScript | UI declarativa, tipagem forte |
| Desktop Shell | Tauri (Rust) | Leve, seguro, acesso nativo ao SO |
| Banco de Dados | **SQLite** | Gratuito, local, sem servidor, excelente suporte no ecossistema Rust (`rusqlite`) |
| Criptografia | AES-256-GCM + Argon2id (Rust crates) | Padrão moderno, autenticado, resistente a ataques de força bruta |
| Notificações | `tauri-plugin-notification` | Integração nativa com o SO |

### 7.2 Por que SQLite?

Para um projeto de estudo single-user offline-first, SQLite é a escolha ideal:
- Zero configuração, zero servidor
- Arquivo único portável
- Performance excelente para volumes pequenos/médios
- Crates Rust maduras: `rusqlite`, `diesel` (com feature sqlite), `sqlx`

### 7.3 Crates Rust Recomendadas

```
aes-gcm         # Criptografia AES-256-GCM
argon2          # Derivação de chave da senha mestra
rusqlite        # Acesso ao SQLite
rand            # Geração de chaves e IVs aleatórios
zeroize         # Limpeza segura de secrets da memória
tauri-plugin-notification  # Notificações locais
```

### 7.4 Modelo de Segurança

```
Senha Mestra
    │
    ▼ Argon2id (salt único por instalação)
Master Key (256 bits) — só em memória durante a sessão
    │
    ├──► decifra ──► Content Key (256 bits) — só em memória durante leitura
    │                        │
    │                        ▼ AES-256-GCM
    │                  Conteúdo plaintext — só em memória, nunca no disco
    │
    └──[BD]─► encrypted_content_key (BLOB)
              encrypted_content (BLOB)
              iv_content, iv_key (BLOB)
              reveal_date (plaintext — não é dado sensível)
              title (plaintext — não é dado sensível)
```

> **Trade-off documentado:** O modelo é *application-enforced*, não *cryptographic time-lock* puro. A proteção temporal é garantida pela lógica da aplicação (RF-17). Para um time-lock criptográfico absoluto, seria necessário um servidor externo ou time-lock puzzles — fora do escopo deste projeto de estudo.

---

## 8. Modelo de Dados

### Tabela: `capsules`

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | TEXT (UUID) PK | Identificador único |
| `title` | TEXT | Título opcional em texto claro |
| `encrypted_content` | BLOB | Conteúdo cifrado com AES-256-GCM |
| `iv_content` | BLOB | Initialization Vector do conteúdo (12 bytes) |
| `encrypted_content_key` | BLOB | Content Key cifrada com Master Key |
| `iv_key` | BLOB | IV usado para cifrar a Content Key |
| `reveal_date` | TEXT (ISO 8601) | Data/hora de revelação |
| `status` | TEXT | `sealed` / `revealed` / `archived` |
| `revealed_at` | TEXT nullable | Quando a cápsula foi revelada |
| `archived_at` | TEXT nullable | Quando foi arquivada |
| `created_at` | TEXT | Timestamp de criação |

### Tabela: `app_config`

| Coluna | Tipo | Descrição |
|---|---|---|
| `key` | TEXT PK | Nome da configuração |
| `value` | TEXT | Valor armazenado |

Entradas esperadas:
- `setup_completed` — flag booleano
- `kdf_version` — versão do algoritmo de derivação
- `argon2_salt_b64` — salt único por instalação (Base64)
- `argon2_m_kib`, `argon2_t`, `argon2_p` — parâmetros do Argon2id
- `crypto_format_version` — versão do formato criptográfico
- `key_check_b64` — ciphertext + tag do key-check (Base64)
- `key_check_iv_b64` — IV do key-check (Base64)

---

## 9. Fluxos Principais

### Fluxo 1 — Primeiro Uso

```
Abrir app → Tela de Setup
→ Usuário define senha mestra
→ Sistema gera salt único
→ Argon2id(senha + salt) → Master Key (apenas memória)
→ Gera key-check AES-256-GCM e persiste salt, parâmetros e key-check
→ Redireciona para Home (vazia)
```

### Fluxo 2 — Login

```
Abrir app → Tela de Login
→ Usuário digita senha
→ Argon2id(senha + salt armazenado) → Master Key
→ Valida key-check com AES-256-GCM
→ [OK] → Master Key em memória → Home
→ [FALHA] → Delay progressivo + mensagem de erro
```

### Fluxo 3 — Criar Cápsula

```
Home → "Nova Cápsula"
→ Preenche título (opc.), mensagem, data
→ [Salvar]
→ Tauri backend:
   1. rand::generate() → Content Key (256 bits) + IV_content + IV_key
   2. AES-256-GCM(Content Key, IV_content, mensagem) → encrypted_content
   3. AES-256-GCM(Master Key, IV_key, Content Key) → encrypted_content_key
   4. zeroize(Content Key, mensagem)
   5. INSERT no SQLite
→ Frontend: exibe confirmação + retorna à Home
```

### Fluxo 4 — Revelação

```
Abrir app → Login → Backend verifica imediatamente:
   SELECT * FROM capsules WHERE status='sealed' AND reveal_date <= now()
→ UPDATE status='revealed', revealed_at=now()
→ Se houver atualizações → dispara notificação local e evento
→ Enquanto o app estiver aberto, repete a verificação a cada 60 s
→ Home exibe badge na seção "Reveladas"
```

### Fluxo 5 — Ler Cápsula Revelada

```
Seção "Reveladas" → Seleciona cápsula
→ Backend:
   1. Verifica reveal_date <= now() [RF-17]
   2. AES-256-GCM-Decrypt(Master Key, IV_key, encrypted_content_key) → Content Key
   3. AES-256-GCM-Decrypt(Content Key, IV_content, encrypted_content) → plaintext
   4. zeroize(Content Key)
   5. Retorna plaintext ao frontend
→ Frontend exibe conteúdo
→ [Fechar] → plaintext descartado da memória
```

---

## 10. Telas (Escopo MVP)

| Tela | Descrição |
|---|---|
| **Setup** | Criação da senha mestra no primeiro uso |
| **Login** | Entrada da senha mestra |
| **Home / Seladas** | Lista de cápsulas seladas (título + data) |
| **Nova Cápsula** | Formulário de criação |
| **Reveladas** | Lista de cápsulas com data passada, legíveis |
| **Detalhe da Cápsula** | Leitura do conteúdo de uma cápsula revelada ou arquivada |
| **Arquivadas** | Lista de cápsulas arquivadas manualmente |

---

## 11. Critérios de Aceite

| ID | Critério |
|---|---|
| CA-01 | Um dump do arquivo SQLite não revela nenhuma parte do conteúdo de nenhuma cápsula. |
| CA-02 | Uma cápsula com `reveal_date` no futuro não pode ser lida por nenhuma rota do backend. |
| CA-03 | Ao abrir o app após a data de revelação, a notificação é exibida antes de qualquer interação. |
| CA-04 | Após arquivar, a cápsula aparece apenas na seção "Arquivadas". |
| CA-05 | Deletar uma cápsula remove permanentemente todos os BLOBs associados do BD. |
| CA-06 | Inserir senha errada no login nunca concede acesso. |

---

## 12. Fora do Escopo (MVP)

- Notificações em background (quando app está completamente fechado) — requer serviço de sistema
- Sincronização em nuvem ou backup automático
- Suporte a mídia (imagens, áudio) nas cápsulas
- Múltiplos usuários / perfis
- Recuperação de senha
- Exportação/importação de cápsulas
- Modo escuro / temas visuais
- Criptographic time-lock puro (sem enforcement de servidor)

---

## 13. Riscos e Mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Usuário esquece a senha mestra | Alta | Alto (dados irrecuperáveis) | Aviso claro na tela de setup; sugestão de anotação segura |
| Corrupção do arquivo SQLite | Baixa | Alto | Documentar processo de backup manual |
| Data do sistema manipulada para "avançar no tempo" | Média | Médio | Aceitável para MVP; documentado como limitação do modelo application-enforced |
| Memory leak do conteúdo decifrado | Baixa | Médio | Uso do crate `zeroize` para limpar buffers sensíveis |

---

## 14. Roadmap

### Fase 1 — MVP ✅ *(escopo deste documento)*
- Autenticação com senha mestra
- CRUD de cápsulas (criar + deletar)
- Criptografia AES-256-GCM
- Revelação automática por data
- Notificação local ao abrir o app
- Seções: Seladas / Reveladas / Arquivadas

### Fase 2 — Pós-MVP (futuro)
- Notificações em background via serviço Tauri
- Backup/exportação criptografada
- Suporte a imagens nas cápsulas
- Tema visual / customização

---
