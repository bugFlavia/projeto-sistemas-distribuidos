import { SensorBase } from './base-sensor.ts';
import { ruidoUniforme } from './random.ts';

const PRESSAO_AO_NIVEL_DO_MAR = 1013.25;


export class SensorDePressao extends SensorBase {
    readonly tipo = 'pressao' as const;

    #atual = PRESSAO_AO_NIVEL_DO_MAR;

    protected override amostrar(): number {
        this.#atual +=
            ruidoUniforme(this.aleatorio, 0.08) + (PRESSAO_AO_NIVEL_DO_MAR - this.#atual) * 0.002;

        return this.#atual;
    }
}
