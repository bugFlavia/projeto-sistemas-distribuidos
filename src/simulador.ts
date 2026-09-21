import * as net from 'node:net';
import { parseArgs } from 'node:util';

import { registrar, registrarErro } from './comum/log.ts';
import { analisarEndereco, codificarLinha } from './comum/protocolo.ts';
import { PERFIS_SENSORES, SEED_PADRAO, criarSensor } from './sensors/index.ts';
import type { Endereco } from './comum/protocolo.ts';
import type { TipoSensor } from './sensors/index.ts';

/**
 * Simulador de um sensor físico.
 *
 * Cada processo representa exatamente um sensor. Subir ou derrubar um sensor é
 * subir ou derrubar um processo — falha parcial de verdade, e não um `if` no
 * meio do código. É por isso que a identidade vem dos argumentos e não de uma
 * lista fixa: o mesmo binário serve para qualquer sensor.
 */

const ESC = 'simulador';
const INTERVALO_DE_RECONEXAO_MS = 1000;
const EDGE_PADRAO = '127.0.0.1:4000';
const PORTA_PADRAO_DO_EDGE = 4000;

const TIPOS = Object.keys(PERFIS_SENSORES) as TipoSensor[];

function ehTipoSensor(valor: string): valor is TipoSensor {
    return (TIPOS as readonly string[]).includes(valor);
}

function uso(): string {
    return [
        'Uso: npm run simulador -- --sensor <tipo> [opções]',
        '',
        `  --sensor <tipo>    obrigatório; um de: ${TIPOS.join(', ')}`,
        '  --id <texto>       identidade do sensor (padrão: <tipo>-01)',
        '  --seed <número>    semente do gerador (padrão: 42)',
        `  --edge <endereço>  destino host:porta (padrão: ${EDGE_PADRAO})`,
        '  -h, --ajuda        mostra esta mensagem',
        '',
        'Variável de ambiente: EDGE_ADDR substitui o padrão de --edge.',
    ].join('\n');
}

function analisarArgumentos(): {
    sensor?: string;
    id?: string;
    seed?: string;
    edge?: string;
    ajuda?: boolean;
} {
    try {
        return parseArgs({
            options: {
                sensor: { type: 'string' },
                id: { type: 'string' },
                seed: { type: 'string' },
                edge: { type: 'string' },
                ajuda: { type: 'boolean', short: 'h' },
            },
        }).values;
    } catch (erro) {
        registrarErro(ESC, erro instanceof Error ? erro.message : String(erro));
        console.error(uso());
        process.exit(1);
    }
}

function iniciar(): void {
    const argumentos = analisarArgumentos();

    if (argumentos.ajuda === true) {
        console.log(uso());
        process.exit(0);
    }

    const tipo = argumentos.sensor;
    if (tipo === undefined) {
        registrarErro(ESC, 'faltou informar --sensor.');
        console.error(uso());
        process.exit(1);
    }

    if (!ehTipoSensor(tipo)) {
        registrarErro(ESC, `tipo de sensor desconhecido: "${tipo}".`);
        console.error(uso());
        process.exit(1);
    }

    const seed = argumentos.seed === undefined ? SEED_PADRAO : Number.parseInt(argumentos.seed, 10);
    if (!Number.isInteger(seed)) {
        registrarErro(ESC, `--seed precisa ser um número inteiro, recebido: "${argumentos.seed}".`);
        process.exit(1);
    }

    const endereco: Endereco = analisarEndereco(
        argumentos.edge ?? process.env['EDGE_ADDR'] ?? EDGE_PADRAO,
        PORTA_PADRAO_DO_EDGE,
    );

    const sensor = criarSensor(tipo, argumentos.id ?? `${tipo}-01`, seed);
    const rotulo = sensor.id;

    let socket: net.Socket | undefined;
    let conectado = false;
    let encerrando = false;
    let reconexao: NodeJS.Timeout | undefined;
    let descartadas = 0;

    function conectar(): void {
        if (encerrando) {
            return;
        }

        const novaConexao = net.createConnection({ host: endereco.host, port: endereco.porta });
        socket = novaConexao;

        novaConexao.on('connect', () => {
            conectado = true;
            registrar(rotulo, `conectado ao edge em ${endereco.host}:${endereco.porta}`);
        });

        novaConexao.on('error', (erro: Error) => {
            registrarErro(rotulo, `falha na conexão com o edge: ${erro.message}`);
        });

        novaConexao.on('close', () => {
            conectado = false;
            socket = undefined;

            if (encerrando) {
                return;
            }

            registrar(rotulo, `desconectado; nova tentativa em ${INTERVALO_DE_RECONEXAO_MS} ms`);
            reconexao = setTimeout(conectar, INTERVALO_DE_RECONEXAO_MS);
        });
    }

    const temporizadorDaAmostra = setInterval(() => {
        const leitura = sensor.ler(new Date());

        if (!conectado || socket === undefined) {
            // Semântica at-most-once: sem conexão a leitura é descartada, mas
            // contabilizada. Perder dado em silêncio esconde o problema.
            descartadas += 1;
            if (descartadas % 20 === 1) {
                registrarErro(rotulo, `sem conexão; ${descartadas} leitura(s) descartada(s)`);
            }
            return;
        }

        socket.write(codificarLinha(leitura));
        registrar(rotulo, `${leitura.valor} ${leitura.unidade} (seq ${leitura.sequencia})`);
    }, sensor.intervaloMs);

    function encerrar(sinal: NodeJS.Signals): void {
        if (encerrando) {
            return;
        }
        encerrando = true;

        clearInterval(temporizadorDaAmostra);
        if (reconexao !== undefined) {
            clearTimeout(reconexao);
        }

        registrar(
            rotulo,
            `recebido ${sinal}, encerrando (${descartadas} leitura(s) descartada(s))`,
        );

        if (socket === undefined) {
            // Nada pendente: o processo termina sozinho.
        } else if (conectado) {
            // Encerra de forma educada, deixando o que está no buffer sair.
            socket.end();
        } else {
            socket.destroy();
        }
    }

    for (const sinal of ['SIGINT', 'SIGTERM'] as const) {
        process.on(sinal, () => encerrar(sinal));
    }

    registrar(
        rotulo,
        `iniciando sensor ${sensor.tipo} (unidade ${sensor.unidade}, intervalo ${sensor.intervaloMs} ms, seed ${seed})`,
    );

    conectar();
}

try {
    iniciar();
} catch (erro) {
    registrarErro(ESC, erro instanceof Error ? erro.message : String(erro));
    process.exit(1);
}
