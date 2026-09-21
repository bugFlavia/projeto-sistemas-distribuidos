import { criarAleatorio } from './random.ts';
import { SensorDeLuz } from './luz.ts';
import { SensorDePresenca } from './presenca.ts';
import { SensorDePressao } from './pressao.ts';
import { SensorDeTemperatura } from './temperatura.ts';
import { SensorDeUmidade } from './umidade.ts';
import { SensorUltrassonico } from './ultrassonico.ts';
import type { Sensor, TipoSensor } from './sensor.ts';

export type { Aleatorio } from './random.ts';
export { criarAleatorio, ruidoUniforme } from './random.ts';

export type { LeituraSensor, Sensor, TipoSensor } from './sensor.ts';
export { VERSAO_SCHEMA } from './sensor.ts';

export type { PerfilSensor } from './catalog.ts';
export { PERFIS_SENSORES } from './catalog.ts';

export { SensorBase } from './base-sensor.ts';
export { SensorDeLuz } from './luz.ts';
export { SensorDePresenca } from './presenca.ts';
export { SensorDePressao } from './pressao.ts';
export { SensorDeTemperatura } from './temperatura.ts';
export { SensorDeUmidade } from './umidade.ts';
export { SensorUltrassonico } from './ultrassonico.ts';

export const SEED_PADRAO = 42;

const TIPOS_EM_ORDEM: readonly TipoSensor[] = [
    'luz',
    'umidade',
    'presenca',
    'pressao',
    'ultrassonico',
    'temperatura',
];

/**
 * Fábrica de um sensor específico.
 *
 * É o que o simulador usa: cada processo cria exatamente um sensor e roda com
 * ele. Adicionar um sensor novo é acrescentar um `case` aqui e uma entrada no
 * catálogo — nada mais no sistema precisa saber que ele existe.
 */
export function criarSensor(tipo: TipoSensor, id: string, seed: number): Sensor {
    const aleatorio = criarAleatorio(seed);

    switch (tipo) {
        case 'luz':
            return new SensorDeLuz(id, aleatorio);
        case 'umidade':
            return new SensorDeUmidade(id, aleatorio);
        case 'presenca':
            return new SensorDePresenca(id, aleatorio);
        case 'pressao':
            return new SensorDePressao(id, aleatorio);
        case 'ultrassonico':
            return new SensorUltrassonico(id, aleatorio);
        case 'temperatura':
            return new SensorDeTemperatura(id, aleatorio);
    }
}

/** Cria uma instância de cada tipo, útil para testes e para rodar tudo num processo só. */
export function criarSensores(opcoes: { seed?: number } = {}): Sensor[] {
    const seed = opcoes.seed ?? SEED_PADRAO;

    return TIPOS_EM_ORDEM.map((tipo, indice) => criarSensor(tipo, `${tipo}-01`, seed + indice + 1));
}
