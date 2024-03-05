// data provider for redisConfigs

import Ioredis, { Redis, RedisOptions } from "ioredis";
import mapObject from "../libs/mapObject";
import { RedisConfig, RedisConnection } from "../@types";
import slugify from "slugify";
import AppRedis from "../libs/getRedis";

class Connections {
    declare static data: RedisConnection[];
    declare redis: Redis;
    declare static instance: Connections

    constructor() {
        if (Connections.instance) {
            return Connections.instance
        }

        this.redis = new AppRedis().get();
        Connections.data = [];

        Connections.instance = this;

        return this;
    }

    // init connections
    init() {
        this.redis.hgetall("redis-configs").then((data) => {
            mapObject(data, (o, id) => {
                const config = JSON.parse(o) as RedisConfig;
                Connections.data.push({
                    id,
                    config,
                    redis: new Ioredis({ ...config, enableReadyCheck: false, maxRetriesPerRequest: null }),
                    bclient: [],
                    subscriber: new Ioredis({ ...config, enableReadyCheck: false, maxRetriesPerRequest: null }),
                })
            })
        })
    }

    getConnections() {
        return Connections.data;
    }

    async addConnection(config: RedisConfig) {
        const newRedis = new Ioredis({ ...config, lazyConnect: true, enableReadyCheck: false, maxRetriesPerRequest: null });
        const id = slugify(config.name)

        await newRedis.connect();
        await this.redis.hset("redis-configs", id, JSON.stringify(config));

        Connections.data.push({
            id,
            config,
            redis: newRedis,
            subscriber: newRedis.duplicate(),
            bclient: []
        })
        return id;
    }

    async findById(id: string) {
        return Connections.data.find(conn => conn.id === id)
    }
}

export default Connections;