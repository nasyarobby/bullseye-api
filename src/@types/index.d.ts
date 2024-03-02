import Ioredis from "ioredis"

type RedisConfig = {
    name: string,
    host: string,
    port: number,
    db: number,
    password?: string
}

type QueueType = {
    name: string,
    key: string,
    redis: RedisConfig
}

type RedisConnection = {
    id: string,
    redis: Ioredis,
}