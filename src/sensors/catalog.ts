import type { TipoSensor } from './sensor.ts';

export interface PerfilSensor {
    readonly unidade: string;
    readonly minimo: number;
    readonly maximo: number;
    readonly intervaloMs: number;
    readonly casasDecimais: number;
    readonly descricao: string;
}

export const PERFIS_SENSORES = {
    luz: {
        unidade: 'lux',
        minimo: 0,
        maximo: 2000,
        intervaloMs: 1000,
        casasDecimais: 1,
        descricao: 'Iluminância ambiente, seguindo um ciclo dia/noite.',
    },
    umidade: {
        unidade: '%',
        minimo: 20,
        maximo: 95,
        intervaloMs: 2000,
        casasDecimais: 2,
        descricao: 'Umidade relativa do ar.',
    },
    presenca: {
        unidade: '%',
        minimo: 0,
        maximo: 100,
        intervaloMs: 500,
        casasDecimais: 2,
        descricao: 'Intensidade de presença: 0 = ambiente vazio, 100 = movimento intenso.',
    },
    pressao: {
        unidade: 'hPa',
        minimo: 950,
        maximo: 1050,
        intervaloMs: 5000,
        casasDecimais: 2,
        descricao: 'Pressão atmosférica.',
    },
    ultrassonico: {
        unidade: 'cm',
        minimo: 20,
        maximo: 400,
        intervaloMs: 250,
        casasDecimais: 1,
        descricao: 'Distância medida por ultrassom até um obstáculo.',
    },
    temperatura: {
        unidade: '°C',
        minimo: 10,
        maximo: 40,
        intervaloMs: 2000,
        casasDecimais: 2,
        descricao: 'Temperatura ambiente.',
    },
} as const satisfies Record<TipoSensor, PerfilSensor>;
