import { SensorBase } from './base-sensor.ts';
import { ruidoUniforme } from './random.ts';
import type { Aleatorio } from './random.ts';

const TEMPERATURA_BASE = 24;

/**
 * Sensor de temperatura ambiente (°C).
 *
 * Combina duas componentes: uma caminhada aleatória com reversão à média
 * (variação de curto prazo) e um ciclo térmico lento (aquecimento e
 * resfriamento ao longo do dia).
 */
export class SensorDeTemperatura extends SensorBase {
    readonly tipo = 'temperatura' as const;

    #atual: number;

    constructor(id: string, aleatorio: Aleatorio) {
        super(id, aleatorio);
        this.#atual = TEMPERATURA_BASE + ruidoUniforme(this.aleatorio, 1);
    }

    protected override amostrar(passo: number): number {
        this.#atual +=
            ruidoUniforme(this.aleatorio, 0.05) + (TEMPERATURA_BASE - this.#atual) * 0.01;

        const cicloTermico = 2 * Math.sin((2 * Math.PI * passo) / 7200);

        return this.#atual + cicloTermico;
    }
}
