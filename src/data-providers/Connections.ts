// data provider for redisConfigs

import Ioredis, { Redis, RedisOptions } from "ioredis";
import mapObject from "../libs/mapObject";
import { RedisConfig, RedisConnection } from "../@types";
import slugify from "slugify";
import AppRedis from "../libs/getRedis";
import { disconnect } from "process";

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

        try{
            await newRedis.connect();
        }
        catch(err) {
            
        }
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

    async updateConnection(id: string, config: RedisConfig) {
        this.disconnect(id);
        this.removeConnection(id);
        return this.addConnection(config)
    }

    async removeConnection(id: string) {
        Connections.data = Connections.data.filter(conn => conn.id !== id);
        await this.redis.hdel("redis-configs", id);
        return id;
    }

    async disconnect(id: string) {
        const conn = await this.findById(id);
        if (conn) {
            conn.redis.disconnect();
            conn.subscriber.disconnect();
            conn.bclient.forEach((conn) => {
                conn.disconnect();
            })
            conn.bclient = [];
            return id;
        }

        return null;
    }

    async connect(id: string) {
        const conn = await this.findById(id);
        if (conn) {
            conn.redis.connect();
            conn.subscriber.connect();
            return id;
        }
        return null;
    }
}

export default Connections;