import { FastifyInstance, FastifyRequest } from "fastify"
import connections from "../data-providers/Connections"
import Connections from "../data-providers/Connections"

export default (app: FastifyInstance, config: any, done: Function) => {
    const conn = new Connections();

    conn.init();

    app.get('/connections', async (req, res) => {
        return { connections: conn.getConnections().map(c => ({ ...c, status: c.redis.status })) }
    })

    app.post('/connections', async (req: FastifyRequest<{
        Body: {
            name: string,
            db: number,
            host: string,
            port: number,
            password: string,
        }
    }>, res) => {
        const id = await conn.addConnection(req.body);
        return {
            id
        }
    })

    done();
}