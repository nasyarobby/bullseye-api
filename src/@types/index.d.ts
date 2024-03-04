import Ioredis from "ioredis"

type RedisConfig = {
    name: string,
    host: string,
    port: number,
    db: number,
    password?: string
}

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