import * as net from 'node:net';
import { parseArgs } from 'node:util';

import { registrar, registrarErro } from './comum/log.ts';
import { analisarEndereco, codificarLinha, criarLeitorDeLinhas } from './comum/protocolo.ts';
import { VERSAO_SCHEMA, ehLeituraSensor, ehResultadoMedia } from './sensors/index.ts';
import type { Endereco } from './comum/protocolo.ts';
import type { ResultadoMedia } from './sensors/index.ts';

let ESC = 'edge';

const INTERVALO_DE_RECONEXAO_MS = 1000;
const INTERVALO_DO_STATUS_MS = 10_000;
const PORTA_PADRAO_DE_ESCUTA = 4000;
const SERVICO_PADRAO = '127.0.0.1:5000';
const PORTA_PADRAO_DO_SERVICO = 5000;

function uso(): string {
    return [
        'Uso: npm run edge -- [--id <texto>] [--porta <número>]',
        '',
        '  --id <texto>       nome deste gateway nos logs (padrão: edge:<porta>)',
        `  --porta <número>   porta em que escuta (padrão: ${PORTA_PADRAO_DE_ESCUTA})`,
        '  -h, --ajuda        mostra esta mensagem',
        '',
        'Variáveis de ambiente: EDGE_PORT substitui --porta e SERVICO_ADDR define',
        `o serviço de destino (padrão: ${SERVICO_PADRAO}).`,
    ].join('\n');
}

function analisarArgumentos(): { id?: string; porta?: string; ajuda?: boolean } {
    try {
        return parseArgs({
            options: {
                id: { type: 'string' },
                porta: { type: 'string' },
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

    const portaTexto =
        argumentos.porta ?? process.env['EDGE_PORT'] ?? String(PORTA_PADRAO_DE_ESCUTA);
    const porta = Number(portaTexto);
    if (!Number.isInteger(porta) || porta < 1 || porta > 65535) {
        throw new Error(`porta inválida: "${portaTexto}".`);
    }

    ESC = argumentos.id ?? `edge:${porta}`;

    const enderecoDoServico: Endereco = analisarEndereco(
        process.env['SERVICO_ADDR'] ?? SERVICO_PADRAO,
        PORTA_PADRAO_DO_SERVICO,
    );

    let servico: net.Socket | undefined;
    let conectadoAoServico = false;
    let encerrando = false;
    let reconexao: NodeJS.Timeout | undefined;

    let encaminhadas = 0;
    let perdidas = 0;
    let invalidas = 0;
    const sensoresVistos = new Set<string>();
    const conexoes = new Set<net.Socket>();
    /** Última média conhecida de cada sensor. É o que este nó exibe. */
    const mediasRecebidas = new Map<string, ResultadoMedia>();

    function receberDoServico(linha: string): void {
        let conteudo: unknown;
        try {
            conteudo = JSON.parse(linha);
        } catch {
            registrarErro(ESC, 'resposta do serviço descartada: não é JSON válido');
            return;
        }

        if (!ehResultadoMedia(conteudo)) {
            registrarErro(ESC, 'resposta do serviço descartada: fora do contrato');
            return;
        }

        // Guardar em memória é o que permite exibir a média sem consultar o
        // serviço de novo: o valor mais recente de cada sensor fica aqui.
        mediasRecebidas.set(conteudo.idSensor, conteudo);

        registrar(
            ESC,
            `média recebida: ${conteudo.idSensor} = ${conteudo.media.toFixed(2)} ${conteudo.unidade} em ${conteudo.quantidade} amostra(s) | janela ${conteudo.janelaInicio.slice(11, 19)}`,
        );
    }

    function conectarAoServico(): void {
        if (encerrando) {
            return;
        }

        const novaConexao = net.createConnection({
            host: enderecoDoServico.host,
            port: enderecoDoServico.porta,
        });
        servico = novaConexao;

        novaConexao.on('connect', () => {
            conectadoAoServico = true;
            registrar(
                ESC,
                `conectado ao serviço em ${enderecoDoServico.host}:${enderecoDoServico.porta}`,
            );
        });

        novaConexao.on('error', (erro: Error) => {
            registrarErro(ESC, `falha na conexão com o serviço: ${erro.message}`);
        });

        // O mesmo socket que envia leituras recebe as médias de volta.
        novaConexao.on('data', criarLeitorDeLinhas(receberDoServico));

        novaConexao.on('close', () => {
            conectadoAoServico = false;
            servico = undefined;

            if (encerrando) {
                return;
            }

            registrar(ESC, `desconectado do serviço; nova tentativa em ${INTERVALO_DE_RECONEXAO_MS} ms`);
            reconexao = setTimeout(conectarAoServico, INTERVALO_DE_RECONEXAO_MS);
        });
    }

    function encaminhar(linha: string, cliente: string): void {
        let conteudo: unknown;
        try {
            conteudo = JSON.parse(linha);
        } catch {
            invalidas += 1;
            registrarErro(ESC, `[${cliente}] descartado: não é JSON válido`);
            return;
        }

        if (!ehLeituraSensor(conteudo)) {
            invalidas += 1;
            registrarErro(ESC, `[${cliente}] descartado: envelope fora do contrato`);
            return;
        }

        sensoresVistos.add(conteudo.idSensor);

        if (conteudo.versaoSchema > VERSAO_SCHEMA) {
            registrarErro(
                ESC,
                `${conteudo.idSensor} usa schema v${conteudo.versaoSchema}, mais novo que o conhecido (v${VERSAO_SCHEMA}); encaminhando mesmo assim`,
            );
        }

        if (!conectadoAoServico || servico === undefined) {
            // Mesma semântica at-most-once do simulador: contabiliza e segue.
            perdidas += 1;
            return;
        }

        servico.write(codificarLinha(conteudo));
        encaminhadas += 1;
        registrar(ESC, `${conteudo.idSensor} -> serviço: ${conteudo.valor} ${conteudo.unidade}`);
    }

    const servidor = net.createServer((socket: net.Socket) => {
        const cliente = `${socket.remoteAddress ?? 'desconhecido'}:${socket.remotePort ?? '?'}`;
        conexoes.add(socket);
        registrar(ESC, `sensor conectado: ${cliente}`);

        const lerLinhas = criarLeitorDeLinhas((linha) => encaminhar(linha, cliente));

        socket.on('data', lerLinhas);
        socket.on('error', (erro: Error) => {
            registrarErro(ESC, `erro na conexão ${cliente}: ${erro.message}`);
        });
        socket.on('close', () => {
            conexoes.delete(socket);
            registrar(ESC, `sensor desconectado: ${cliente}`);
        });
    });

    servidor.on('error', (erro: NodeJS.ErrnoException) => {
        if (erro.code === 'EADDRINUSE') {
            registrarErro(ESC, `a porta ${porta} já está em uso.`);
        } else {
            registrarErro(ESC, `erro no servidor: ${erro.message}`);
        }
        process.exitCode = 1;
    });

    const status = setInterval(() => {
        const emMemoria =
            mediasRecebidas.size === 0
                ? 'nenhuma média ainda'
                : [...mediasRecebidas.values()]
                      .map(
                          (media) =>
                              `${media.idSensor}=${media.media.toFixed(2)} ${media.unidade} (${media.quantidade} amostra(s))`,
                      )
                      .join(', ');

        registrar(
            ESC,
            `${sensoresVistos.size} sensor(es) visto(s), ${encaminhadas} encaminhada(s), ${perdidas} perdida(s), ${invalidas} inválida(s) | em memória: ${emMemoria}`,
        );
    }, INTERVALO_DO_STATUS_MS);

    function encerrar(sinal: NodeJS.Signals): void {
        if (encerrando) {
            return;
        }
        encerrando = true;

        clearInterval(status);
        if (reconexao !== undefined) {
            clearTimeout(reconexao);
        }

        registrar(
            ESC,
            `recebido ${sinal}, encerrando (${encaminhadas} encaminhada(s), ${perdidas} perdida(s), ${invalidas} inválida(s), ${mediasRecebidas.size} média(s) em memória)`,
        );

        for (const conexao of conexoes) {
            conexao.destroy();
        }
        conexoes.clear();

        servidor.close();

        if (conectadoAoServico) {
            servico?.end();
        } else {
            servico?.destroy();
        }
    }

    for (const sinal of ['SIGINT', 'SIGTERM'] as const) {
        process.on(sinal, () => encerrar(sinal));
    }

    servidor.listen(porta, () => {
        registrar(ESC, `escutando na porta ${porta} e repassando para ${enderecoDoServico.host}:${enderecoDoServico.porta}`);
    });

    conectarAoServico();
}

try {
    iniciar();
} catch (erro) {
    registrarErro(ESC, erro instanceof Error ? erro.message : String(erro));
    process.exit(1);
}
