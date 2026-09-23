import { SensorBase } from './base-sensor.ts';
import { PERFIS_SENSORES } from './catalog.ts';
import { ruidoUniforme } from './random.ts';
import type { Aleatorio } from './random.ts';

export class SensorUltrassonico extends SensorBase {
    readonly tipo = 'ultrassonico' as const;

    #distanciaDeRepouso: number;
    #passosComObstaculo = 0;

    constructor(id: string, aleatorio: Aleatorio) {
        super(id, aleatorio);

        const { minimo, maximo } = PERFIS_SENSORES.ultrassonico;
        this.#distanciaDeRepouso = minimo + this.aleatorio() * (maximo - minimo) * 0.7;
    }

    protected override amostrar(): number {
        if (this.#passosComObstaculo > 0) {
            this.#passosComObstaculo -= 1;
            return this.#distanciaDeRepouso * (0.2 + this.aleatorio() * 0.3);
        }

        if (this.aleatorio() < 0.01) {
            this.#passosComObstaculo = 3 + Math.floor(this.aleatorio() * 15);
        }

        return this.#distanciaDeRepouso + ruidoUniforme(this.aleatorio, 1.5);
    }
}
