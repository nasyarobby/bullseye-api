import Bull, { Queue as QueueType } from "bull";
import { Redis, RedisOptions } from "ioredis";
import mapObject from "../libs/mapObject";
import Connections from "./Connections";
import getRedis from "../libs/getRedis";
import slugify from "slugify";

class RedisConnectionNotFound extends Error {
    constructor() {
        super("Redis connection not found");
    }
}

class QueueFriendlyNameExists extends Error {
    constructor(name: string) {
        super("Queue with name " + name + " exists.")
    }
}

type QueueDataType = {
    friendlyName: string,
    queueName: string,
    connectionId: string
}

class Queues {
    declare static data: (QueueDataType & { id: string, queue: QueueType })[];
    declare redis: Redis;
    constructor() {
        this.redis = new getRedis().get();
        if (!Queues.data)
            Queues.data = [];
        return this;
    }

    async initAll() {
        const queueData = await this.redis.hgetall('queues');
        console.log(queueData)
        return mapObject(queueData, async (obj: string, k) => {
            const config = JSON.parse(obj) as QueueDataType;
            console.log({obj, k})

            const redisConnection = await new Connections().findById(config.connectionId);

            if (!redisConnection) {
                throw new RedisConnectionNotFound();
            }

            const data: (QueueDataType & { id: string, queue: QueueType }) = {
                id: k,
                connectionId: config.connectionId,
                queueName: config.queueName,
                friendlyName: config.friendlyName,
                queue: new Bull(config.queueName,
                    {
                        createClient: (type) => {
                            if (type === "bclient") {
                                const newRedisClient = redisConnection.redis.duplicate();
                                return newRedisClient;
                            }
                            else {
                                return redisConnection.redis;
                            }
                        }
                    }
                )
            }

            Queues.data.push(data);
        })
    }

    getAll() {
        return Queues.data;
    }

    findQueueByName(friendlyName: string) {
        return Queues.data.find(q => q.friendlyName === friendlyName);
    }

    findQueueById(id: string) {
        return Queues.data.find(q => q.id === id);
    }

    async addQueue(
        friendlyName: string,
        queueName: string,
        connectionId: string) {

        const redisConnection = await new Connections().findById(connectionId);

        if (!redisConnection) {
            throw new RedisConnectionNotFound();
        }

        const exists = this.findQueueByName(friendlyName);

        if (exists) {
            throw new QueueFriendlyNameExists(friendlyName)
        }

        const newQueue = new Bull(queueName, {
            createClient: (type) => {
                if (type === "bclient") {
                    const newRedisClient = redisConnection.redis.duplicate();
                    return newRedisClient;
                }
                else {
                    return redisConnection.redis;
                }
            }
        });

        const queueData: QueueDataType = {
            connectionId,
            friendlyName,
            queueName
        }

        const slug = slugify(friendlyName)
        await this.redis.hset('queues', slug, JSON.stringify(queueData))
        Queues.data.push({ 
            id: slug,
            connectionId: connectionId,
            queueName: queueName,
            friendlyName, queue: newQueue })

        return slug;
    }
}

export default Queues;