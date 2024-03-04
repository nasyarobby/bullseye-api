import Ioredis, { RedisOptions } from "ioredis"

type RedisConfig = RedisOptions & {name: string}

type RedisConnection = {
    id: string,
    config: RedisConfig,
    redis: Ioredis,
}

type QueueType = {
    id: string,
    name: string,
    connectionId: string,
}