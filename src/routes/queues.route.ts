import { FastifyInstance, FastifyRequest } from "fastify"
import { JobStatus } from "bull"
import Queues from "../data-providers/Queues"

export default (app: FastifyInstance, config: any, done: Function) => {
    const queues = new Queues()
    queues.initAll();

    app.get('/ws/queues-stats', { websocket: true }, (conn, req) => {
        req.log.info("Client connected.");
        queues.getAll().forEach(queue => {
            req.log.info("Set event listener for global:waiting " + queue.friendlyName)
            req.log.info({ queue: queue.queue.client.options })
            queue.queue.on("global:waiting", async (id) => {
                const count = await queue.queue.getJobCounts();
                conn.socket.send(JSON.stringify({
                    id, 
                    count, queueId: queue.id, queueName: queue.friendlyName,
                    event: "waiting", type: "stats"
                }))
            })

            queue.queue.on("global:completed", async (id) => {
                const count = await queue.queue.getJobCounts();
                conn.socket.send(JSON.stringify({
                    id, 
                    count, queueId: queue.id, queueName: queue.friendlyName,
                    event: "completed", type: "stats"
                }))
            })
        })

    })

    app.get('/queues', async (req: FastifyRequest<{
        Querystring: {
            stats: true
        }
    }>, res) => {
        const q = queues.getAll();

        if (req.query.stats) {
            return {
                queues: await Promise.all(q.map(async (qq) => {
                    try {
                        if (qq.queue.client.status !== "ready") {
                            throw new Error("Client is not ready")
                        }
                        const [workers, jobCounts] = await Promise.all(
                            [
                                qq.queue.getWorkers(),
                                qq.queue.getJobCounts()]);
                        return {
                            ...qq,
                            stats: {
                                jobCounts,
                                workers: workers.map((e) => ({
                                    id: e.id,
                                    addr: e.addr,
                                    laddr: e.laddr,
                                })),
                            }
                        }
                    } catch (err) {
                        return {
                            ...qq,
                            stats: {}
                        }
                    }
                }))
            }
        }
        else {
            return { queues: q }
        }
    })

    app.post('/queues', async (req: FastifyRequest<{
        Body: {
            id: string,
            queueName: string,
            connectionId: string,
            dataFields?: {
                columnName: string
                jsonPath: string
            }[]
        }
    }>, res) => {
        return queues.addQueue(req.body.id, req.body.queueName, req.body.connectionId, req.body.dataFields)
    })

    app.put('/queue/:queueId', async (req: FastifyRequest<{
        Params: {
            queueId: string
        }
    }>, res) => {
        const queue = queues.findQueueById(req.params.queueId)
        if (!queue) {
            req.log.info({ queues })
            throw new Error("Queue not found.")
        }
        await queue.queue.close();
    })

    app.get('/queues/:queueId', async (req: FastifyRequest<{
        Params: {
            queueId: string
        }
    }>, res) => {
        const queue = queues.findQueueById(req.params.queueId)

        if (!queue) {
            req.log.info({ queues })
            throw new Error("Queue not found.")
        }
        return queue;
    })

    app.get(
        "/queues/:queueId/stats",
        async (
            req: FastifyRequest<{
                Params: {
                    queueId: string;
                };
            }>,
            res
        ) => {
            let queueObj = queues.findQueueById(req.params.queueId);
            if (!queueObj) {
                throw new Error("Queue not found.")
            }

            const workers = await queueObj.queue.getWorkers();
            const jobCounts = await queueObj.queue.getJobCounts();

            return {
                jobCounts,
                workers: workers.map((e) => ({
                    id: e.id,
                    addr: e.addr,
                    laddr: e.laddr,
                })),
            }
        }
    );

    app.get(
        "/queues/:queueId/jobs/:status",
        async (
            req: FastifyRequest<{
                Params: {
                    queueId: string;
                    status: JobStatus;
                };
                Querystring: {
                    clear?: boolean;
                    page?: number,
                    limit?: number,
                };
            }>,
            res
        ) => {
            const status = req.params.status;
            const page = req.query.page || 1;
            const limit = req.query.limit || 10;
            req.log.info(req.params.queueId);
            let queueObj = queues.findQueueById(req.params.queueId);
            if (!queueObj) {
                req.log.info({ queues })
                throw new Error("Queue not opened.")
            }
            let jobCounts: null | number = null
            switch (status) {
                case "completed":
                    jobCounts = await queueObj.queue.getCompletedCount()
                    break;
                case "active":
                    jobCounts = await queueObj.queue.getActiveCount()
                    break;
                case "delayed":
                    jobCounts = await queueObj.queue.getDelayedCount()
                    break;
                case "waiting":
                    jobCounts = await queueObj.queue.getWaitingCount()
                    break;
                case "failed":
                    jobCounts = await queueObj.queue.getFailedCount()
                    break;
                case "paused":
                    jobCounts = await queueObj.queue.getPausedCount()
                    break;
            }

            if (jobCounts === null) {
                return new Error("Unknown status")
            }

            const jobs = await queueObj.queue.getJobs([req.params.status], (page - 1) * limit, (page * limit) - 1);
            if (req.query.clear && req.params.status === "completed") {
                await Promise.all(jobs.map((j) => j.remove()));
            }

            return {
                dataFields: queueObj.dataFields,
                jobCounts,
                jobs,
            }
        }
    );

    app.get(
        "/queue/:queueName/pause",
        async (
            req: FastifyRequest<{
                Params: {
                    queueName: string;
                };
            }>,
            res
        ) => {
            req.log.info(req.params.queueName);
            let queueObj = queues.findQueueByName(req.params.queueName);

            if (!queueObj) {
                throw new Error("Queue not found.")
            }

            await queueObj.queue.pause();

            const isPaused = await queueObj.queue.isPaused();

            return { isPaused }
        }
    );

    app.get(
        "/queue/:queueName/resume",
        async (
            req: FastifyRequest<{
                Params: {
                    queueName: string;
                };
            }>
        ) => {
            req.log.info(req.params.queueName);
            let queueObj = queues.findQueueByName(req.params.queueName);

            if (!queueObj) {
                throw new Error("Queue not found")
            }

            await queueObj.queue.resume();

            const isPaused = await queueObj.queue.isPaused();
            return { isPaused };
        }
    );

    done();
}