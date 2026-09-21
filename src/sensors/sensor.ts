import type { LeituraSensor, TipoSensor } from '../comum/contrato.ts';

/**
 * Interface implementada por todos os sensores simulados.
 *
 * Quem consome a leitura depende só desta interface: não sabe, nem precisa
 * saber, qual sensor concreto está atrás dela.
 */
export interface Sensor {
    readonly id: string;
    readonly tipo: TipoSensor;
    readonly unidade: string;
    readonly intervaloMs: number;
    ler(agora: Date): LeituraSensor;
}
