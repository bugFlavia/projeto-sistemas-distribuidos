import { SensorBase } from './base-sensor.ts';
import { PERFIS_SENSORES } from './catalog.ts';
import { ruidoUniforme } from './random.ts';
import type { Aleatorio } from './random.ts';

/**
 * Sensor de umidade relativa do ar (%).
 *
 * Caminhada aleatória com reversão à média: o valor varia devagar, mas sempre
 * puxado de volta para o centro da faixa, o que evita que ele "fuja" e fique
 * saturado no limite.
 */
export class SensorDeUmidade extends SensorBase {
    readonly tipo = 'umidade' as const;

    #atual: number;

    constructor(id: string, aleatorio: Aleatorio) {
        super(id, aleatorio);
        this.#atual = 60 + ruidoUniforme(this.aleatorio, 5);
    }

    protected override amostrar(): number {
        const { minimo, maximo } = PERFIS_SENSORES.umidade;
        const centro = (minimo + maximo) / 2;

        this.#atual += ruidoUniforme(this.aleatorio, 0.4) + (centro - this.#atual) * 0.01;

        return this.#atual;
    }
}
