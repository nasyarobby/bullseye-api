// this is file for default redis connection
import { Redis } from "ioredis";
const config = {
    host: '10.244.65.16',
    db: 0,
    password: 'redisdev',
    port: 6379,
    keyPrefix: "banteng:"
}

class AppRedis {
    declare static instance: Redis
    constructor() {
        if (!AppRedis.instance) {
            AppRedis.instance = new Redis(config);
        }
        return this;
    }

    get() {
        return AppRedis.instance;
    }
}

export default AppRedis;