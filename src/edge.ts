import * as net from 'node:net';

import { registrar, registrarErro } from './comum/log.ts';
import { analisarEndereco, codificarLinha, criarLeitorDeLinhas } from './comum/protocolo.ts';
import { VERSAO_SCHEMA, ehLeituraSensor } from './sensors/index.ts';
import type { Endereco } from './comum/protocolo.ts';

/**
 * Nó de borda (edge).
 *
 * Nesta etapa ele age como middleware: aceita conexões dos simuladores,
 * confere se o envelope está dentro do contrato e repassa a leitura intacta
 * para o serviço de média. Ele não agrega nada ainda — mas já concentra os
 * sensores num único ponto, que é o que permite trocar o que acontece aqui
 * dentro sem tocar nos sensores.
 *
 * O repasse é feito por uma conexão única com o serviço, reaproveitada por
 * todas as conexões de entrada: o número de sensores não vira número de
 * conexões abertas lá em cima.
 */

const ESC = 'edge';
const INTERVALO_DE_RECONEXAO_MS = 1000;
const INTERVALO_DO_STATUS_MS = 10_000;
const PORTA_PADRAO_DE_ESCUTA = 4000;
const SERVICO_PADRAO = '127.0.0.1:3000';
const PORTA_PADRAO_DO_SERVICO = 3000;

function iniciar(): void {
    const porta = Number(process.env['EDGE_PORT'] ?? PORTA_PADRAO_DE_ESCUTA);
    if (!Number.isInteger(porta) || porta < 1 || porta > 65535) {
        throw new Error(`EDGE_PORT inválida: "${process.env['EDGE_PORT']}".`);
    }

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
        registrar(
            ESC,
            `${sensoresVistos.size} sensor(es) visto(s), ${encaminhadas} encaminhada(s), ${perdidas} perdida(s), ${invalidas} inválida(s)`,
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
            `recebido ${sinal}, encerrando (${encaminhadas} encaminhada(s), ${perdidas} perdida(s), ${invalidas} inválida(s))`,
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
