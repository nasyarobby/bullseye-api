import { FastifyInstance, FastifyRequest } from "fastify"
import PM2Central from "../libs/pm2"

export default (app: FastifyInstance, config: any, done: Function) => {

    app.get('/ws/pm2/:stream',
        { websocket: true },
        async (conn, req: FastifyRequest<{Params: {
            stream: string
        }}>) => {
            req.log.info({stream: req.params.stream},"Opening stream..")
            const central = new PM2Central("Central", {
                stream: req.params.stream,
                onMessage(msg) {
                    app.log.info({ msg }, "PM2 received message");
                    conn.socket.send(JSON.stringify({msg}))
                },
            })

            central.listen();
            conn.on('data', (data) => {
                const cmd =  Buffer.from(data).toString()
                app.log.info({cmd: cmd});

                central.sendCommand(JSON.parse(cmd))
            })
        })
    done();
}