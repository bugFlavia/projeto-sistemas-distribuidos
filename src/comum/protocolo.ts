import type { Buffer } from 'node:buffer';

/** Endereço de destino de uma conexão TCP. */
export interface Endereco {
    readonly host: string;
    readonly porta: number;
}

export const HOST_PADRAO = '127.0.0.1';

/**
 * Interpreta um endereço no formato `host:porta`.
 *
 * O host é opcional (`:4000` usa o padrão) e um valor só com número é tratado
 * como porta (`4000` equivale a `127.0.0.1:4000`).
 */
export function analisarEndereco(texto: string, portaPadrao: number): Endereco {
    const separador = texto.lastIndexOf(':');

    const host = separador >= 0 ? texto.slice(0, separador) : '';
    const parteDaPorta = separador >= 0 ? texto.slice(separador + 1) : texto;

    const porta = parteDaPorta === '' ? portaPadrao : Number.parseInt(parteDaPorta, 10);

    if (!Number.isInteger(porta) || porta < 1 || porta > 65535) {
        throw new Error(
            `Endereço inválido: "${texto}". Use "host:porta" (ex.: 127.0.0.1:4000) ou só a porta (ex.: 4000).`,
        );
    }

    return { host: host === '' ? HOST_PADRAO : host, porta };
}

/** Serializa uma mensagem em NDJSON: um JSON por linha. */
export function codificarLinha(mensagem: unknown): string {
    return `${JSON.stringify(mensagem)}\n`;
}

/**
 * Cria um decodificador incremental de NDJSON.
 *
 * O TCP não preserva fronteiras de mensagem: um `data` pode trazer metade de
 * um JSON ou dois JSON colados. Sem este buffer, o `JSON.parse` quebraria de
 * vez em quando — falha intermitente, que é o pior tipo de bug em sistema
 * distribuído. Aqui o resto é guardado e só linhas completas são entregues.
 */
export function criarLeitorDeLinhas(
    aoReceberLinha: (linha: string) => void,
): (pedaco: Buffer) => void {
    let pendente = '';

    return (pedaco: Buffer): void => {
        pendente += pedaco.toString('utf8');

        let quebra = pendente.indexOf('\n');
        while (quebra !== -1) {
            const linha = pendente.slice(0, quebra).trim();
            pendente = pendente.slice(quebra + 1);

            if (linha !== '') {
                aoReceberLinha(linha);
            }

            quebra = pendente.indexOf('\n');
        }
    };
}
