import { SensorBase } from './base-sensor.ts';
import { ruidoUniforme } from './random.ts';

/**
 * Sensor de presença (%).
 *
 * Modelado como intensidade de movimento, e não como booleano, para que a
 * média continue fazendo sentido: 0 significa ambiente vazio e 100 movimento
 * intenso. A média ao longo de uma janela vira, assim, a taxa média de
 * ocupação do ambiente.
 *
 * O comportamento é intermitente: na maior parte do tempo o ambiente está
 * vazio e, de vez em quando, alguém passa e o sinal sobe por alguns passos.
 */
export class SensorDePresenca extends SensorBase {
    readonly tipo = 'presenca' as const;

    #intensidadeAtual = 0;
    #passosRestantesNaRajada = 0;

    protected override amostrar(): number {
        if (this.#passosRestantesNaRajada > 0) {
            this.#passosRestantesNaRajada -= 1;
            // Decaimento suave até voltar ao repouso.
            this.#intensidadeAtual = Math.max(
                0,
                this.#intensidadeAtual * 0.85 + ruidoUniforme(this.aleatorio, 3),
            );
            return this.#intensidadeAtual;
        }

        // Chance pequena de começar uma rajada de movimento.
        if (this.aleatorio() < 0.02) {
            this.#passosRestantesNaRajada = 5 + Math.floor(this.aleatorio() * 25);
            this.#intensidadeAtual = 40 + this.aleatorio() * 60;
            return this.#intensidadeAtual;
        }

        this.#intensidadeAtual = Math.max(0, ruidoUniforme(this.aleatorio, 1.5));
        return this.#intensidadeAtual;
    }
}
