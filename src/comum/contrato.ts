/**
 * Protocolo do sistema: todas as mensagens que trafegam entre os componentes.
 *
 * Sensor, gateway, serviço, servidor e cliente só conversam por estes tipos.
 * É aqui que se olha para saber o que cada nó pode receber e enviar, e é aqui
 * que se acrescenta uma mensagem nova.
 *
 * Todos os validadores ignoram campos desconhecidos de propósito: é isso que
 * permite evoluir o envelope sem quebrar quem já está rodando.
 */

/** Identificador do tipo de sensor. Viaja no envelope, então faz parte do protocolo. */
export type TipoSensor =
    | 'luz'
    | 'umidade'
    | 'presenca'
    | 'pressao'
    | 'ultrassonico'
    | 'temperatura';

/**
 * Versão do envelope. Suba este número ao mudar algo de forma incompatível, para
 * que quem recebe consiga detectar uma versão que não sabe interpretar.
 */
export const VERSAO_SCHEMA = 1;

// ---------------------------------------------------------------------------
// sensor -> gateway -> serviço
// ---------------------------------------------------------------------------

/** Uma leitura de sensor. */
export interface LeituraSensor {
    readonly idSensor: string;
    readonly tipo: TipoSensor;
    readonly valor: number;
    readonly unidade: string;
    readonly timestamp: string;
    readonly sequencia: number;
    readonly versaoSchema: number;
}

export function ehLeituraSensor(valor: unknown): valor is LeituraSensor {
    if (typeof valor !== 'object' || valor === null) {
        return false;
    }

    const campos = valor as Record<string, unknown>;

    return (
        typeof campos['idSensor'] === 'string' &&
        typeof campos['tipo'] === 'string' &&
        typeof campos['valor'] === 'number' &&
        Number.isFinite(campos['valor']) &&
        typeof campos['unidade'] === 'string' &&
        typeof campos['timestamp'] === 'string' &&
        typeof campos['sequencia'] === 'number' &&
        typeof campos['versaoSchema'] === 'number'
    );
}

// ---------------------------------------------------------------------------
// serviço -> gateway
// ---------------------------------------------------------------------------

/**
 * Média de um sensor numa janela de tempo.
 *
 * `soma` e `quantidade` já foram resolvidos: quem recebe tem o número pronto
 * para exibir. `minimo` e `maximo` vêm de graça no acumulador.
 */
export interface ResultadoMedia {
    readonly tipoMensagem: 'media';
    readonly idSensor: string;
    readonly unidade: string;
    /** Início da janela, em ISO 8601 (UTC), alinhado a um múltiplo de `janelaMs`. */
    readonly janelaInicio: string;
    readonly janelaMs: number;
    readonly media: number;
    readonly quantidade: number;
    readonly minimo: number;
    readonly maximo: number;
    readonly versaoSchema: number;
}

export function ehResultadoMedia(valor: unknown): valor is ResultadoMedia {
    if (typeof valor !== 'object' || valor === null) {
        return false;
    }

    const campos = valor as Record<string, unknown>;

    return (
        campos['tipoMensagem'] === 'media' &&
        typeof campos['idSensor'] === 'string' &&
        typeof campos['unidade'] === 'string' &&
        typeof campos['janelaInicio'] === 'string' &&
        typeof campos['janelaMs'] === 'number' &&
        typeof campos['media'] === 'number' &&
        Number.isFinite(campos['media']) &&
        typeof campos['quantidade'] === 'number' &&
        typeof campos['minimo'] === 'number' &&
        typeof campos['maximo'] === 'number' &&
        typeof campos['versaoSchema'] === 'number'
    );
}

// ---------------------------------------------------------------------------
// gateway -> servidor
// ---------------------------------------------------------------------------

/**
 * Medias que o gateway envia ao servidor.
 *
 * Mesma mensagem serve para os dois casos: com um item é uma média nova
 * chegando; com a lista inteira é o histórico completo, que o gateway manda ao
 * (re)conectar para o servidor se reconstruir depois de um reinício.
 */
export interface AtualizacaoDeMedias {
    readonly tipoMensagem: 'atualizacao';
    readonly idGateway: string;
    readonly medias: readonly ResultadoMedia[];
}

export function ehAtualizacaoDeMedias(valor: unknown): valor is AtualizacaoDeMedias {
    if (typeof valor !== 'object' || valor === null) {
        return false;
    }

    const campos = valor as Record<string, unknown>;
    const medias = campos['medias'];

    return (
        campos['tipoMensagem'] === 'atualizacao' &&
        typeof campos['idGateway'] === 'string' &&
        Array.isArray(medias) &&
        medias.every((media: unknown) => ehResultadoMedia(media))
    );
}

// ---------------------------------------------------------------------------
// cliente -> servidor
// ---------------------------------------------------------------------------

/** Pedido do cliente. Sem `idSensor`, devolve todos os sensores conhecidos. */
export interface ConsultaDeMedias {
    readonly tipoMensagem: 'consulta';
    readonly idSensor?: string;
}

export function ehConsultaDeMedias(valor: unknown): valor is ConsultaDeMedias {
    if (typeof valor !== 'object' || valor === null) {
        return false;
    }

    const campos = valor as Record<string, unknown>;
    const idSensor = campos['idSensor'];

    return (
        campos['tipoMensagem'] === 'consulta' &&
        (idSensor === undefined || typeof idSensor === 'string')
    );
}

// ---------------------------------------------------------------------------
// servidor -> cliente
// ---------------------------------------------------------------------------

/** Histórico de um sensor, com a procedência e a idade do dado. */
export interface HistoricoDeSensor {
    readonly idSensor: string;
    readonly unidade: string;
    /** Gateway de onde este histórico veio. */
    readonly origem: string;
    /** `false` quando o gateway de origem não está conectado neste momento. */
    readonly disponivel: boolean;
    /** Instante da última atualização recebida, em ISO 8601 (UTC). */
    readonly atualizadoEm: string;
    /** Medidas da mais antiga para a mais recente. */
    readonly medidas: readonly ResultadoMedia[];
}

/**
 * Resposta à consulta do cliente.
 *
 * `gatewaysDesconectados` existe para que o resultado parcial se declare
 * parcial: sem isso, o cliente concluiria que os sensores de um gateway fora do
 * ar simplesmente não existem.
 */
export interface RespostaDeMedias {
    readonly tipoMensagem: 'resposta';
    readonly geradoEm: string;
    readonly gatewaysDesconectados: readonly string[];
    readonly sensores: readonly HistoricoDeSensor[];
}
