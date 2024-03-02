import Bull, { JobStatus, Queue } from "bull";
import Ioredis, { RedisOptions } from "ioredis"
import fastify, { FastifyReply, FastifyRequest } from "fastify";
import { v4 as uuid } from "uuid";
import { RedisConnection } from "./@types";
const app = fastify({
  logger: {
    level: "trace",
  },
});

const redis = new Ioredis({
  host: '10.244.65.16',
  db: 0,
  password: 'redisdev',
  port: 6379,
  keyPrefix: "banteng:"
})

const redisConnections: RedisConnection[] = []

const queues: { name: string; queue: Queue }[] = [];

function mapObject<T>(obj: { [k: string]: T }, fn: (o: any, k: string, obj: object) => any) {
  const keys = Object.keys(obj);

  const ret: { [k: string]: T } = {}

  keys.forEach(k => {
    ret[k] = fn(obj[k], k, obj)
  })

  return ret;
}

redis.hgetall("redis-configs").then((data) => {
  mapObject(data, (o, id) => {
    const config = JSON.parse(o) as RedisOptions;
    app.log.info({ config }, "ID %s", id)
    redisConnections.push({
      id,
      redis: new Ioredis(config)
    })
  })
})


app.get('/connections', async (req, res) => {
  return { connections: redisConnections.map(c => ({ id: c.id, status: c.redis.status })) }
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
  const newRedis = new Ioredis({ ...req.body, lazyConnect: true });
  return newRedis.connect().then(async () => {
    const id = uuid();
    await redis.hset("redis-configs", req.body.name, JSON.stringify(req.body));
    redisConnections.push({ id, redis: newRedis })
    return { connectionId: id }
  })
})

app.get('/queues', async (req: FastifyRequest<{
  Params: {
    id: string,
    queueId: string
  }
}>, res) => {
  const queuesFromRedis = await redis.hgetall("queues");
  return {
    queues: mapObject(queuesFromRedis, (o, k) => ({
      config: JSON.parse(o),
      status: queues.find(q => q.name === k) || null
    }))
  }
})

app.post('/queues', async (req: FastifyRequest<{
  Body: {
    id: string,
    name: string,
    connectionId: string,
  }
}>, res) => {
  const conn = redisConnections.find(c => c.id === req.body.connectionId)

  if (!conn) {
    req.log.info({ redisConnections })
    throw new Error("Connection not found");
  }

  const saved = await redis.hset('queues', req.body.id, JSON.stringify(req.body))

  const exists = queues.find(q => q.name === req.body.name);

  if (!exists) {
    const queue = new Bull(req.body.name, {
      createClient: () => {
        return conn?.redis;
      }
    });
    queues.push({ name: req.body.id, queue })
    return { queue };
  }

  return { queue: exists.queue }
})

app.get('/queues/:queueId', async (req: FastifyRequest<{
  Params: {
    queueId: string
  }
}>, res) => {
  const queue = queues.find(q => q.name === req.params.queueId)
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
    res: FastifyReply
  ) => {
    let queueObj = queues.find((el) => el.name === req.params.queueName);
    if (!queueObj) {
      throw new Error("Queue not opened.")
    }

    const workers = await queueObj.queue.getWorkers();
    const jobCounts = await queueObj.queue.getJobCounts();

    return res.send({
      jobCounts,
      workers: workers.map((e) => ({
        id: e.id,
        addr: e.addr,
        laddr: e.laddr,
      })),
    });
  }
);

app.get(
  "/queues/:queueName/jobs/:status",
  async (
    req: FastifyRequest<{
      Params: {
        queueName: string;
        status: JobStatus;
      };
      Querystring: {
        clear?: boolean;
        page?: number, 
        limit?: number,
      };
    }>,
    res: FastifyReply
  ) => {
    const status = req.params.status;
    const page = req.query.page || 1;
    const limit = req.query.limit || 10;
    req.log.info(req.params.queueName);
    let queueObj = queues.find((el) => el.name === req.params.queueName);
    if (!queueObj) {
      req.log.info({ queues })
      throw new Error("Queue not opened.")
    }
    let jobCounts = 0
    switch(status) {
      case "completed":
        jobCounts =  await queueObj.queue.getCompletedCount()
        break;
      case "active":
        jobCounts =  await queueObj.queue.getActiveCount()
        break;
    }

    if(jobCounts === 0)  {
      return new Error("Unknown status")
    }

    const jobs = await queueObj.queue.getJobs([req.params.status], (page-1)*limit, (page*limit)-1);
    if (req.query.clear && req.params.status === "completed") {
      await Promise.all(jobs.map((j) => j.remove()));
    }

    return res.send({
      jobCounts,
      jobs,
    });
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
    res: FastifyReply
  ) => {
    req.log.info(req.params.queueName);
    let queueObj = queues.find((el) => el.name === req.params.queueName);
    if (!queueObj) {
      const queue = {
        name: req.params.queueName,
        queue: new Bull(req.params.queueName, {
          redis: {
            host: "localhost",
            port: 36379,
            password: "redisprod",
          },
        }),
      };

      queues.push(queue);
      queueObj = queue;
    }

    await queueObj.queue.pause();

    const isPaused = await queueObj.queue.isPaused();

    return res.send({ isPaused });
  }
);

app.get(
  "/queue/:queueName/resume",
  async (
    req: FastifyRequest<{
      Params: {
        queueName: string;
      };
    }>,
    res: FastifyReply
  ) => {
    req.log.info(req.params.queueName);
    let queueObj = queues.find((el) => el.name === req.params.queueName);
    if (!queueObj) {
      const queue = {
        name: req.params.queueName,
        queue: new Bull(req.params.queueName, {
          redis: {
            host: "localhost",
            port: 36379,
            password: "redisprod",
          },
        }),
      };

      queues.push(queue);
      queueObj = queue;
    }

    await queueObj.queue.resume();

    const isPaused = await queueObj.queue.isPaused();

    return res.send({ isPaused });
  }
);

app.listen(
  {
    host: "0.0.0.0",
    port: 3000,
  },
  (err, address) => {
    if (err) {
      app.log.fatal({ err }, "Cannot start server");
      throw new Error("Cannot start server");
    }
  }
);
