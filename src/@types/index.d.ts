import Ioredis, { RedisOptions } from "ioredis"

type RedisConfig = RedisOptions & {name: string}

type RedisConnection = {
    id: string,
    config: RedisConfig,
    redis: Ioredis,
    subscriber: Ioredis,
    bclient: Ioredis[],
}

type QueueType = {
    id: string,
    name: string,
    connectionId: string,
}

type AppConfig = {
    REDIS_DB: number,
    REDIS_PASS: string,
    REDIS_HOST: string,
    REDIS_PORT:number
}