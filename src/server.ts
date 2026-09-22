import * as net from 'node:net';

import { registrar, registrarErro } from './comum/log.ts';
import { codificarLinha, criarLeitorDeLinhas } from './comum/protocolo.ts';
import { ehAtualizacaoDeMedias, ehConsultaDeMedias } from './comum/contrato.ts';
import type { HistoricoDeSensor, ResultadoMedia } from './comum/contrato.ts';

const ESC = 'servidor';
const PORTA_PADRAO = 6000;
const INTERVALO_DO_STATUS_MS = 30_000;

const TAMANHO_DO_HISTORICO = Number(process.env['HISTORICO_TAMANHO'] ?? 20);

interface Consumo {
    readonly idSensor: string;
    readonly unidade: string;
    readonly origem: string;
    atualizadoEm: string;
    readonly medidas: ResultadoMedia[];
}

interface EstadoDoGateway {
    conectado: boolean;
}

function iniciar(): void {
    const porta = Number(process.env['SERVIDOR_PORT'] ?? PORTA_PADRAO);
    if (!Number.isInteger(porta) || porta < 1 || porta > 65535) {
        throw new Error(`SERVIDOR_PORT inválida: "${process.env['SERVIDOR_PORT']}".`);
    }

    /** Visão consolidada, por sensor, independente da conexão que a trouxe. */
    const sensores = new Map<string, Consumo>();
    const gateways = new Map<string, EstadoDoGateway>();
    const conexoes = new Set<net.Socket>();

    let atualizacoes = 0;
    let consultas = 0;
    let descartadas = 0;

    function guardar(idGateway: string, medias: readonly ResultadoMedia[]): void {
        const agora = new Date().toISOString();

        const estado = gateways.get(idGateway) ?? { conectado: true };
        estado.conectado = true;
        gateways.set(idGateway, estado);

        for (const media of medias) {
            let consumo = sensores.get(media.idSensor);

            if (consumo === undefined) {
                consumo = {
                    idSensor: media.idSensor,
                    unidade: media.unidade,
                    origem: idGateway,
                    atualizadoEm: agora,
                    medidas: [],
                };
                sensores.set(media.idSensor, consumo);
            }

            // A mesma janela pode chegar duas vezes: num reenvio, ou no
            // snapshot que o gateway manda ao reconectar. Comparar pela janela
            // evita contar duas vezes.
            const jaTem = consumo.medidas.some(
                (existente) => existente.janelaInicio === media.janelaInicio,
            );

            if (!jaTem) {
                consumo.medidas.push(media);
            }

            // Ordena por janela (ISO em ordem alfabética é ordem cronológica) e
            // descarta a mais antiga: assim o histórico fica certo mesmo se as
            // mensagens chegarem fora de ordem.
            consumo.medidas.sort((a, b) => a.janelaInicio.localeCompare(b.janelaInicio));

            while (consumo.medidas.length > TAMANHO_DO_HISTORICO) {
                consumo.medidas.shift();
            }

            consumo.atualizadoEm = agora;
            atualizacoes += 1;
        }
    }

    function montarResposta(idSensor: string | undefined): unknown {
        const selecionados = [...sensores.values()].filter(
            (consumo) => idSensor === undefined || consumo.idSensor === idSensor,
        );

        const historicos: HistoricoDeSensor[] = selecionados.map((consumo) => ({
            idSensor: consumo.idSensor,
            unidade: consumo.unidade,
            origem: consumo.origem,
            disponivel: gateways.get(consumo.origem)?.conectado ?? false,
            atualizadoEm: consumo.atualizadoEm,
            medidas: [...consumo.medidas],
        }));

        return {
            tipoMensagem: 'resposta',
            geradoEm: new Date().toISOString(),
            // Resultado parcial tem que se declarar parcial: sem esta lista, o
            // cliente concluiria que os sensores de um gateway fora do ar
            // simplesmente não existem.
            gatewaysDesconectados: [...gateways.entries()]
                .filter(([, estado]) => !estado.conectado)
                .map(([id]) => id),
            sensores: historicos,
        };
    }

    const servidor = net.createServer((socket: net.Socket) => {
        const rotulo = `${socket.remoteAddress ?? 'desconhecido'}:${socket.remotePort ?? '?'}`;
        let idDoGateway: string | undefined;

        conexoes.add(socket);
        registrar(ESC, `conexão aberta: ${rotulo}`);

        const lerLinhas = criarLeitorDeLinhas((linha) => {
            let conteudo: unknown;
            try {
                conteudo = JSON.parse(linha);
            } catch {
                descartadas += 1;
                registrarErro(ESC, `[${rotulo}] descartado: não é JSON válido`);
                return;
            }

            if (ehAtualizacaoDeMedias(conteudo)) {
                idDoGateway = conteudo.idGateway;
                guardar(conteudo.idGateway, conteudo.medias);
                registrar(
                    ESC,
                    `${conteudo.idGateway} atualizou ${conteudo.medias.length} média(s)`,
                );
                return;
            }

            if (ehConsultaDeMedias(conteudo)) {
                consultas += 1;
                const alvo = conteudo.idSensor ?? 'todos os sensores';
                registrar(ESC, `consulta de ${rotulo} por ${alvo}`);
                socket.write(codificarLinha(montarResposta(conteudo.idSensor)));
                return;
            }

            descartadas += 1;
            registrarErro(ESC, `[${rotulo}] descartado: mensagem fora do contrato`);
        });

        socket.on('data', lerLinhas);
        socket.on('error', (erro: Error) => {
            registrarErro(ESC, `erro na conexão ${rotulo}: ${erro.message}`);
        });
        socket.on('close', () => {
            conexoes.delete(socket);

            // A conexão que caiu pode ser de um gateway. As médias dele ficam
            // guardadas, mas passam a ser apresentadas como indisponíveis — com
            // a idade que já têm, para o cliente julgar.
            if (idDoGateway !== undefined) {
                const estado = gateways.get(idDoGateway);
                if (estado !== undefined) {
                    estado.conectado = false;
                }
                registrar(ESC, `gateway desconectado: ${idDoGateway}`);
            }

            registrar(ESC, `conexão encerrada: ${rotulo}`);
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
        const conectados = [...gateways.values()].filter((estado) => estado.conectado).length;
        registrar(
            ESC,
            `${sensores.size} sensor(es), ${gateways.size} gateway(s) conhecido(s) (${conectados} conectado(s)), ${atualizacoes} atualização(ões), ${consultas} consulta(s), ${descartadas} descartada(s)`,
        );
    }, INTERVALO_DO_STATUS_MS);

    function encerrar(sinal: NodeJS.Signals): void {
        clearInterval(status);

        registrar(
            ESC,
            `recebido ${sinal}, encerrando (${sensores.size} sensor(es), ${atualizacoes} atualização(ões), ${consultas} consulta(s))`,
        );

        for (const conexao of conexoes) {
            conexao.destroy();
        }
        conexoes.clear();

        servidor.close();
    }

    for (const sinal of ['SIGINT', 'SIGTERM'] as const) {
        process.on(sinal, () => encerrar(sinal));
    }

    servidor.listen(porta, () => {
        registrar(
            ESC,
            `escutando na porta ${porta}: recebe médias dos gateways e atende o cliente`,
        );
    });
}

try {
    iniciar();
} catch (erro) {
    registrarErro(ESC, erro instanceof Error ? erro.message : String(erro));
    process.exit(1);
}