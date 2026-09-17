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
| `npm run dev` | Executa `src/server.ts` direto pelo Node, com reload automático |
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

## Sensores simulados

Todos os sensores são **quantitativos**: `valor` é sempre numérico, então a média de um sensor é sempre uma média aritmética simples. Presença foi modelada como *intensidade* (0 = ambiente vazio, 100 = movimento intenso) justamente para que a média continue fazendo sentido.

| Tipo | Unidade | Faixa | Intervalo | Dinâmica simulada |
| --- | --- | --- | --- | --- |
| `luz` | lux | 0–2000 | 1000 ms | ciclo dia/noite |
| `umidade` | % | 20–95 | 2000 ms | caminhada aleatória com reversão à média |
| `presenca` | % | 0–100 | 500 ms | rajadas intermitentes de movimento |
| `pressao` | hPa | 950–1050 | 5000 ms | deriva lenta em torno de 1013,25 |
| `ultrassonico` | cm | 20–400 | 250 ms | distância de repouso com obstáculo ocasional |
| `temperatura` | °C | 10–40 | 2000 ms | caminhada aleatória + ciclo térmico |

```ts
import { criarSensores } from './sensors/index.ts';

const sensores = criarSensores({ seed: 42 });

for (const sensor of sensores) {
    console.log(sensor.ler(new Date()));
}
```

A `seed` é fixa por padrão (42) para que a simulação seja reproduzível. Passe `seed: Date.now()` para variar a cada execução.

Adicionar um sensor novo é: uma entrada em `PERFIS_SENSORES`, uma classe que estenda `SensorBase` e uma linha em `criarSensores()`. Nenhum consumidor das leituras precisa mudar.

> Nos imports o caminho termina em `.ts` (ex.: `./sensors/index.ts`). O Node exige a extensão real do arquivo, e o `tsc` reescreve para `.js` na compilação — por isso o mesmo fonte funciona em `npm run dev` e em `npm start`.

## Estrutura

- `src/server.ts` — servidor TCP de exemplo
- `src/sensors/` — contrato e implementação dos sensores simulados
  - `sensor.ts` — interface `Sensor`, envelope `LeituraSensor` e tipos
  - `catalog.ts` — catálogo com unidade, faixa e intervalo de cada tipo
  - `base-sensor.ts` — comportamento comum (sequência, arredondamento, faixa)
  - `random.ts` — PRNG determinístico
  - `luz.ts`, `umidade.ts`, `presenca.ts`, `pressao.ts`, `ultrassonico.ts`, `temperatura.ts` — as classes
  - `index.ts` — reexporta o módulo e expõe `criarSensores()`
- `tsconfig.json` — configuração do TypeScript
- `dist/` — saída da compilação (gerada, não versionada)

