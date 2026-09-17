import { SensorBase } from './base-sensor.ts';
import { PERFIS_SENSORES } from './catalog.ts';
import { ruidoUniforme } from './random.ts';

/**
 * Sensor de luz (lux).
 *
 * Segue um ciclo dia/noite em vez de uma caminhada aleatória, porque o sinal
 * tem uma componente previsível dominante. O ciclo é medido em passos, não no
 * relógio, para que a simulação continue reproduzível.
 */
export class SensorDeLuz extends SensorBase {
    readonly tipo = 'luz' as const;

    protected override amostrar(passo: number): number {
        const { maximo } = PERFIS_SENSORES.luz;

        // Um ciclo completo a cada 3600 passos (1 h com o intervalo nominal).
        const cicloDia = Math.max(0, Math.sin((2 * Math.PI * passo) / 3600)) * maximo;

        return cicloDia + ruidoUniforme(this.aleatorio, 15);
    }
}
