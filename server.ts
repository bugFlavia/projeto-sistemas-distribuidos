import type { Buffer } from 'node:buffer';
import * as net from 'node:net';

const porta: number = Number(process.env['PORT'] ?? 3000);

const server: net.Server = net.createServer((socket: net.Socket) => {
    const cliente = `${socket.remoteAddress ?? 'desconhecido'}:${socket.remotePort ?? '?'}`;

    console.log(`Conexão aberta: ${cliente}`);
    socket.write(`Endereço do cliente: ${cliente}\n`);

    socket.on('data', (mensagem: Buffer) => {
        console.log(`[${cliente}] ${mensagem.toString('utf8').trimEnd()}`);
    });

    socket.on('error', (erro: Error) => {
        console.error(`Erro na conexão ${cliente}: ${erro.message}`);
    });

    socket.on('close', () =>  {
        console.log(`Conexão encerrada: ${cliente}`);
    });

});

server.on('error', (erro: NodeJS.ErrnoException) => {
    if (erro.code === 'EADDRINUSE') {
        console.error(`A porta ${porta} já está em uso.`);
    } else {
        console.error(`Erro no servidor: ${erro.message}`);
    }
    process.exitCode = 1;
});

server.listen(porta, () => {
    console.log(`Servidor rodando na porta ${porta}`);
});

for (const sinal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(sinal, () => {
        console.log(`\nRecebido ${sinal}, encerrando o servidor...`);
        server.close(() => process.exit(0));
    });
}