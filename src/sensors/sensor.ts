/**
 * Contrato de dados compartilhado por todo o sistema distribuído.
 *
 * O simulador, o edge, o fog e o serviço de média falam apenas este formato.
 * Adicionar um sensor novo não deve exigir mudança em nenhum dos consumidores.
 */

/**
 * Tipos de sensor suportados pela simulação.
 *
 * Todos são quantitativos: `valor` é sempre um número, então a média de um
 * sensor é sempre uma média aritmética simples.
 */
export type TipoSensor =
    | 'luz'
    | 'umidade'
    | 'presenca'
    | 'pressao'
    | 'ultrassonico'
    | 'temperatura';

/**
 * Versão do envelope de dados.
 *
 * Suba este número sempre que a mudança quebrar compatibilidade, para que os
 * consumidores consigam detectar versões que não sabem interpretar.
 */
export const VERSAO_SCHEMA = 1;

/**
 * Leitura individual de um sensor.
 *
 * A leitura é auto-descritiva: carrega unidade, tipo e instante, de modo que
 * quem recebe não precisa consultar o catálogo nem conhecer o emissor.
 */
export interface LeituraSensor {
    /** Identidade da instância simulada (ex.: "temperatura-01"). */
    readonly idSensor: string;
    readonly tipo: TipoSensor;
    /** Valor quantitativo medido. */
    readonly valor: number;
    /** Unidade de `valor` (lux, %, hPa, cm, °C). */
    readonly unidade: string;
    /** Instante da leitura em ISO 8601 (UTC). */
    readonly timestamp: string;
    /**
     * Contador monotônico por sensor, começando em zero.
     *
     * Permite detectar perda (salto) e reordenação (valor repetido ou fora de
     * ordem) sem depender de relógio sincronizado.
     */
    readonly sequencia: number;
    readonly versaoSchema: number;
}

/**
 * Interface implementada por todos os sensores simulados.
 *
 * Quem consome a leitura depende só desta interface: não sabe (nem precisa
 * saber) qual sensor concreto está atrás dela.
 */
export interface Sensor {
    /** Identidade estável da instância. */
    readonly id: string;
    readonly tipo: TipoSensor;
    readonly unidade: string;
    /** Intervalo nominal entre amostras, em milissegundos. */
    readonly intervaloMs: number;
    /**
     * Produz a próxima leitura.
     *
     * O instante vem de fora para que o relógio fique centralizado em quem
     * simula: o sensor é uma função determinística do seu estado interno e da
     * sua seed.
     */
    ler(agora: Date): LeituraSensor;
}
