// this is file for default redis connection
import { Redis, RedisOptions } from "ioredis";

class AppRedis {
    declare static instance: Redis
    constructor(config?: RedisOptions) {
        if (!AppRedis.instance) {
            if(!config) {
                throw new Error("not initiated.")
            }
            AppRedis.instance = new Redis({
                ...config, 
                enableReadyCheck: false, 
                maxRetriesPerRequest: null
            });
        }
        return this;
    }

    get() {
        return AppRedis.instance;
    }
}

export default AppRedis;