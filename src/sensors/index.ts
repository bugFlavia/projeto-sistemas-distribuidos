import { criarAleatorio } from './random.ts';
import { SensorDeLuz } from './luz.ts';
import { SensorDePresenca } from './presenca.ts';
import { SensorDePressao } from './pressao.ts';
import { SensorDeTemperatura } from './temperatura.ts';
import { SensorDeUmidade } from './umidade.ts';
import { SensorUltrassonico } from './ultrassonico.ts';
import type { Sensor } from './sensor.ts';

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

/**
 * Seed padrão da simulação.
 *
 * Fixa de propósito: com a mesma seed, qualquer um que rode o projeto gera
 * exatamente o mesmo fluxo de leituras, o que torna a apresentação e os testes
 * reproduzíveis. Para variar a cada execução, passe `seed: Date.now()`.
 */
export const SEED_PADRAO = 42;

/**
 * Cria uma instância de cada sensor simulado.
 *
 * Adicionar um sensor novo é acrescentar uma linha aqui mais a classe
 * correspondente: nenhum consumidor das leituras precisa mudar. Cada sensor
 * recebe a sua própria sequência aleatória, para que o consumo de números de
 * um não altere o comportamento dos outros.
 */
export function criarSensores(opcoes: { seed?: number } = {}): Sensor[] {
    const seed = opcoes.seed ?? SEED_PADRAO;

    return [
        new SensorDeLuz('luz-01', criarAleatorio(seed + 1)),
        new SensorDeUmidade('umidade-01', criarAleatorio(seed + 2)),
        new SensorDePresenca('presenca-01', criarAleatorio(seed + 3)),
        new SensorDePressao('pressao-01', criarAleatorio(seed + 4)),
        new SensorUltrassonico('ultrassonico-01', criarAleatorio(seed + 5)),
        new SensorDeTemperatura('temperatura-01', criarAleatorio(seed + 6)),
    ];
}
