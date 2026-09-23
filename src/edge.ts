import * as net from 'node:net';
import { parseArgs } from 'node:util';

import { registrar, registrarErro } from './comum/log.ts';
import { analisarEndereco, codificarLinha, criarLeitorDeLinhas } from './comum/protocolo.ts';
import { VERSAO_SCHEMA, ehLeituraSensor, ehResultadoMedia } from './comum/contrato.ts';
import type { Endereco } from './comum/protocolo.ts';
import type { ResultadoMedia } from './comum/contrato.ts';

let ESC = 'edge';

const INTERVALO_DE_RECONEXAO_MS = 1000;
const INTERVALO_DO_STATUS_MS = 10_000;
const PORTA_PADRAO_DE_ESCUTA = 4000;
const SERVICO_PADRAO = '127.0.0.1:5000';
const PORTA_PADRAO_DO_SERVICO = 5000;
const SERVIDOR_PADRAO = '127.0.0.1:6000';
const PORTA_PADRAO_DO_SERVIDOR = 6000;

/** Quantas janelas cada sensor guarda em memória. */
const TAMANHO_DO_HISTORICO = Number(process.env['HISTORICO_TAMANHO'] ?? 20);

function uso(): string {
    return [
        'Uso: npm run edge -- [--id <texto>] [--porta <número>]',
        '',
        '  --id <texto>       nome deste gateway nos logs (padrão: edge:<porta>)',
        `  --porta <número>   porta em que escuta (padrão: ${PORTA_PADRAO_DE_ESCUTA})`,
        '  -h, --ajuda        mostra esta mensagem',
        '',
        'Variáveis de ambiente: EDGE_PORT substitui --porta, SERVICO_ADDR define',
        `o serviço de destino (padrão: ${SERVICO_PADRAO}) e SERVIDOR_ADDR define o`,
        `servidor de destino (padrão: ${SERVIDOR_PADRAO}). HISTORICO_TAMANHO controla`,
        `quantas janelas cada sensor guarda em memória (padrão: ${TAMANHO_DO_HISTORICO}).`,
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

    const enderecoDoServidor: Endereco = analisarEndereco(
        process.env['SERVIDOR_ADDR'] ?? SERVIDOR_PADRAO,
        PORTA_PADRAO_DO_SERVIDOR,
    );

    let servico: net.Socket | undefined;
    let conectadoAoServico = false;
    let conexaoComOServidor: net.Socket | undefined;
    let conectadoAoServidor = false;
    let encerrando = false;
    let reconexao: NodeJS.Timeout | undefined;
    let reconexaoComOServidor: NodeJS.Timeout | undefined;

    let encaminhadas = 0;
    let perdidas = 0;
    let invalidas = 0;
    let atualizacoesEnviadas = 0;
    let atualizacoesPerdidas = 0;
    const sensoresVistos = new Set<string>();
    const conexoes = new Set<net.Socket>();

    /**
     * Histórico das últimas médias de cada sensor, em anel: entrou uma, sai a
     * mais antiga. Guardar tudo num nó que roda por horas é o caminho para
     * estourar a memória.
     */
    const historicos = new Map<string, ResultadoMedia[]>();

    function guardarNoHistorico(media: ResultadoMedia): void {
        let historico = historicos.get(media.idSensor);

        if (historico === undefined) {
            historico = [];
            historicos.set(media.idSensor, historico);
        }

        historico.push(media);

        if (historico.length > TAMANHO_DO_HISTORICO) {
            historico.shift();
        }
    }

    function enviarAoServidor(medias: readonly ResultadoMedia[]): void {
        if (medias.length === 0) {
            return;
        }

        if (!conectadoAoServidor || conexaoComOServidor === undefined) {
            atualizacoesPerdidas += medias.length;
            return;
        }

        conexaoComOServidor.write(
            codificarLinha({ tipoMensagem: 'atualizacao', idGateway: ESC, medias }),
        );
        atualizacoesEnviadas += medias.length;
    }

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

        guardarNoHistorico(conteudo);

        registrar(
            ESC,
            `média recebida: ${conteudo.idSensor} = ${conteudo.media.toFixed(2)} ${conteudo.unidade} em ${conteudo.quantidade} amostra(s) | janela ${conteudo.janelaInicio.slice(11, 19)}`,
        );

        // Repassa ao servidor assim que chega: é ele quem atende o cliente.
        enviarAoServidor([conteudo]);
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

    function conectarAoServidor(): void {
        if (encerrando) {
            return;
        }

        const novaConexao = net.createConnection({
            host: enderecoDoServidor.host,
            port: enderecoDoServidor.porta,
        });
        conexaoComOServidor = novaConexao;

        novaConexao.on('connect', () => {
            conectadoAoServidor = true;
            registrar(
                ESC,
                `conectado ao servidor em ${enderecoDoServidor.host}:${enderecoDoServidor.porta}`,
            );

            // O servidor pode ter reiniciado e voltado vazio. Como a memória
            // deste nó é a fonte de verdade dos sensores dele, o histórico
            // inteiro vai junto na reconexão e o servidor se reconstrói sozinho.
            enviarAoServidor([...historicos.values()].flat());
        });

        novaConexao.on('error', (erro: Error) => {
            registrarErro(ESC, `falha na conexão com o servidor: ${erro.message}`);
        });

        novaConexao.on('close', () => {
            conectadoAoServidor = false;
            conexaoComOServidor = undefined;

            if (encerrando) {
                return;
            }

            registrar(ESC, `desconectado do servidor; nova tentativa em ${INTERVALO_DE_RECONEXAO_MS} ms`);
            reconexaoComOServidor = setTimeout(conectarAoServidor, INTERVALO_DE_RECONEXAO_MS);
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
            historicos.size === 0
                ? 'nenhuma média ainda'
                : [...historicos.entries()]
                      .map(([idSensor, historico]) => {
                          const ultima = historico.at(-1);
                          const valor =
                              ultima === undefined
                                  ? 'sem leitura'
                                  : `${ultima.media.toFixed(2)} ${ultima.unidade}`;
                          return `${idSensor}=${valor} (${historico.length} janela(s))`;
                      })
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
        if (reconexaoComOServidor !== undefined) {
            clearTimeout(reconexaoComOServidor);
        }

        registrar(
            ESC,
            `recebido ${sinal}, encerrando (${encaminhadas} encaminhada(s), ${perdidas} perdida(s), ${invalidas} inválida(s), ${historicos.size} sensor(es) em memória, ${atualizacoesEnviadas} atualização(ões) enviada(s), ${atualizacoesPerdidas} perdida(s))`,
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

        if (conectadoAoServidor) {
            conexaoComOServidor?.end();
        } else {
            conexaoComOServidor?.destroy();
        }
    }

    for (const sinal of ['SIGINT', 'SIGTERM'] as const) {
        process.on(sinal, () => encerrar(sinal));
    }

    servidor.listen(porta, () => {
        registrar(
            ESC,
            `escutando na porta ${porta}; leituras seguem para o serviço em ${enderecoDoServico.host}:${enderecoDoServico.porta} e médias para o servidor em ${enderecoDoServidor.host}:${enderecoDoServidor.porta}`,
        );
    });

    conectarAoServico();
    conectarAoServidor();
}

try {
    iniciar();
} catch (erro) {
    registrarErro(ESC, erro instanceof Error ? erro.message : String(erro));
    process.exit(1);
}
