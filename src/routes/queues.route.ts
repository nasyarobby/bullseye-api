import { FastifyInstance, FastifyRequest } from "fastify"
import { JobStatus } from "bull"
import Queues from "../data-providers/Queues"

export default (app: FastifyInstance, config: any, done: Function) => {
    const queues = new Queues()

    queues.initAll();

    app.get('/queues', async (req, res) => {
        return { queues: queues.getAll() };
    })

    app.post('/queues', async (req: FastifyRequest<{
        Body: {
            id: string,
            name: string,
            connectionId: string,
        }
    }>, res) => {
        return queues.addQueue(req.body.id, req.body.name, req.body.connectionId)
    })

    app.get('/queues/:queueId', async (req: FastifyRequest<{
        Params: {
            queueId: string
        }
    }>, res) => {
        const queue = queues.findQueueByName(req.params.queueId)

        if (!queue) {
            req.log.info({ queues })
            throw new Error("Not found.")
        }
        const workers = await queue.queue.getWorkers();
        return {
            workers,
            queue: queue.queue,
        }
    })

    app.get(
        "/queues/:queueName/stats",
        async (
            req: FastifyRequest<{
                Params: {
                    queueName: string;
                };
            }>,
            res
        ) => {
            let queueObj = queues.findQueueByName(req.params.queueName);
            if (!queueObj) {
                throw new Error("Queue not opened.")
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
                case "failed":
                    jobCounts = await queueObj.queue.getFailedCount()
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