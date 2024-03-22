import { FastifyInstance, FastifyRequest } from "fastify"
import { Job, JobOptions, JobStatus, JobStatusClean } from "bull"
import Queues from "../data-providers/Queues"

export default (app: FastifyInstance, config: any, done: Function) => {
    const queues = new Queues()
    queues.initAll();

    app.get('/ws/queues-stats', { websocket: true }, (conn, req) => {
        req.log.info("Client connected.");
        queues.getAll().forEach(queue => {
            if (queue.queue.client.status !== 'ready') {
                return undefined;
            }
            req.log.info("Set event listener for global:waiting. Queue: " + queue.friendlyName)
            req.log.info({ queue: queue.queue.client.options })
            queue.queue.on("global:waiting", async (id) => {
                const count = await queue.queue.getJobCounts();
                conn.socket.send(JSON.stringify({
                    id,
                    count, queueId: queue.id, queueName: queue.friendlyName,
                    event: "waiting", type: "stats"
                }))
            })

            queue.queue.on("global:active", async (id) => {
                const count = await queue.queue.getJobCounts();
                conn.socket.send(JSON.stringify({
                    id,
                    count, queueId: queue.id, queueName: queue.friendlyName,
                    event: "active", type: "stats"
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

    app.get('/ws/queues-stats/:name', { websocket: true }, async (conn, req: FastifyRequest<{
        Params: {
            name: string
        }
    }>) => {
        req.log.info("Client connected.");
        const queue = queues.findQueueBySlug(req.params.name);


        if (queue) {
            const expiringListKey: string = "bull-workers:" + queue.queueName;

            const workers = await queue.queue.client.zrange(expiringListKey, 0, -1);
            const initialData = await Promise.all(workers.map(w => {
                return {
                    name: w,
                    job: ""
                }
            }))
            conn.socket.send(JSON.stringify({ type: "workers", data: { workers: initialData } }))
            queue.queue.on("global:active", async (id) => {
                const workers = await queue.queue.client.zrange(expiringListKey, 0, -1);
                const data = await Promise.all(workers.map(w => {
                    return queue.queue.client.get(expiringListKey + ':' + w).then(data => {
                        return { name: w, job: data }
                    })
                }))
                conn.socket.send(JSON.stringify({ type: "onActive", data: { id, workers: data } }))
            })

            queue.queue.on("global:completed", async (id, returnValue) => {
                const workers = await queue.queue.client.zrange(expiringListKey, 0, -1);
                const data = await Promise.all(workers.map(w => {
                    return queue.queue.client.get(expiringListKey + ':' + w).then(data => {
                        return { name: w, job: data }
                    })
                }))
                conn.socket.send(JSON.stringify({ type: "onCompleted", data: { id, workers: data, returnValue } }))
            })

            queue.queue.on("global:failed", async (id) => {
                const workers = await queue.queue.client.zrange(expiringListKey, 0, -1);
                const data = await Promise.all(workers.map(w => {
                    return queue.queue.client.get(expiringListKey + ':' + w).then(data => {
                        return { name: w, job: data }
                    })
                }))
                conn.socket.send(JSON.stringify({ type: "onFailed", data: { id, workers: data } }))
            })
        }
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
                                qq.queue.getJobCounts()
                            ]
                        );
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
            friendlyName: string,
            queueName: string,
            connectionId: string,
            dataFields?: {
                columnName: string
                jsonPath: string
            }[]
        }
    }>, res) => {
        return queues.addQueue(req.body.friendlyName, req.body.queueName, req.body.connectionId, req.body.dataFields)
    })

    app.post('/queues/:slug', async (req: FastifyRequest<{
        Params: {
            slug: string
        }
        Body: {
            friendlyName: string,
            queueName: string,
            connectionId: string,
            dataFields?: {
                columnName: string
                jsonPath: string
            }[]
        }
    }>, res) => {
        const queue = queues.findQueueBySlug(req.params.slug)
        if (!queue) {
            req.log.info({ queues })
            throw new Error("Queue not found.")
        }
        await queues.updateQueueById(req.params.slug, req.body);
    })

    app.delete('/queues/:slug', async (req: FastifyRequest<{
        Params: {
            slug: string
        }
    }>, res) => {
        const queue = queues.findQueueBySlug(req.params.slug)
        if (!queue) {
            req.log.info({ queues })
            throw new Error("Queue not found.")
        }
        await queues.removeQueueBySlug(req.params.slug);
        return {
            queue
        }
    })

    app.post('/queues/:slug/resume', async (req: FastifyRequest<{
        Params: {
            slug: string
        }
        Body: {
            friendlyName: string,
            queueName: string,
            connectionId: string,
            dataFields?: {
                columnName: string
                jsonPath: string
            }[]
        }
    }>, res) => {
        const queue = queues.findQueueBySlug(req.params.slug)
        if (!queue) {
            req.log.info({ queues })
            throw new Error("Queue not found.")
        }
        await queue.queue.resume();
        return {
            id: queue.id,
            slug: queue.slug,
            isPaused: false
        };
    })

    app.post('/queues/:slug/pause', async (req: FastifyRequest<{
        Params: {
            slug: string
        }
        Body: {
            friendlyName: string,
            queueName: string,
            connectionId: string,
            dataFields?: {
                columnName: string
                jsonPath: string
            }[]
        }
    }>, res) => {
        const queue = queues.findQueueBySlug(req.params.slug)
        if (!queue) {
            req.log.info({ queues })
            throw new Error("Queue not found.")
        }
        await queue.queue.pause();
        return {
            id: queue.id,
            slug: queue.slug,
            isPaused: true
        };
    })

    app.post('/queues/:slug/empty', async (req: FastifyRequest<{
        Params: {
            slug: string
        }
    }>, res) => {
        const queue = queues.findQueueBySlug(req.params.slug)
        if (!queue) {
            req.log.info({ queues })
            throw new Error("Queue not found.")
        }
        await queue.queue.empty();
        return {
            id: queue.id,
            slug: queue.slug,
            emptied: true
        };
    })

    app.post('/queues/:slug/clean', async (req: FastifyRequest<{
        Params: {
            slug: string
        }
        Body: {
            status: string,
            graceMs: number,
        }
    }>, res) => {
        const queue = queues.findQueueBySlug(req.params.slug)
        if (!queue) {
            req.log.info({ queues })
            throw new Error("Queue not found.")
        }
        await queue.queue.clean(req.body.graceMs || 0, (req.body.status || 'completed') as JobStatusClean);
        return {
            id: queue.id,
            slug: queue.slug,
            cleaned: true
        };
    })

    app.post('/queues/:slug/remove-jobs', async (req: FastifyRequest<{
        Params: {
            slug: string
        }
        Body: {
            pattern: string,
        }
    }>, res) => {
        const queue = queues.findQueueBySlug(req.params.slug)
        if (!queue) {
            req.log.info({ queues })
            throw new Error("Queue not found.")
        }
        req.log.info({ pattern: req.body.pattern }, "Removing job by pattern")
        await queue.queue.removeJobs(req.body.pattern);
        return {
            id: queue.id,
            slug: queue.slug,
            obliterated: true
        };
    })

    app.post('/queues/:slug/obliterate', async (req: FastifyRequest<{
        Params: {
            slug: string
        }
        Body: {
            force: boolean,
        }
    }>, res) => {
        const queue = queues.findQueueBySlug(req.params.slug)
        if (!queue) {
            req.log.info({ queues })
            throw new Error("Queue not found.")
        }
        await queue.queue.obliterate({ force: req.body?.force || false });
        return {
            id: queue.id,
            slug: queue.slug,
            obliterated: true
        };
    })

    app.get('/queues/:slug/is-paused', async (req: FastifyRequest<{
        Params: {
            slug: string
        }
        Body: {
            friendlyName: string,
            queueName: string,
            connectionId: string,
            dataFields?: {
                columnName: string
                jsonPath: string
            }[]
        }
    }>, res) => {
        const queue = queues.findQueueBySlug(req.params.slug)
        if (!queue) {
            req.log.info({ queues })
            throw new Error("Queue not found.")
        }
        const isPaused = await queue.queue.isPaused();
        return {
            id: queue.id,
            slug: queue.slug,
            isPaused
        };
    })

    app.post('/queues/:slug/create-job', async (req: FastifyRequest<{
        Params: {
            slug: string
        }
        Body: {
            data: object,
            opts?: JobOptions
        }
    }>, res) => {
        const queue = queues.findQueueBySlug(req.params.slug)
        if (!queue) {
            req.log.info({ queues })
            throw new Error("Queue not found.")
        }
        const job = await queue.queue.add(req.body.data, req.body.opts);
        return {
            id: queue.id,
            slug: queue.slug,
            job: {
                id: job.id
            }
        };
    })

    app.get('/queues/:slug', async (req: FastifyRequest<{
        Params: {
            slug: string
        }
    }>, res) => {
        const queue = queues.findQueueBySlug(req.params.slug)

        if (!queue) {
            req.log.info({ queues })
            throw new Error("Queue not found.")
        }
        return queue;
    })

    app.get('/queues/:slug/jobs/:jobId', async (req: FastifyRequest<{
        Params: {
            slug: string,
            jobId: string
        }
    }>, res) => {
        const queue = queues.findQueueBySlug(req.params.slug)

        if (!queue) {
            req.log.info({ queues })
            throw new Error("Queue not found.")
        }

        return queue.queue.getJob(req.params.jobId);
    })

    app.delete('/queues/:slug/jobs/:jobId', async (req: FastifyRequest<{
        Params: {
            slug: string,
            jobId: string
        }
    }>, res) => {
        const queue = queues.findQueueBySlug(req.params.slug)

        if (!queue) {
            req.log.info({ queues })
            throw new Error("Queue not found.")
        }

        const job = await queue.queue.getJob(req.params.jobId);

        if (!job) {
            throw new Error("Job not found")
        }

        await job.remove();
        return { "ok": true }
    })

    app.get("/queues/:queueId/stats",
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

    app.get("/queues/:slug/jobs",
        async (
            req: FastifyRequest<{
                Params: {
                    slug: string;
                };
                Querystring: {
                    status?: JobStatus;
                    clear?: boolean;
                    page?: number,
                    limit?: number,
                };
            }>,
            res
        ) => {
            const status = req.query.status || 'completed';
            const page = req.query.page || 1;
            const limit = req.query.limit || 10;
            req.log.info(req.params.slug);
            let queueObj = queues.findQueueBySlug(req.params.slug);
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

            const jobs = await queueObj.queue.getJobs([status], (page - 1) * limit, (page * limit) - 1);
            if (req.query.clear && status === "completed") {
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