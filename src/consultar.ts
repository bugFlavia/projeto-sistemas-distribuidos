import * as net from 'node:net';
import { parseArgs } from 'node:util';

import { registrarErro } from './comum/log.ts';
import { analisarEndereco, codificarLinha, criarLeitorDeLinhas } from './comum/protocolo.ts';
import { ehRespostaDeMedias } from './comum/contrato.ts';
import type { Endereco } from './comum/protocolo.ts';
import type { HistoricoDeSensor, RespostaDeMedias } from './comum/contrato.ts';

/**
 * Cliente de consulta: o que a pessoa roda para ver as médias.
 *
 * Conhece um endereço só, o do servidor. Não sabe quantos gateways existem nem
 * em que porta cada um está — é essa a transparência que o desenho distribuído
 * precisa entregar.
 */

const ESC = 'consultar';
const SERVIDOR_PADRAO = '127.0.0.1:6000';
const PORTA_PADRAO_DO_SERVIDOR = 6000;
const PRAZO_MS = 5000;

function uso(): string {
    return [
        'Uso: npm run consultar -- [--servidor <endereço>] [--sensor <id>] [--json]',
        '',
        `  --servidor <endereço>  host:porta do servidor (padrão: ${SERVIDOR_PADRAO})`,
        '  --sensor <id>          mostra só um sensor (padrão: todos)',
        '  --json                 imprime a resposta crua, sem formatar',
        '  -h, --ajuda            mostra esta mensagem',
    ].join('\n');
}

function idade(instante: string, agora: number): string {
    const diferenca = agora - Date.parse(instante);

    if (Number.isNaN(diferenca)) {
        return '?';
    }

    if (diferenca < 1000) {
        return 'agora';
    }

    const segundos = Math.round(diferenca / 1000);
    return segundos < 60 ? `há ${segundos}s` : `há ${Math.round(segundos / 60)}min`;
}

function formatar(historico: HistoricoDeSensor, agora: number): string[] {
    const alerta = historico.disponivel ? '' : '   [gateway desconectado]';
    const linhas = [
        `${historico.idSensor} (${historico.unidade}) — origem ${historico.origem} — atualizado ${idade(historico.atualizadoEm, agora)}${alerta}`,
    ];

    if (historico.medidas.length === 0) {
        linhas.push('  sem medidas ainda');
        return linhas;
    }

    // O contrato entrega da mais antiga para a mais recente; para ler, a ordem
    // útil é a inversa.
    for (const medida of [...historico.medidas].reverse()) {
        linhas.push(
            `  ${idade(medida.janelaInicio, agora).padEnd(8)} ${medida.media.toFixed(2).padStart(10)}   ${medida.quantidade} amostra(s), ${medida.minimo.toFixed(2)}..${medida.maximo.toFixed(2)}`,
        );
    }

    return linhas;
}

function imprimir(resposta: RespostaDeMedias, json: boolean): void {
    if (json) {
        console.log(JSON.stringify(resposta, null, 2));
        return;
    }

    const agora = Date.now();

    if (resposta.sensores.length === 0) {
        console.log('O servidor ainda não conhece nenhuma média.');
    }

    for (const historico of resposta.sensores) {
        for (const linha of formatar(historico, agora)) {
            console.log(linha);
        }
        console.log('');
    }

    if (resposta.gatewaysDesconectados.length > 0) {
        console.log(
            `Atenção: resultado parcial. Sem resposta de: ${resposta.gatewaysDesconectados.join(', ')}`,
        );
    }
}

function main(): void {
    const { values } = parseArgs({
        options: {
            servidor: { type: 'string' },
            sensor: { type: 'string' },
            json: { type: 'boolean' },
            ajuda: { type: 'boolean', short: 'h' },
        },
    });

    if (values.ajuda === true) {
        console.log(uso());
        return;
    }

    const endereco: Endereco = analisarEndereco(
        values.servidor ?? process.env['SERVIDOR_ADDR'] ?? SERVIDOR_PADRAO,
        PORTA_PADRAO_DO_SERVIDOR,
    );

    const socket = net.createConnection({ host: endereco.host, port: endereco.porta });

    // Sem prazo, um servidor travado travaria a consulta para sempre.
    const prazo = setTimeout(() => {
        registrarErro(ESC, `o servidor não respondeu em ${PRAZO_MS} ms.`);
        socket.destroy();
        process.exit(1);
    }, PRAZO_MS);

    socket.on('connect', () => {
        // Sem idSensor, o servidor devolve todos.
        const consulta =
            values.sensor === undefined
                ? { tipoMensagem: 'consulta' as const }
                : { tipoMensagem: 'consulta' as const, idSensor: values.sensor };

        socket.write(codificarLinha(consulta));
    });

    socket.on(
        'data',
        criarLeitorDeLinhas((linha) => {
            clearTimeout(prazo);
            socket.end();

            let conteudo: unknown;
            try {
                conteudo = JSON.parse(linha);
            } catch {
                registrarErro(ESC, 'a resposta não é JSON válido.');
                process.exitCode = 1;
                return;
            }

            if (!ehRespostaDeMedias(conteudo)) {
                registrarErro(ESC, 'a resposta está fora do contrato.');
                process.exitCode = 1;
                return;
            }

            imprimir(conteudo, values.json === true);
        }),
    );

    socket.on('error', (erro: Error) => {
        clearTimeout(prazo);
        registrarErro(
            ESC,
            `falha ao falar com ${endereco.host}:${endereco.porta}: ${erro.message}`,
        );
        process.exit(1);
    });
}

try {
    main();
} catch (erro) {
    registrarErro(ESC, erro instanceof Error ? erro.message : String(erro));
    process.exit(1);
}
