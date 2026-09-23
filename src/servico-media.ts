import * as net from 'node:net';

import { registrar, registrarErro } from './comum/log.ts';
import { codificarLinha, criarLeitorDeLinhas } from './comum/protocolo.ts';
import { VERSAO_SCHEMA, ehLeituraSensor } from './comum/contrato.ts';

/**
 * Serviço de média.
 *
 * Recebe as leituras dos gateways, acumula por sensor dentro de uma janela de
 * tempo e devolve a média na **mesma conexão** em que a leitura chegou. Ele não
 * precisa conhecer o endereço de ninguém: quem abriu a conexão foi o gateway, e
 * a resposta volta por ela.
 *
 * A janela é alinhada ao relógio absoluto (múltiplo de `JANELA_MS` calculado
 * sobre o timestamp da leitura), e não a "desde que o gateway conectou". Sem
 * isso, dois gateways teriam janelas deslocadas e as médias não seriam
 * comparáveis — que é justamente o que impede acrescentar mais um nó depois.
 *
 * Internamente guarda **soma e quantidade**, nunca a média já dividida. É o que
 * permite combinar janelas de tamanhos diferentes sem distorcer o resultado, e
 * o que torna barato mover essa agregação para o gateway mais tarde.
 */

const ESC = 'serviço';
const PORTA_PADRAO = 5000;
const JANELA_PADRAO_MS = 5_000;
const INTERVALO_DE_VARREDURA_MS = 500;
const INTERVALO_DO_STATUS_MS = 15_000;

interface JanelaAberta {
    idSensor: string;
    unidade: string;
    inicio: number;
    soma: number;
    quantidade: number;
    minimo: number;
    maximo: number;
}

interface Conexao {
    socket: net.Socket;
    rotulo: string;
    /** Janelas abertas desta conexão, indexadas por `inicio|idSensor`. */
    janelas: Map<string, JanelaAberta>;
}

function inicioDaJanela(instante: number, janelaMs: number): number {
    return Math.floor(instante / janelaMs) * janelaMs;
}

function iniciar(): void {
    const porta = Number(process.env['SERVICO_PORT'] ?? PORTA_PADRAO);
    if (!Number.isInteger(porta) || porta < 1 || porta > 65535) {
        throw new Error(`SERVICO_PORT inválida: "${process.env['SERVICO_PORT']}".`);
    }

    const janelaMs = Number(process.env['JANELA_MS'] ?? JANELA_PADRAO_MS);
    if (!Number.isInteger(janelaMs) || janelaMs < 1) {
        throw new Error(`JANELA_MS inválida: "${process.env['JANELA_MS']}".`);
    }

    const conexoes = new Map<net.Socket, Conexao>();
    let leituras = 0;
    let resultados = 0;
    let descartadas = 0;

    function enviarResultado(conexao: Conexao, janela: JanelaAberta): void {
        const mensagem = {
            tipoMensagem: 'media' as const,
            idSensor: janela.idSensor,
            unidade: janela.unidade,
            janelaInicio: new Date(janela.inicio).toISOString(),
            janelaMs,
            media: janela.soma / janela.quantidade,
            quantidade: janela.quantidade,
            minimo: janela.minimo,
            maximo: janela.maximo,
            versaoSchema: VERSAO_SCHEMA,
        };

        conexao.socket.write(codificarLinha(mensagem));
        resultados += 1;

        registrar(
            ESC,
            `média de ${janela.idSensor}: ${mensagem.media.toFixed(2)} ${janela.unidade} em ${janela.quantidade} amostra(s) -> ${conexao.rotulo}`,
        );
    }

    function contabilizar(conexao: Conexao, conteudo: unknown): void {
        if (!ehLeituraSensor(conteudo)) {
            descartadas += 1;
            registrarErro(ESC, `[${conexao.rotulo}] leitura descartada: fora do contrato`);
            return;
        }

        // O instante vem da leitura (tempo do evento), não da chegada.
        const instanteLido = Date.parse(conteudo.timestamp);
        const inicio = inicioDaJanela(Number.isNaN(instanteLido) ? Date.now() : instanteLido, janelaMs);
        const chave = `${inicio}|${conteudo.idSensor}`;

        let janela = conexao.janelas.get(chave);
        if (janela === undefined) {
            janela = {
                idSensor: conteudo.idSensor,
                unidade: conteudo.unidade,
                inicio,
                soma: 0,
                quantidade: 0,
                minimo: Number.POSITIVE_INFINITY,
                maximo: Number.NEGATIVE_INFINITY,
            };
            conexao.janelas.set(chave, janela);
        }

        janela.soma += conteudo.valor;
        janela.quantidade += 1;
        janela.minimo = Math.min(janela.minimo, conteudo.valor);
        janela.maximo = Math.max(janela.maximo, conteudo.valor);
        leituras += 1;
    }

    const servidor = net.createServer((socket: net.Socket) => {
        const rotulo = `${socket.remoteAddress ?? 'desconhecido'}:${socket.remotePort ?? '?'}`;
        const conexao: Conexao = { socket, rotulo, janelas: new Map() };
        conexoes.set(socket, conexao);

        registrar(ESC, `gateway conectado: ${rotulo}`);

        const lerLinhas = criarLeitorDeLinhas((linha) => {
            let conteudo: unknown;
            try {
                conteudo = JSON.parse(linha);
            } catch {
                descartadas += 1;
                registrarErro(ESC, `[${rotulo}] descartado: não é JSON válido`);
                return;
            }

            contabilizar(conexao, conteudo);
        });

        socket.on('data', lerLinhas);
        socket.on('error', (erro: Error) => {
            registrarErro(ESC, `erro na conexão ${rotulo}: ${erro.message}`);
        });
        socket.on('close', () => {
            conexoes.delete(socket);
            registrar(
                ESC,
                `gateway desconectado: ${rotulo} (${conexao.janelas.size} janela(s) aberta(s) descartada(s))`,
            );
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

    // Fecha as janelas cujo intervalo já terminou e devolve o resultado.
    //
    // Uma leitura que chegue atrasada, para uma janela já fechada, recria a
    // entrada e provoca uma nova emissão com o número corrigido. É uma escolha
    // consciente: preferimos reemitir a perder o dado.
    const varredura = setInterval(() => {
        const agora = Date.now();

        for (const conexao of conexoes.values()) {
            for (const [chave, janela] of conexao.janelas) {
                if (janela.inicio + janelaMs > agora) {
                    continue;
                }

                conexao.janelas.delete(chave);
                enviarResultado(conexao, janela);
            }
        }
    }, INTERVALO_DE_VARREDURA_MS);

    const status = setInterval(() => {
        registrar(
            ESC,
            `${conexoes.size} gateway(s), ${leituras} leitura(s), ${resultados} média(s) devolvida(s), ${descartadas} descartada(s), janela de ${janelaMs} ms`,
        );
    }, INTERVALO_DO_STATUS_MS);

    function encerrar(sinal: NodeJS.Signals): void {
        clearInterval(varredura);
        clearInterval(status);

        // Devolve o que está aberto antes de sair, para não sumir com dado já recebido.
        for (const conexao of conexoes.values()) {
            for (const janela of conexao.janelas.values()) {
                enviarResultado(conexao, janela);
            }
            conexao.janelas.clear();
        }

        registrar(
            ESC,
            `recebido ${sinal}, encerrando (${leituras} leitura(s), ${resultados} média(s) devolvida(s))`,
        );

        for (const conexao of conexoes.values()) {
            conexao.socket.end();
        }
        conexoes.clear();

        servidor.close();
    }

    for (const sinal of ['SIGINT', 'SIGTERM'] as const) {
        process.on(sinal, () => encerrar(sinal));
    }

    servidor.listen(porta, () => {
        registrar(ESC, `escutando na porta ${porta}, agregando em janelas de ${janelaMs} ms`);
    });
}

try {
    iniciar();
} catch (erro) {
    registrarErro(ESC, erro instanceof Error ? erro.message : String(erro));
    process.exit(1);
}
