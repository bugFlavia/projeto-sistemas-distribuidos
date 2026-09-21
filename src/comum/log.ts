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
