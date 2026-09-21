import { SensorBase } from './base-sensor.ts';
import { ruidoUniforme } from './random.ts';

export class SensorDePresenca extends SensorBase {
    readonly tipo = 'presenca' as const;

    #intensidadeAtual = 0;
    #passosRestantesNaRajada = 0;

    protected override amostrar(): number {
        if (this.#passosRestantesNaRajada > 0) {
            this.#passosRestantesNaRajada -= 1;
            this.#intensidadeAtual = Math.max(
                0,
                this.#intensidadeAtual * 0.85 + ruidoUniforme(this.aleatorio, 3),
            );
            return this.#intensidadeAtual;
        }

        if (this.aleatorio() < 0.02) {
            this.#passosRestantesNaRajada = 5 + Math.floor(this.aleatorio() * 25);
            this.#intensidadeAtual = 40 + this.aleatorio() * 60;
            return this.#intensidadeAtual;
        }

        this.#intensidadeAtual = Math.max(0, ruidoUniforme(this.aleatorio, 1.5));
        return this.#intensidadeAtual;
    }
}
