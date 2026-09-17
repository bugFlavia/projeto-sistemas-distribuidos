/** Fonte de números pseudoaleatórios no intervalo [0, 1). */
export type Aleatorio = () => number;

/**
 * PRNG determinístico (mulberry32).
 *
 * A mesma seed produz exatamente a mesma sequência de leituras. Isso torna a
 * simulação reproduzível: dois nós que recebem a mesma seed geram o mesmo
 * fluxo, o que ajuda a testar e a demonstrar o sistema sem depender de sorte.
 */
export function criarAleatorio(seed: number): Aleatorio {
    let estado = seed >>> 0;

    return () => {
        estado = (estado + 0x6d2b79f5) >>> 0;
        let t = estado;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** Ruído uniforme em `[-amplitude, +amplitude]`. */
export function ruidoUniforme(aleatorio: Aleatorio, amplitude: number): number {
    return (aleatorio() * 2 - 1) * amplitude;
}
