import { SensorBase } from './base-sensor.ts';
import { PERFIS_SENSORES } from './catalog.ts';
import { ruidoUniforme } from './random.ts';

export class SensorDeLuz extends SensorBase {
    readonly tipo = 'luz' as const;

    protected override amostrar(passo: number): number {
        const { maximo } = PERFIS_SENSORES.luz;

        const cicloDia = Math.max(0, Math.sin((2 * Math.PI * passo) / 3600)) * maximo;

        return cicloDia + ruidoUniforme(this.aleatorio, 15);
    }
}
