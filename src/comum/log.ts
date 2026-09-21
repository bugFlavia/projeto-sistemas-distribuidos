/**
 * Log com carimbo de horário.
 *
 * O sistema roda como vários processos independentes, cada um escrevendo no
 * seu próprio terminal. Sem o horário na frente da linha não dá para
 * correlacionar o que aconteceu em cada nó, que é justamente o que se precisa
 * enxergar quando algo dá errado.
 */

/** Hora local no formato HH:MM:SS.mmm. */
export function agoraFormatado(): string {
    const agora = new Date();
    const hora = agora.toTimeString().slice(0, 8);
    const milissegundos = String(agora.getMilliseconds()).padStart(3, '0');

    return `${hora}.${milissegundos}`;
}

export function registrar(escopo: string, mensagem: string): void {
    console.log(`[${agoraFormatado()}] [${escopo}] ${mensagem}`);
}

export function registrarErro(escopo: string, mensagem: string): void {
    console.error(`[${agoraFormatado()}] [${escopo}] ${mensagem}`);
}
