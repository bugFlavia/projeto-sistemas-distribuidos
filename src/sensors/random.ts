export type Aleatorio = () => number;

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

export function ruidoUniforme(aleatorio: Aleatorio, amplitude: number): number {
    return (aleatorio() * 2 - 1) * amplitude;
}
