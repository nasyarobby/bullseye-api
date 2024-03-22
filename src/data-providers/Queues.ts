import Bull, { Queue as QueueType } from "bull";
import { Redis, RedisOptions } from "ioredis";
import mapObject from "../libs/mapObject";
import Connections from "./Connections";
import getRedis from "../libs/getRedis";
import slugify from "slugify";
import { v4 as uuid } from "uuid";

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
    id: string,
    slug: string,
    friendlyName: string,
    queueName: string,
    connectionId: string
    dataFields?: { columnName: string, jsonPath: string }[]
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
        return mapObject(queueData, async (obj: string, k) => {
            const config = JSON.parse(obj) as QueueDataType;

            const redisConnection = await new Connections().findById(config.connectionId);

            if (!redisConnection) {
                // throw new RedisConnectionNotFound();
                return;
            }

            const data: (QueueDataType & { queue: QueueType }) = {
                id: k,
                slug: config.slug,
                connectionId: config.connectionId,
                queueName: config.queueName,
                friendlyName: config.friendlyName,
                dataFields: config.dataFields,
                queue: new Bull(config.queueName,
                    {
                        createClient: (type) => {
                            switch (type) {
                                case 'client':
                                    if (!redisConnection.redis) {
                                        redisConnection.redis = new Redis({
                                            ...redisConnection.config,
                                            enableReadyCheck: false,
                                            maxRetriesPerRequest: null
                                        })
                                    }
                                    return redisConnection.redis;
                                case 'subscriber':
                                    if (!redisConnection.subscriber) {
                                        redisConnection.subscriber = new Redis({
                                            ...redisConnection.config,
                                            enableReadyCheck: false,
                                            maxRetriesPerRequest: null
                                        })
                                    }
                                    return redisConnection.subscriber;
                                case 'bclient':
                                    const newRedis = new Redis({
                                        ...redisConnection.config,
                                        enableReadyCheck: false,
                                        maxRetriesPerRequest: null
                                    })

                                    redisConnection.bclient.push(newRedis);
                                    return newRedis;
                                default:
                                    throw new Error('Unexpected connection type: ' + type);
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

    findQueueBySlug(slug: string) {
        return Queues.data.find(q => q.slug === slug);
    }

    async addQueue(
        friendlyName: string,
        queueName: string,
        connectionId: string,
        dataFields?: { columnName: string, jsonPath: string }[]) {

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
        const id = uuid();
        const slug = slugify(friendlyName)

        const queueData: QueueDataType = {
            id,
            slug,
            connectionId,
            friendlyName,
            queueName,
            dataFields,
        }

        await this.redis.hset('queues', id, JSON.stringify(queueData))
        Queues.data.push({
            id,
            slug,
            connectionId: connectionId,
            queueName: queueName,
            friendlyName, 
            queue: newQueue,
            dataFields,
        })

        return slug;
    }

    async removeQueueBySlug(slug: string) {
        const queue = this.findQueueBySlug(slug)

        if (!queue) throw new Error("Queue not found.");

        await queue.queue.close();

        await this.redis.hdel('queues', queue.id);

        Queues.data = Queues.data.filter(q => q.id !== queue.id);

        return queue.id;
    }

    async updateQueueById(id: string, updatedData: {
        friendlyName: string,
        queueName: string,
        connectionId: string,
        dataFields?: { columnName: string, jsonPath: string }[]
    }) {
        const redisConnection = await new Connections().findById(id);

        if (!redisConnection) {
            throw new RedisConnectionNotFound();
        }
    }
}

export default Queues;