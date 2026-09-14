# projeto-sistemas-distribuidos
Projeto da disciplina de sistemas distribuídos.

Servidor TCP simples escrito em TypeScript com o módulo `node:net`.

## Requisitos

- Node.js >= 20 (recomendado 22+ para executar `.ts` diretamente)

## Instalação

```bash
npm install
```

## Uso

| Comando | Descrição |
| --- | --- |
| `npm run dev` | Executa `server.ts` direto pelo Node, com reload automático |
| `npm run build` | Compila o TypeScript para `dist/` |
| `npm start` | Executa o servidor compilado (`dist/server.js`) |
| `npm run typecheck` | Apenas verifica os tipos, sem gerar arquivos |

O servidor escuta na porta `3000` por padrão. Para trocar, use a variável de ambiente `PORT`:

```bash
PORT=8080 npm run dev
```

## Como testar

Com o servidor rodando, conecte um cliente:

```bash
node -e "const net=require('node:net');const s=net.createConnection(3000,'127.0.0.1',()=>s.write('ola\n'));s.on('data',d=>process.stdout.write(d));"
```

Ou use `telnet`/`nc`:

```bash
nc 127.0.0.1 3000
```

Ao conectar, o servidor responde com o endereço do cliente e registra no console tudo o que for recebido. Encerre com `Ctrl+C` — o servidor faz o shutdown de forma graciosa.

## Estrutura

- `server.ts` — código-fonte do servidor TCP
- `tsconfig.json` — configuração do TypeScript
- `dist/` — saída da compilação (gerada, não versionada)

