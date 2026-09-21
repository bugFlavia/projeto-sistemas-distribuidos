export type TipoSensor =
    | 'luz'
    | 'umidade'
    | 'presenca'
    | 'pressao'
    | 'ultrassonico'
    | 'temperatura';

export const VERSAO_SCHEMA = 1;

export interface LeituraSensor {
    readonly idSensor: string;
    readonly tipo: TipoSensor;
    readonly valor: number;
    readonly unidade: string;
    readonly timestamp: string;
    readonly sequencia: number;
    readonly versaoSchema: number;
}

export interface Sensor {
    readonly id: string;
    readonly tipo: TipoSensor;
    readonly unidade: string;
    readonly intervaloMs: number;
    ler(agora: Date): LeituraSensor;
}

/**
 * Média de um sensor numa janela de tempo.
 *
 * É a mensagem que volta do serviço de média para o gateway, no sentido inverso
 * ao da leitura. `soma` e `quantidade` já foram resolvidos aqui: o gateway
 * recebe o número pronto para exibir.
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

/**
 * Confere o formato mínimo de uma leitura.
 *
 * Fica junto do contrato, e não em cada nó, porque todo nó que recebe precisa
 * da mesma checagem. Campos desconhecidos são ignorados de propósito: é isso
 * que permite evoluir o envelope sem quebrar quem já está rodando.
 */
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

/** Confere o formato mínimo de um resultado de média. */
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
