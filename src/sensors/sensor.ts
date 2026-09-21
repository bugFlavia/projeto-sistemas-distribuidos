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
