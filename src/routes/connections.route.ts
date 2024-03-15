import { FastifyInstance, FastifyRequest } from "fastify"
import Connections from "../data-providers/Connections"

export default (app: FastifyInstance, config: any, done: Function) => {
    const conn = new Connections();

    conn.init();

    app.get('/connections', async (req, res) => {
        return {
            connections: conn.getConnections().map(c => {
                console.log(c)
                return { id: c.id, config: c.config, status: c.redis.status }
            })
        }
    })

    app.get('/connections/:name', async (req: FastifyRequest<{
        Params: {
            name: string
        }
    }>, res) => {
        const connection = await conn.findById(req.params.name)

        if (connection) {
            return { connection }
        }

        res.callNotFound();
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

    app.post('/connections/:name', async (req: FastifyRequest<{
        Params: {
            name: string
        }
        Body: {
            name: string,
            db: number,
            host: string,
            port: number,
            password: string,
        }
    }>, res) => {
        const id = await conn.updateConnection(req.params.name, req.body);
        return {
            id
        }
    })

    app.post('/connections/:name/connect', async (req: FastifyRequest<{
        Params: {
            name: string
        }
    }>, res) => {
        const id = await conn.connect(req.params.name);
        return {
            id
        }
    })

    app.post('/connections/:name/disconnect', async (req: FastifyRequest<{
        Params: {
            name: string
        }
    }>, res) => {
        const id = await conn.disconnect(req.params.name);
        return {
            id
        }
    })

    app.delete('/connections/:name', async (req: FastifyRequest<{
        Params: {
            name: string
        }
    }>, res) => {
        const id = await conn.removeConnection(req.params.name);
        return {
            id
        }
    })

    done();
}