import { PERFIS_SENSORES } from './catalog.ts';
import { VERSAO_SCHEMA } from './sensor.ts';
import type { LeituraSensor, Sensor, TipoSensor } from './sensor.ts';
import type { Aleatorio } from './random.ts';

function limitar(valor: number, minimo: number, maximo: number): number {
    return Math.min(Math.max(valor, minimo), maximo);
}

function arredondar(valor: number, casas: number): number {
    const fator = 10 ** casas;
    return Math.round(valor * fator) / fator;
}

/**
 * Comportamento comum a todos os sensores simulados.
 *
 * A base cuida do que é igual para todos: contador de sequência, contador de
 * passos, arredondamento, limite de faixa e montagem do envelope. A subclasse
 * implementa apenas `amostrar`, que é a dinâmica própria daquele sensor.
 *
 * Isso é o que mantém a expansão barata: um sensor novo escreve só a sua
 * dinâmica e herda todo o resto de graça.
 */
export abstract class SensorBase implements Sensor {
    abstract readonly tipo: TipoSensor;

    readonly id: string;
    protected readonly aleatorio: Aleatorio;

    #sequencia = 0;
    #passo = 0;

    // Campos atribuídos no corpo em vez de parameter properties
    // (`constructor(readonly id: string)`): o Node apenas *remove* os tipos, e
    // parameter properties exigiriam transformação de sintaxe. Sem isso, o
    // mesmo font roda em `node src/server.ts` e no `dist/` compilado.
    constructor(id: string, aleatorio: Aleatorio) {
        this.id = id;
        this.aleatorio = aleatorio;
    }

    get unidade(): string {
        return PERFIS_SENSORES[this.tipo].unidade;
    }

    get intervaloMs(): number {
        return PERFIS_SENSORES[this.tipo].intervaloMs;
    }

    ler(agora: Date): LeituraSensor {
        const perfil = PERFIS_SENSORES[this.tipo];
        this.#passo += 1;

        const bruto = this.amostrar(this.#passo);

        return {
            idSensor: this.id,
            tipo: this.tipo,
            valor: arredondar(limitar(bruto, perfil.minimo, perfil.maximo), perfil.casasDecimais),
            unidade: perfil.unidade,
            timestamp: agora.toISOString(),
            sequencia: this.#sequencia++,
            versaoSchema: VERSAO_SCHEMA,
        };
    }

    /** Valor bruto do sensor no passo informado. Cada subclasse define a sua dinâmica. */
    protected abstract amostrar(passo: number): number;
}
